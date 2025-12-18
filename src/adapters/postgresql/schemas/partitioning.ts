/**
 * postgres-mcp - Partitioning Tool Schemas
 * 
 * Input validation schemas for table partitioning.
 */

import { z } from 'zod';

export const CreatePartitionedTableSchema = z.object({
    name: z.string().describe('Table name'),
    schema: z.string().optional().describe('Schema name'),
    columns: z.array(z.object({
        name: z.string(),
        type: z.string(),
        nullable: z.boolean().optional()
    })).describe('Column definitions'),
    partitionBy: z.enum(['range', 'list', 'hash']).describe('Partition strategy'),
    partitionKey: z.string().describe('Partition key column(s)')
});

export const CreatePartitionSchema = z.object({
    parent: z.string().describe('Parent table name'),
    name: z.string().describe('Partition name'),
    schema: z.string().optional().describe('Schema name'),
    forValues: z.string().describe('Partition bounds (e.g., "FROM (\'2024-01-01\') TO (\'2024-02-01\')")')
});

export const AttachPartitionSchema = z.object({
    parent: z.string().describe('Parent table name'),
    partition: z.string().describe('Table to attach'),
    forValues: z.string().describe('Partition bounds')
});

export const DetachPartitionSchema = z.object({
    parent: z.string().describe('Parent table name'),
    partition: z.string().describe('Partition to detach'),
    concurrently: z.boolean().optional().describe('Detach concurrently')
});
