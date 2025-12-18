/**
 * PostgreSQL PostGIS Extension Tools - Advanced Operations
 * 
 * Advanced spatial tools: geocode, geo_transform, geo_index_optimize, geo_cluster.
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';

export function createGeocodeTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_geocode',
        description: 'Create a point geometry from latitude/longitude coordinates.',
        group: 'postgis',
        inputSchema: z.object({
            lat: z.number(),
            lng: z.number(),
            srid: z.number().optional()
        }),
        annotations: readOnly('Geocode'),
        icons: getToolIcons('postgis', readOnly('Geocode')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { lat: number; lng: number; srid?: number });
            const srid = parsed.srid ?? 4326;

            const sql = `SELECT 
                        ST_AsGeoJSON(ST_SetSRID(ST_MakePoint($1, $2), $3)) as geojson,
                        ST_AsText(ST_SetSRID(ST_MakePoint($1, $2), $3)) as wkt`;

            const result = await adapter.executeQuery(sql, [parsed.lng, parsed.lat, srid]);
            return result.rows?.[0];
        }
    };
}

/**
 * Transform geometry between coordinate systems
 */
export function createGeoTransformTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_geo_transform',
        description: 'Transform geometry from one spatial reference system (SRID) to another.',
        group: 'postgis',
        inputSchema: z.object({
            table: z.string().describe('Table name'),
            column: z.string().describe('Geometry column'),
            fromSrid: z.number().describe('Source SRID'),
            toSrid: z.number().describe('Target SRID'),
            where: z.string().optional().describe('Filter condition'),
            limit: z.number().optional().describe('Maximum rows to return')
        }),
        annotations: readOnly('Transform Geometry'),
        icons: getToolIcons('postgis', readOnly('Transform Geometry')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as {
                table: string;
                column: string;
                fromSrid: number;
                toSrid: number;
                where?: string;
                limit?: number;
            });

            const whereClause = parsed.where ? `WHERE ${parsed.where}` : '';
            const limitClause = parsed.limit !== undefined && parsed.limit > 0 ? `LIMIT ${String(parsed.limit)}` : '';

            const sql = `
                SELECT 
                    *,
                    ST_AsGeoJSON(ST_Transform(ST_SetSRID("${parsed.column}", ${String(parsed.fromSrid)}), ${String(parsed.toSrid)})) as transformed_geojson,
                    ST_AsText(ST_Transform(ST_SetSRID("${parsed.column}", ${String(parsed.fromSrid)}), ${String(parsed.toSrid)})) as transformed_wkt,
                    ${String(parsed.toSrid)} as output_srid
                FROM "${parsed.table}"
                ${whereClause}
                ${limitClause}
            `;

            const result = await adapter.executeQuery(sql);
            return {
                results: result.rows,
                count: result.rows?.length ?? 0,
                fromSrid: parsed.fromSrid,
                toSrid: parsed.toSrid
            };
        }
    };
}

/**
 * Analyze and optimize spatial indexes
 */
export function createGeoIndexOptimizeTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_geo_index_optimize',
        description: 'Analyze spatial indexes and provide optimization recommendations.',
        group: 'postgis',
        inputSchema: z.object({
            table: z.string().optional().describe('Specific table to analyze (or all spatial tables)'),
            schema: z.string().optional().describe('Schema name')
        }),
        annotations: readOnly('Geo Index Optimize'),
        icons: getToolIcons('postgis', readOnly('Geo Index Optimize')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table?: string; schema?: string });
            const schemaName = parsed.schema ?? 'public';

            const indexQuery = `
                SELECT 
                    c.relname as table_name,
                    i.relname as index_name,
                    a.attname as column_name,
                    pg_size_pretty(pg_relation_size(i.oid)) as index_size,
                    pg_relation_size(i.oid) as index_size_bytes,
                    idx_scan as index_scans,
                    idx_tup_read as tuples_read,
                    idx_tup_fetch as tuples_fetched
                FROM pg_index x
                JOIN pg_class c ON c.oid = x.indrelid
                JOIN pg_class i ON i.oid = x.indexrelid
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(x.indkey)
                JOIN pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
                WHERE n.nspname = $1
                AND (pg_get_indexdef(i.oid) LIKE '%gist%' OR pg_get_indexdef(i.oid) LIKE '%spgist%')
                ${parsed.table ? `AND c.relname = '${parsed.table}'` : ''}
                ORDER BY index_size_bytes DESC
            `;

            const [indexes, tableStats] = await Promise.all([
                adapter.executeQuery(indexQuery, [schemaName]),
                adapter.executeQuery(`
                    SELECT 
                        c.relname as table_name,
                        n_live_tup as row_count,
                        pg_size_pretty(pg_table_size(c.oid)) as table_size
                    FROM pg_stat_user_tables t
                    JOIN pg_class c ON c.relname = t.relname
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1
                    ${parsed.table ? `AND c.relname = '${parsed.table}'` : ''}
                `, [schemaName])
            ]);

            const recommendations: string[] = [];

            for (const idx of (indexes.rows ?? [])) {
                const scans = Number(idx['index_scans'] ?? 0);
                const sizeBytes = Number(idx['index_size_bytes'] ?? 0);

                if (scans === 0 && sizeBytes > 1024 * 1024) {
                    recommendations.push(`Index "${String(idx['index_name'])}" on ${String(idx['table_name'])} is unused but takes ${String(idx['index_size'])}. Consider dropping it.`);
                }
                if (scans > 0 && sizeBytes > 100 * 1024 * 1024) {
                    recommendations.push(`Large spatial index "${String(idx['index_name'])}" (${String(idx['index_size'])}). Consider partitioning the table for better performance.`);
                }
            }

            for (const table of (tableStats.rows ?? [])) {
                const rowCount = Number(table['row_count'] ?? 0);
                const hasIndex = (indexes.rows ?? []).some(idx => idx['table_name'] === table['table_name']);

                if (rowCount > 10000 && !hasIndex) {
                    recommendations.push(`Table "${String(table['table_name'])}" has ${String(rowCount)} rows but no spatial index. Consider adding a GiST index.`);
                }
            }

            return {
                spatialIndexes: indexes.rows,
                tableStats: tableStats.rows,
                recommendations: recommendations.length > 0 ? recommendations : ['All spatial indexes appear optimized'],
                tips: [
                    'Use GiST indexes for general spatial queries',
                    'Consider SP-GiST for point-only data',
                    'CLUSTER table by spatial index for range queries',
                    'Use BRIN indexes for very large, sorted spatial data'
                ]
            };
        }
    };
}

/**
 * Spatial clustering using ST_ClusterDBSCAN or ST_ClusterKMeans
 */
export function createGeoClusterTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_geo_cluster',
        description: 'Perform spatial clustering on geometry data using DBSCAN or K-Means.',
        group: 'postgis',
        inputSchema: z.object({
            table: z.string().describe('Table name'),
            column: z.string().describe('Geometry column name'),
            method: z.enum(['dbscan', 'kmeans']).optional().describe('Clustering method (default: dbscan)'),
            eps: z.number().optional().describe('DBSCAN: Distance threshold'),
            minPoints: z.number().optional().describe('DBSCAN: Minimum points per cluster'),
            numClusters: z.number().optional().describe('K-Means: Number of clusters'),
            schema: z.string().optional(),
            where: z.string().optional().describe('WHERE clause filter'),
            limit: z.number().optional()
        }),
        annotations: readOnly('Geo Cluster'),
        icons: getToolIcons('postgis', readOnly('Geo Cluster')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as {
                table: string;
                column: string;
                method?: string;
                eps?: number;
                minPoints?: number;
                numClusters?: number;
                schema?: string;
                where?: string;
                limit?: number;
            });

            const method = parsed.method ?? 'dbscan';
            const schemaName = parsed.schema ?? 'public';
            const whereClause = parsed.where ? `WHERE ${parsed.where}` : '';
            const limitClause = parsed.limit !== undefined && parsed.limit > 0 ? `LIMIT ${String(parsed.limit)}` : '';

            let clusterFunction: string;
            if (method === 'kmeans') {
                const numClusters = parsed.numClusters ?? 5;
                clusterFunction = `ST_ClusterKMeans("${parsed.column}", ${String(numClusters)}) OVER ()`;
            } else {
                const eps = parsed.eps ?? 100;
                const minPoints = parsed.minPoints ?? 3;
                clusterFunction = `ST_ClusterDBSCAN("${parsed.column}", ${String(eps)}, ${String(minPoints)}) OVER ()`;
            }

            const sql = `
                WITH clustered AS (
                    SELECT 
                        *,
                        ${clusterFunction} as cluster_id
                    FROM "${schemaName}"."${parsed.table}"
                    ${whereClause}
                )
                SELECT 
                    cluster_id,
                    COUNT(*) as point_count,
                    ST_AsGeoJSON(ST_Centroid(ST_Collect("${parsed.column}"))) as centroid,
                    ST_AsGeoJSON(ST_ConvexHull(ST_Collect("${parsed.column}"))) as hull
                FROM clustered
                WHERE cluster_id IS NOT NULL
                GROUP BY cluster_id
                ORDER BY point_count DESC
                ${limitClause}
            `;

            const [clusters, summary] = await Promise.all([
                adapter.executeQuery(sql),
                adapter.executeQuery(`
                    WITH clustered AS (
                        SELECT ${clusterFunction} as cluster_id
                        FROM "${schemaName}"."${parsed.table}"
                        ${whereClause}
                    )
                    SELECT 
                        COUNT(DISTINCT cluster_id) as num_clusters,
                        COUNT(*) FILTER (WHERE cluster_id IS NULL) as noise_points,
                        COUNT(*) as total_points
                    FROM clustered
                `)
            ]);

            return {
                method,
                parameters: method === 'kmeans'
                    ? { numClusters: parsed.numClusters ?? 5 }
                    : { eps: parsed.eps ?? 100, minPoints: parsed.minPoints ?? 3 },
                summary: summary.rows?.[0],
                clusters: clusters.rows,
                notes: method === 'dbscan'
                    ? 'Noise points (cluster_id = NULL) are points not belonging to any cluster'
                    : 'K-Means will always assign all points to a cluster'
            };
        }
    };
}
