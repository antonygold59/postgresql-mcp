/**
 * postgres-mcp - Backup Tool Schemas
 * 
 * Input validation schemas for backup and export operations.
 */

import { z } from 'zod';

export const CopyExportSchema = z.object({
    query: z.string().describe('SELECT query for data to export'),
    format: z.enum(['csv', 'text', 'binary']).optional().describe('Output format'),
    header: z.boolean().optional().describe('Include header row'),
    delimiter: z.string().optional().describe('Field delimiter')
});

export const DumpSchemaSchema = z.object({
    table: z.string().optional().describe('Table name'),
    schema: z.string().optional().describe('Schema name')
});
