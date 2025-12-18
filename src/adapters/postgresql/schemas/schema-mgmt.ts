/**
 * postgres-mcp - Schema Management Tool Schemas
 * 
 * Input validation schemas for schema, sequence, and view management.
 */

import { z } from 'zod';

export const CreateSchemaSchema = z.object({
    name: z.string().describe('Schema name'),
    authorization: z.string().optional().describe('Owner role'),
    ifNotExists: z.boolean().optional().describe('Use IF NOT EXISTS')
});

export const DropSchemaSchema = z.object({
    name: z.string().describe('Schema name'),
    cascade: z.boolean().optional().describe('Drop objects in schema'),
    ifExists: z.boolean().optional().describe('Use IF EXISTS')
});

export const CreateSequenceSchema = z.object({
    name: z.string().describe('Sequence name'),
    schema: z.string().optional().describe('Schema name'),
    start: z.number().optional().describe('Start value'),
    increment: z.number().optional().describe('Increment'),
    minValue: z.number().optional().describe('Minimum value'),
    maxValue: z.number().optional().describe('Maximum value'),
    cycle: z.boolean().optional().describe('Cycle when limit reached')
});

export const CreateViewSchema = z.object({
    name: z.string().describe('View name'),
    schema: z.string().optional().describe('Schema name'),
    query: z.string().describe('SELECT query for view'),
    materialized: z.boolean().optional().describe('Create materialized view'),
    orReplace: z.boolean().optional().describe('Replace if exists')
});
