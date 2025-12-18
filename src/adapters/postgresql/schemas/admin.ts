/**
 * postgres-mcp - Admin Tool Schemas
 * 
 * Input validation schemas for database administration operations.
 */

import { z } from 'zod';

export const VacuumSchema = z.object({
    table: z.string().optional().describe('Table name (all tables if omitted)'),
    schema: z.string().optional().describe('Schema name'),
    full: z.boolean().optional().describe('Full vacuum (rewrites table)'),
    analyze: z.boolean().optional().describe('Update statistics'),
    verbose: z.boolean().optional().describe('Print progress')
});

export const AnalyzeSchema = z.object({
    table: z.string().optional().describe('Table name (all tables if omitted)'),
    schema: z.string().optional().describe('Schema name'),
    columns: z.array(z.string()).optional().describe('Specific columns to analyze')
});

export const ReindexSchema = z.object({
    target: z.enum(['table', 'index', 'schema', 'database']).describe('What to reindex'),
    name: z.string().describe('Name of table/index/schema'),
    concurrently: z.boolean().optional().describe('Reindex concurrently')
});

export const TerminateBackendSchema = z.object({
    pid: z.number().describe('Process ID to terminate')
});

export const CancelBackendSchema = z.object({
    pid: z.number().describe('Process ID to cancel')
});
