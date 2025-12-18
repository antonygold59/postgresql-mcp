/**
 * PostgreSQL PostGIS Extension Tools
 * 
 * Geospatial operations and spatial queries.
 * 12 tools total.
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition } from '../../../../types/index.js';

// Basic spatial operations
import {
    createPostgisExtensionTool,
    createGeometryColumnTool,
    createPointInPolygonTool,
    createDistanceTool,
    createBufferTool,
    createIntersectionTool,
    createBoundingBoxTool,
    createSpatialIndexTool
} from './basic.js';

// Advanced spatial operations
import {
    createGeocodeTool,
    createGeoTransformTool,
    createGeoIndexOptimizeTool,
    createGeoClusterTool
} from './advanced.js';

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
        createGeocodeTool(adapter),
        createGeoTransformTool(adapter),
        createGeoIndexOptimizeTool(adapter),
        createGeoClusterTool(adapter)
    ];
}

// Re-export individual tool creators
export {
    createPostgisExtensionTool,
    createGeometryColumnTool,
    createPointInPolygonTool,
    createDistanceTool,
    createBufferTool,
    createIntersectionTool,
    createBoundingBoxTool,
    createSpatialIndexTool,
    createGeocodeTool,
    createGeoTransformTool,
    createGeoIndexOptimizeTool,
    createGeoClusterTool
};
