/**
 * PostgreSQL Core Tools - Additional Schemas
 * 
 * Schemas that are defined in core tools but not in the main schemas directory.
 */

import { z } from 'zod';

export const ListObjectsSchema = z.object({
    schema: z.string().optional().describe('Schema name (default: all user schemas)'),
    types: z.array(z.enum(['table', 'view', 'materialized_view', 'function', 'procedure', 'sequence', 'index', 'trigger'])).optional().describe('Object types to include')
});

export const ObjectDetailsSchema = z.object({
    name: z.string().describe('Object name'),
    schema: z.string().optional().describe('Schema name (default: public)'),
    type: z.enum(['table', 'view', 'function', 'sequence', 'index']).optional().describe('Object type hint')
});

export const AnalyzeDbHealthSchema = z.object({
    includeIndexes: z.boolean().optional().describe('Include index health analysis'),
    includeVacuum: z.boolean().optional().describe('Include vacuum/bloat analysis'),
    includeConnections: z.boolean().optional().describe('Include connection analysis')
});

export const AnalyzeWorkloadIndexesSchema = z.object({
    topQueries: z.number().optional().describe('Number of top queries to analyze (default: 20)'),
    minCalls: z.number().optional().describe('Minimum call count threshold')
});

export const AnalyzeQueryIndexesSchema = z.object({
    sql: z.string().describe('Query to analyze for index recommendations'),
    params: z.array(z.unknown()).optional().describe('Query parameters')
});
