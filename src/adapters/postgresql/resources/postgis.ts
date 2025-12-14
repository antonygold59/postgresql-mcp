/**
 * PostGIS Status Resource
 * 
 * Provides PostGIS extension status, spatial columns, and index information.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition } from '../../../types/index.js';

/** Safely convert unknown value to string */
function toStr(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

interface SpatialColumn {
    schema: string;
    table: string;
    column: string;
    type: string;
    srid: number;
    dimensions: number;
    rowCount: number;
}

interface SpatialIndex {
    schema: string;
    table: string;
    indexName: string;
    column: string;
    indexType: string;
    size: string;
}

interface PostgisResourceData {
    extensionInstalled: boolean;
    extensionVersion: string | null;
    fullVersion: string | null;
    spatialColumns: SpatialColumn[];
    columnCount: number;
    geometryCount: number;
    geographyCount: number;
    indexes: SpatialIndex[];
    indexCount: number;
    unindexedColumns: string[];
    sridDistribution: { srid: number; count: number }[];
    recommendations: string[];
}

export function createPostgisResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://postgis',
        name: 'PostGIS Status',
        description: 'PostGIS extension status, spatial columns, index usage, and optimization recommendations',
        mimeType: 'application/json',
        handler: async (): Promise<string> => {
            const result: PostgisResourceData = {
                extensionInstalled: false,
                extensionVersion: null,
                fullVersion: null,
                spatialColumns: [],
                columnCount: 0,
                geometryCount: 0,
                geographyCount: 0,
                indexes: [],
                indexCount: 0,
                unindexedColumns: [],
                sridDistribution: [],
                recommendations: []
            };

            try {
                // Check if PostGIS is installed
                const extCheck = await adapter.executeQuery(
                    `SELECT extversion FROM pg_extension WHERE extname = 'postgis'`
                );

                if (!extCheck.rows || extCheck.rows.length === 0) {
                    result.recommendations.push('PostGIS extension is not installed. Use pg_postgis_create_extension to enable geospatial operations.');
                    return JSON.stringify(result, null, 2);
                }

                result.extensionInstalled = true;
                const extVersion = extCheck.rows[0]?.['extversion'];
                result.extensionVersion = typeof extVersion === 'string' ? extVersion : null;

                // Get full PostGIS version info
                try {
                    const versionResult = await adapter.executeQuery(
                        `SELECT PostGIS_Full_Version() as version`
                    );
                    const fullVersion = versionResult.rows?.[0]?.['version'];
                    result.fullVersion = typeof fullVersion === 'string' ? fullVersion : null;
                } catch {
                    // Function might not exist in older versions
                }

                // Get spatial columns from geometry_columns view
                const columnsResult = await adapter.executeQuery(
                    `SELECT 
                        gc.f_table_schema,
                        gc.f_table_name,
                        gc.f_geometry_column,
                        gc.type,
                        gc.srid,
                        gc.coord_dimension,
                        COALESCE(s.n_live_tup, 0)::int as row_count
                     FROM geometry_columns gc
                     LEFT JOIN pg_stat_user_tables s 
                        ON s.schemaname = gc.f_table_schema 
                        AND s.relname = gc.f_table_name
                     ORDER BY gc.f_table_schema, gc.f_table_name`
                );

                if (columnsResult.rows) {
                    for (const row of columnsResult.rows) {
                        result.spatialColumns.push({
                            schema: toStr(row['f_table_schema']),
                            table: toStr(row['f_table_name']),
                            column: toStr(row['f_geometry_column']),
                            type: toStr(row['type']),
                            srid: Number(row['srid'] ?? 0),
                            dimensions: Number(row['coord_dimension'] ?? 2),
                            rowCount: Number(row['row_count'] ?? 0)
                        });
                    }
                }

                // Also check geography columns
                try {
                    const geoColumnsResult = await adapter.executeQuery(
                        `SELECT 
                            gc.f_table_schema,
                            gc.f_table_name,
                            gc.f_geography_column,
                            gc.type,
                            gc.srid,
                            gc.coord_dimension,
                            COALESCE(s.n_live_tup, 0)::int as row_count
                         FROM geography_columns gc
                         LEFT JOIN pg_stat_user_tables s 
                            ON s.schemaname = gc.f_table_schema 
                            AND s.relname = gc.f_table_name
                         ORDER BY gc.f_table_schema, gc.f_table_name`
                    );

                    if (geoColumnsResult.rows) {
                        for (const row of geoColumnsResult.rows) {
                            const geoType = toStr(row['type']);
                            result.spatialColumns.push({
                                schema: toStr(row['f_table_schema']),
                                table: toStr(row['f_table_name']),
                                column: toStr(row['f_geography_column']),
                                type: `geography(${geoType})`,
                                srid: Number(row['srid'] ?? 4326),
                                dimensions: Number(row['coord_dimension'] ?? 2),
                                rowCount: Number(row['row_count'] ?? 0)
                            });
                            result.geographyCount++;
                        }
                    }
                } catch {
                    // geography_columns might not exist
                }

                result.columnCount = result.spatialColumns.length;
                result.geometryCount = result.columnCount - result.geographyCount;

                // Get spatial indexes (GiST on geometry/geography columns)
                const indexResult = await adapter.executeQuery(
                    `SELECT 
                        n.nspname as schema_name,
                        t.relname as table_name,
                        i.relname as index_name,
                        a.attname as column_name,
                        am.amname as index_type,
                        pg_size_pretty(pg_relation_size(i.oid)) as index_size
                     FROM pg_index idx
                     JOIN pg_class i ON idx.indexrelid = i.oid
                     JOIN pg_class t ON idx.indrelid = t.oid
                     JOIN pg_namespace n ON t.relnamespace = n.oid
                     JOIN pg_am am ON i.relam = am.oid
                     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(idx.indkey)
                     JOIN pg_type ty ON a.atttypid = ty.oid
                     WHERE am.amname IN ('gist', 'spgist', 'brin')
                       AND ty.typname IN ('geometry', 'geography')
                       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                     ORDER BY n.nspname, t.relname, i.relname`
                );

                if (indexResult.rows) {
                    for (const row of indexResult.rows) {
                        result.indexes.push({
                            schema: toStr(row['schema_name']),
                            table: toStr(row['table_name']),
                            indexName: toStr(row['index_name']),
                            column: toStr(row['column_name']),
                            indexType: toStr(row['index_type']),
                            size: toStr(row['index_size']) || '0 bytes'
                        });
                    }
                }
                result.indexCount = result.indexes.length;

                // Find unindexed spatial columns
                const indexedColumns = new Set(
                    result.indexes.map(i => `${i.schema}.${i.table}.${i.column}`)
                );

                result.unindexedColumns = result.spatialColumns
                    .filter(c => !indexedColumns.has(`${c.schema}.${c.table}.${c.column}`))
                    .map(c => `${c.schema}.${c.table}.${c.column}`);

                // SRID distribution
                const sridCounts = new Map<number, number>();
                for (const col of result.spatialColumns) {
                    sridCounts.set(col.srid, (sridCounts.get(col.srid) ?? 0) + 1);
                }
                result.sridDistribution = Array.from(sridCounts.entries())
                    .map(([srid, count]) => ({ srid, count }))
                    .sort((a, b) => b.count - a.count);

                // Generate recommendations
                if (result.columnCount === 0) {
                    result.recommendations.push('No spatial columns found. Use pg_geometry_column to add geometry/geography columns.');
                }

                if (result.unindexedColumns.length > 0) {
                    result.recommendations.push(`${String(result.unindexedColumns.length)} spatial columns without GiST indexes. Use pg_spatial_index for better query performance.`);
                }

                for (const col of result.spatialColumns) {
                    if (col.rowCount > 10000 && result.unindexedColumns.includes(`${col.schema}.${col.table}.${col.column}`)) {
                        result.recommendations.push(`Large unindexed spatial column: ${col.table}.${col.column} (${String(col.rowCount)} rows). GiST index strongly recommended.`);
                    }
                }

                if (result.geometryCount > 0 && result.geographyCount === 0) {
                    result.recommendations.push('Only geometry columns found. Consider geography type for global distance calculations.');
                }

                // Check for SRID 0 (unknown)
                const unknownSrid = result.spatialColumns.filter(c => c.srid === 0);
                if (unknownSrid.length > 0) {
                    result.recommendations.push(`${String(unknownSrid.length)} columns with SRID 0 (unknown). Set proper SRID for accurate calculations.`);
                }

            } catch {
                result.recommendations.push('Error accessing PostGIS information. Ensure extension is properly installed.');
            }

            return JSON.stringify(result, null, 2);
        }
    };
}
