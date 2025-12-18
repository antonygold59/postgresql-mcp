/**
 * postgres-mcp - JSONB Tool Schemas
 * 
 * Input validation schemas for JSONB operations.
 */

import { z } from 'zod';

export const JsonbExtractSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('JSONB column name'),
    path: z.string().describe('JSON path (e.g., "$.key" or "{key,subkey}")'),
    where: z.string().optional().describe('WHERE clause')
});

export const JsonbSetSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('JSONB column name'),
    path: z.array(z.string()).describe('Path as array of keys'),
    value: z.unknown().describe('Value to set (will be converted to JSONB)'),
    where: z.string().describe('WHERE clause to identify rows'),
    createMissing: z.boolean().optional().describe('Create path if missing')
});

export const JsonbContainsSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('JSONB column name'),
    value: z.unknown().describe('Value to check containment'),
    select: z.array(z.string()).optional().describe('Columns to select')
});

export const JsonbPathQuerySchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('JSONB column name'),
    path: z.string().describe('JSONPath expression'),
    vars: z.record(z.string(), z.unknown()).optional().describe('Variables for JSONPath'),
    where: z.string().optional().describe('WHERE clause')
});
