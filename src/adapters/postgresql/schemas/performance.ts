/**
 * postgres-mcp - Performance Tool Schemas
 * 
 * Input validation schemas for query analysis and performance monitoring.
 */

import { z } from 'zod';

export const ExplainSchema = z.object({
    sql: z.string().describe('Query to explain'),
    params: z.array(z.unknown()).optional().describe('Query parameters'),
    analyze: z.boolean().optional().describe('Run EXPLAIN ANALYZE'),
    buffers: z.boolean().optional().describe('Include buffer usage'),
    format: z.enum(['text', 'json', 'xml', 'yaml']).optional().describe('Output format')
});

export const IndexStatsSchema = z.object({
    table: z.string().optional().describe('Table name (all tables if omitted)'),
    schema: z.string().optional().describe('Schema name')
});

export const TableStatsSchema = z.object({
    table: z.string().optional().describe('Table name (all tables if omitted)'),
    schema: z.string().optional().describe('Schema name')
});
