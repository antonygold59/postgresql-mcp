/**
 * postgres-mcp - Monitoring Tool Schemas
 * 
 * Input validation schemas for database monitoring.
 */

import { z } from 'zod';

export const DatabaseSizeSchema = z.object({
    database: z.string().optional().describe('Database name (current if omitted)')
});

export const TableSizesSchema = z.object({
    schema: z.string().optional().describe('Schema name'),
    limit: z.number().optional().describe('Max tables to return')
});

export const ShowSettingsSchema = z.object({
    pattern: z.string().optional().describe('Setting name pattern (LIKE)')
});
