/**
 * PostgreSQL PostGIS Extension Tools
 * 
 * Geospatial operations and spatial queries.
 * 9 tools total.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../types/index.js';
import { z } from 'zod';
import { GeometryDistanceSchema, PointInPolygonSchema, SpatialIndexSchema } from '../types.js';

/**
 * Get all PostGIS tools
 */
export function getPostgisTools(adapter: PostgresAdapter): ToolDefinition[] {
    return [
        createPostgisExtensionTool(adapter),
        createGeometryColumnTool(adapter),
        createPointInPolygonTool(adapter),
        createDistanceTool(adapter),
        createBufferTool(adapter),
        createIntersectionTool(adapter),
        createBoundingBoxTool(adapter),
        createSpatialIndexTool(adapter),
        createGeocodeTool(adapter)
    ];
}

function createPostgisExtensionTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_postgis_create_extension',
        description: 'Enable the PostGIS extension for geospatial operations.',
        group: 'postgis',
        inputSchema: z.object({}),
        handler: async (_params: unknown, _context: RequestContext) => {
            await adapter.executeQuery('CREATE EXTENSION IF NOT EXISTS postgis');
            return { success: true, message: 'PostGIS extension enabled' };
        }
    };
}

function createGeometryColumnTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_geometry_column',
        description: 'Add a geometry column to a table.',
        group: 'postgis',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            srid: z.number().optional().describe('Spatial Reference ID (default: 4326 for WGS84)'),
            type: z.enum(['POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRY']).optional(),
            schema: z.string().optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as {
                table: string;
                column: string;
                srid?: number;
                type?: string;
                schema?: string;
            });

            const schemaName = parsed.schema ?? 'public';
            const srid = parsed.srid ?? 4326;
            const geomType = parsed.type ?? 'GEOMETRY';

            const sql = `SELECT AddGeometryColumn('${schemaName}', '${parsed.table}', '${parsed.column}', ${String(srid)}, '${geomType}', 2)`;
            await adapter.executeQuery(sql);

            return { success: true, table: parsed.table, column: parsed.column, srid, type: geomType };
        }
    };
}

function createPointInPolygonTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_point_in_polygon',
        description: 'Check if a point is within any polygon in a table.',
        group: 'postgis',
        inputSchema: PointInPolygonSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, point } = PointInPolygonSchema.parse(params);

            const sql = `SELECT *, ST_AsText("${column}") as geometry_text
                        FROM "${table}"
                        WHERE ST_Contains("${column}", ST_SetSRID(ST_MakePoint($1, $2), 4326))`;

            const result = await adapter.executeQuery(sql, [point.lng, point.lat]);
            return { containingPolygons: result.rows, count: result.rows?.length ?? 0 };
        }
    };
}

function createDistanceTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_distance',
        description: 'Find nearby geometries within a distance from a point.',
        group: 'postgis',
        inputSchema: GeometryDistanceSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, point, limit, maxDistance } = GeometryDistanceSchema.parse(params);

            const limitVal = limit ?? 10;
            const distanceFilter = maxDistance !== undefined && maxDistance > 0 ? `AND ST_Distance(${column}::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) <= ${String(maxDistance)}` : '';

            const sql = `SELECT *, 
                        ST_Distance("${column}"::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance_meters
                        FROM "${table}"
                        WHERE TRUE ${distanceFilter}
                        ORDER BY "${column}" <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
                        LIMIT ${String(limitVal)}`;

            const result = await adapter.executeQuery(sql, [point.lng, point.lat]);
            return { results: result.rows, count: result.rows?.length ?? 0 };
        }
    };
}

function createBufferTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_buffer',
        description: 'Create a buffer zone around geometries.',
        group: 'postgis',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            distance: z.number().describe('Buffer distance in meters'),
            where: z.string().optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; distance: number; where?: string });
            const whereClause = parsed.where ? ` WHERE ${parsed.where}` : '';

            const sql = `SELECT *, ST_AsGeoJSON(ST_Buffer("${parsed.column}"::geography, $1)::geometry) as buffer_geojson
                        FROM "${parsed.table}"${whereClause}`;

            const result = await adapter.executeQuery(sql, [parsed.distance]);
            return { results: result.rows };
        }
    };
}

function createIntersectionTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_intersection',
        description: 'Find geometries that intersect with a given geometry.',
        group: 'postgis',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            geometry: z.string().describe('GeoJSON or WKT geometry to check intersection'),
            select: z.array(z.string()).optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; geometry: string; select?: string[] });
            const selectCols = parsed.select !== undefined && parsed.select.length > 0 ? parsed.select.map(c => `"${c}"`).join(', ') : '*';

            // Detect if geometry is GeoJSON or WKT
            const isGeoJson = parsed.geometry.trim().startsWith('{');
            const geomExpr = isGeoJson
                ? `ST_GeomFromGeoJSON($1)`
                : `ST_GeomFromText($1)`;

            const sql = `SELECT ${selectCols}
                        FROM "${parsed.table}"
                        WHERE ST_Intersects("${parsed.column}", ${geomExpr})`;

            const result = await adapter.executeQuery(sql, [parsed.geometry]);
            return { intersecting: result.rows, count: result.rows?.length ?? 0 };
        }
    };
}

function createBoundingBoxTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_bounding_box',
        description: 'Find geometries within a bounding box.',
        group: 'postgis',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            minLng: z.number(),
            minLat: z.number(),
            maxLng: z.number(),
            maxLat: z.number(),
            select: z.array(z.string()).optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as {
                table: string;
                column: string;
                minLng: number;
                minLat: number;
                maxLng: number;
                maxLat: number;
                select?: string[];
            });

            const selectCols = parsed.select !== undefined && parsed.select.length > 0 ? parsed.select.map(c => `"${c}"`).join(', ') : '*';

            const sql = `SELECT ${selectCols}
                        FROM "${parsed.table}"
                        WHERE "${parsed.column}" && ST_MakeEnvelope($1, $2, $3, $4, 4326)`;

            const result = await adapter.executeQuery(sql, [
                parsed.minLng, parsed.minLat, parsed.maxLng, parsed.maxLat
            ]);
            return { results: result.rows, count: result.rows?.length ?? 0 };
        }
    };
}

function createSpatialIndexTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_spatial_index',
        description: 'Create a GiST spatial index for geometry column.',
        group: 'postgis',
        inputSchema: SpatialIndexSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, name } = SpatialIndexSchema.parse(params);
            const indexName = name ?? `idx_${table}_${column}_gist`;

            const sql = `CREATE INDEX "${indexName}" ON "${table}" USING GIST ("${column}")`;
            await adapter.executeQuery(sql);
            return { success: true, index: indexName, table, column };
        }
    };
}

function createGeocodeTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_geocode',
        description: 'Create a point geometry from latitude/longitude coordinates.',
        group: 'postgis',
        inputSchema: z.object({
            lat: z.number(),
            lng: z.number(),
            srid: z.number().optional()
        }),
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
