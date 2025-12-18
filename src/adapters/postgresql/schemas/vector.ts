/**
 * postgres-mcp - pgvector Tool Schemas
 * 
 * Input validation schemas for vector similarity search.
 */

import { z } from 'zod';

export const VectorSearchSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('Vector column name'),
    vector: z.array(z.number()).describe('Query vector'),
    metric: z.enum(['l2', 'cosine', 'inner_product']).optional().describe('Distance metric'),
    limit: z.number().optional().describe('Number of results'),
    select: z.array(z.string()).optional().describe('Additional columns to return'),
    where: z.string().optional().describe('Filter condition')
});

export const VectorCreateIndexSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('Vector column name'),
    type: z.enum(['ivfflat', 'hnsw']).describe('Index type'),
    lists: z.number().optional().describe('Number of lists for IVFFlat'),
    m: z.number().optional().describe('HNSW m parameter'),
    efConstruction: z.number().optional().describe('HNSW ef_construction parameter')
});
