/**
 * PostgreSQL pgvector - Advanced Operations
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';

export function createVectorClusterTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_vector_cluster',
        description: 'Perform K-means clustering on vectors in a table. Returns cluster centroids and assignments.',
        group: 'vector',
        inputSchema: z.object({
            table: z.string().describe('Table name'),
            column: z.string().describe('Vector column'),
            k: z.number().describe('Number of clusters'),
            iterations: z.number().optional().describe('Max iterations (default: 10)'),
            sampleSize: z.number().optional().describe('Sample size for large tables')
        }),
        annotations: readOnly('Vector Cluster'),
        icons: getToolIcons('vector', readOnly('Vector Cluster')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as {
                table: string;
                column: string;
                k: number;
                iterations?: number;
                sampleSize?: number;
            });
            const maxIter = parsed.iterations ?? 10;
            const sample = parsed.sampleSize ?? 10000;

            const sampleSql = `
                SELECT "${parsed.column}" as vec 
                FROM "${parsed.table}" 
                WHERE "${parsed.column}" IS NOT NULL
                ORDER BY RANDOM() 
                LIMIT ${String(sample)}
            `;
            const sampleResult = await adapter.executeQuery(sampleSql);
            const vectors = (sampleResult.rows ?? []) as { vec: string }[];

            if (vectors.length < parsed.k) {
                return { error: `Not enough vectors (${String(vectors.length)}) for ${String(parsed.k)} clusters` };
            }

            const initialCentroids = vectors.slice(0, parsed.k).map(v => v.vec);

            const clusterSql = `
                WITH sample_vectors AS (
                    SELECT ROW_NUMBER() OVER () as id, "${parsed.column}" as vec
                    FROM "${parsed.table}"
                    WHERE "${parsed.column}" IS NOT NULL
                    LIMIT ${String(sample)}
                ),
                centroids AS (
                    SELECT unnest($1::vector[]) as centroid
                )
                SELECT 
                    c.centroid,
                    COUNT(*) as cluster_size,
                    AVG(s.vec) as new_centroid
                FROM sample_vectors s
                CROSS JOIN LATERAL (
                    SELECT centroid, ROW_NUMBER() OVER (ORDER BY s.vec <-> centroid) as rn
                    FROM centroids
                ) c
                WHERE c.rn = 1
                GROUP BY c.centroid
            `;

            let centroids = initialCentroids;
            for (let i = 0; i < maxIter; i++) {
                try {
                    const result = await adapter.executeQuery(clusterSql, [centroids]);
                    centroids = (result.rows ?? []).map((r: Record<string, unknown>) => r['new_centroid'] as string);
                } catch {
                    break;
                }
            }

            return {
                k: parsed.k,
                iterations: maxIter,
                sampleSize: vectors.length,
                centroids: centroids.map(c => ({ vector: c })),
                note: 'For production clustering, consider using specialized libraries'
            };
        }
    };
}

export function createVectorIndexOptimizeTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_vector_index_optimize',
        description: 'Analyze vector column and recommend optimal index parameters for IVFFlat/HNSW.',
        group: 'vector',
        inputSchema: z.object({
            table: z.string().describe('Table name'),
            column: z.string().describe('Vector column')
        }),
        annotations: readOnly('Vector Index Optimize'),
        icons: getToolIcons('vector', readOnly('Vector Index Optimize')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string });

            const statsSql = `
                SELECT 
                    reltuples::bigint as estimated_rows,
                    pg_size_pretty(pg_total_relation_size('"${parsed.table}"'::regclass)) as table_size
                FROM pg_class WHERE relname = $1
            `;
            const statsResult = await adapter.executeQuery(statsSql, [parsed.table]);
            const stats = (statsResult.rows?.[0] ?? {}) as { estimated_rows: number; table_size: string };

            const dimSql = `
                SELECT vector_dims("${parsed.column}") as dimensions
                FROM "${parsed.table}"
                WHERE "${parsed.column}" IS NOT NULL
                LIMIT 1
            `;
            const dimResult = await adapter.executeQuery(dimSql);
            const dimensions = (dimResult.rows?.[0] as { dimensions: number } | undefined)?.dimensions;

            const indexSql = `
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = $1
                AND indexdef LIKE '%vector%'
            `;
            const indexResult = await adapter.executeQuery(indexSql, [parsed.table]);

            const rows = stats.estimated_rows ?? 0;
            const recommendations = [];

            if (rows < 10000) {
                recommendations.push({
                    type: 'none',
                    reason: 'Table is small enough for brute force search'
                });
            } else if (rows < 100000) {
                recommendations.push({
                    type: 'ivfflat',
                    lists: Math.min(100, Math.round(Math.sqrt(rows))),
                    reason: 'IVFFlat recommended for medium tables'
                });
            } else {
                recommendations.push({
                    type: 'hnsw',
                    m: dimensions !== undefined && dimensions > 768 ? 32 : 16,
                    efConstruction: 64,
                    reason: 'HNSW recommended for large tables with high recall'
                });
                recommendations.push({
                    type: 'ivfflat',
                    lists: Math.round(Math.sqrt(rows)),
                    reason: 'IVFFlat is faster to build but lower recall'
                });
            }

            return {
                table: parsed.table,
                column: parsed.column,
                dimensions,
                estimatedRows: rows,
                tableSize: stats.table_size,
                existingIndexes: indexResult.rows,
                recommendations
            };
        }
    };
}

export function createHybridSearchTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_hybrid_search',
        description: 'Combined vector similarity and full-text search with weighted scoring.',
        group: 'vector',
        inputSchema: z.object({
            table: z.string().describe('Table name'),
            vectorColumn: z.string().describe('Vector column'),
            textColumn: z.string().describe('Text column for FTS'),
            vector: z.array(z.number()).describe('Query vector'),
            textQuery: z.string().describe('Text search query'),
            vectorWeight: z.number().optional().describe('Weight for vector score (0-1, default: 0.5)'),
            limit: z.number().optional().describe('Max results')
        }),
        annotations: readOnly('Hybrid Search'),
        icons: getToolIcons('vector', readOnly('Hybrid Search')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as {
                table: string;
                vectorColumn: string;
                textColumn: string;
                vector: number[];
                textQuery: string;
                vectorWeight?: number;
                limit?: number;
            });

            const vectorWeight = parsed.vectorWeight ?? 0.5;
            const textWeight = 1 - vectorWeight;
            const limitVal = parsed.limit ?? 10;
            const vectorStr = `[${parsed.vector.join(',')}]`;

            const sql = `
                WITH vector_scores AS (
                    SELECT 
                        ctid,
                        1 - ("${parsed.vectorColumn}" <=> '${vectorStr}'::vector) as vector_score
                    FROM "${parsed.table}"
                    WHERE "${parsed.vectorColumn}" IS NOT NULL
                    ORDER BY "${parsed.vectorColumn}" <=> '${vectorStr}'::vector
                    LIMIT ${String(limitVal * 3)}
                ),
                text_scores AS (
                    SELECT 
                        ctid,
                        ts_rank(to_tsvector('english', "${parsed.textColumn}"), plainto_tsquery($1)) as text_score
                    FROM "${parsed.table}"
                    WHERE to_tsvector('english', "${parsed.textColumn}") @@ plainto_tsquery($1)
                )
                SELECT 
                    t.*,
                    COALESCE(v.vector_score, 0) * ${String(vectorWeight)} + 
                    COALESCE(ts.text_score, 0) * ${String(textWeight)} as combined_score,
                    v.vector_score,
                    ts.text_score
                FROM "${parsed.table}" t
                LEFT JOIN vector_scores v ON t.ctid = v.ctid
                LEFT JOIN text_scores ts ON t.ctid = ts.ctid
                WHERE v.ctid IS NOT NULL OR ts.ctid IS NOT NULL
                ORDER BY combined_score DESC
                LIMIT ${String(limitVal)}
            `;

            const result = await adapter.executeQuery(sql, [parsed.textQuery]);
            return {
                results: result.rows,
                count: result.rows?.length ?? 0,
                vectorWeight,
                textWeight
            };
        }
    };
}

export function createVectorPerformanceTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_vector_performance',
        description: 'Analyze vector search performance and index effectiveness.',
        group: 'vector',
        inputSchema: z.object({
            table: z.string().describe('Table name'),
            column: z.string().describe('Vector column'),
            testVector: z.array(z.number()).optional().describe('Test vector for benchmarking')
        }),
        annotations: readOnly('Vector Performance'),
        icons: getToolIcons('vector', readOnly('Vector Performance')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; testVector?: number[] });

            const indexSql = `
                SELECT 
                    i.indexname,
                    i.indexdef,
                    pg_size_pretty(pg_relation_size(i.indexname::regclass)) as index_size,
                    s.idx_scan,
                    s.idx_tup_read
                FROM pg_indexes i
                LEFT JOIN pg_stat_user_indexes s ON s.indexrelname = i.indexname
                WHERE i.tablename = $1
                AND i.indexdef LIKE '%vector%'
            `;
            const indexResult = await adapter.executeQuery(indexSql, [parsed.table]);

            const statsSql = `
                SELECT 
                    reltuples::bigint as estimated_rows,
                    pg_size_pretty(pg_relation_size('"${parsed.table}"'::regclass)) as table_size
                FROM pg_class WHERE relname = $1
            `;
            const statsResult = await adapter.executeQuery(statsSql, [parsed.table]);

            let benchmark = null;
            if (parsed.testVector) {
                const vectorStr = `[${parsed.testVector.join(',')}]`;
                const benchSql = `
                    EXPLAIN ANALYZE
                    SELECT * FROM "${parsed.table}"
                    ORDER BY "${parsed.column}" <-> '${vectorStr}'::vector
                    LIMIT 10
                `;
                const benchResult = await adapter.executeQuery(benchSql);
                benchmark = benchResult.rows;
            }

            return {
                table: parsed.table,
                column: parsed.column,
                stats: statsResult.rows?.[0],
                indexes: indexResult.rows,
                benchmark,
                recommendations: (indexResult.rows?.length ?? 0) === 0
                    ? ['No vector index found - consider creating one for better performance']
                    : []
            };
        }
    };
}

export function createVectorDimensionReduceTool(_adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_vector_dimension_reduce',
        description: 'Reduce vector dimensions using random projection (PostgreSQL-native approximation).',
        group: 'vector',
        inputSchema: z.object({
            vector: z.array(z.number()).describe('Vector to reduce'),
            targetDimensions: z.number().describe('Target number of dimensions'),
            seed: z.number().optional().describe('Random seed for reproducibility')
        }),
        annotations: readOnly('Vector Dimension Reduce'),
        icons: getToolIcons('vector', readOnly('Vector Dimension Reduce')),
        // eslint-disable-next-line @typescript-eslint/require-await
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { vector: number[]; targetDimensions: number; seed?: number });
            const originalDim = parsed.vector.length;
            const targetDim = parsed.targetDimensions;

            if (targetDim >= originalDim) {
                return {
                    error: 'Target dimensions must be less than original',
                    originalDimensions: originalDim,
                    targetDimensions: targetDim
                };
            }

            const seed = parsed.seed ?? 42;
            const seededRandom = (s: number): number => {
                const x = Math.sin(s) * 10000;
                return x - Math.floor(x);
            };

            const reduced: number[] = [];
            const scaleFactor = Math.sqrt(originalDim / targetDim);

            for (let i = 0; i < targetDim; i++) {
                let sum = 0;
                for (let j = 0; j < originalDim; j++) {
                    const randVal = seededRandom(seed + i * originalDim + j) > 0.5 ? 1 : -1;
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    sum += parsed.vector[j]! * randVal;
                }
                reduced.push(sum / scaleFactor);
            }

            return {
                originalDimensions: originalDim,
                targetDimensions: targetDim,
                reduced,
                method: 'random_projection',
                note: 'For PCA or UMAP, use external libraries'
            };
        }
    };
}

export function createVectorEmbedTool(): ToolDefinition {
    return {
        name: 'pg_vector_embed',
        description: 'Generate text embeddings. Returns a simple hash-based embedding for demos (use external APIs for production).',
        group: 'vector',
        inputSchema: z.object({
            text: z.string().describe('Text to embed'),
            dimensions: z.number().optional().describe('Vector dimensions (default: 384)')
        }),
        annotations: readOnly('Vector Embed'),
        icons: getToolIcons('vector', readOnly('Vector Embed')),
        // eslint-disable-next-line @typescript-eslint/require-await
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { text: string; dimensions?: number });
            const dims = parsed.dimensions ?? 384;

            const vector: number[] = [];

            for (let i = 0; i < dims; i++) {
                let hash = 0;
                for (let j = 0; j < parsed.text.length; j++) {
                    hash = ((hash << 5) - hash + parsed.text.charCodeAt(j) + i) | 0;
                }
                vector.push(Math.sin(hash) * 0.5);
            }

            const magnitude = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
            const normalized = vector.map(x => x / magnitude);

            return {
                embedding: normalized,
                dimensions: dims,
                textLength: parsed.text.length,
                warning: 'This is a demo embedding using hash functions. For production, use OpenAI, Cohere, or other embedding APIs.'
            };
        }
    };
}
