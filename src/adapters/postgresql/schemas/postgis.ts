/**
 * postgres-mcp - PostGIS Tool Schemas
 * 
 * Input validation schemas for geospatial operations.
 */

import { z } from 'zod';

export const GeometryDistanceSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('Geometry column'),
    point: z.object({
        lat: z.number(),
        lng: z.number()
    }).describe('Reference point'),
    limit: z.number().optional().describe('Max results'),
    maxDistance: z.number().optional().describe('Max distance in meters')
});

export const PointInPolygonSchema = z.object({
    table: z.string().describe('Table with polygons'),
    column: z.string().describe('Geometry column'),
    point: z.object({
        lat: z.number(),
        lng: z.number()
    }).describe('Point to check')
});

export const SpatialIndexSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('Geometry column'),
    name: z.string().optional().describe('Index name')
});
