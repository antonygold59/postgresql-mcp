/**
 * PostgreSQL Performance Tools - Analysis
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';

export function createSeqScanTablesTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_seq_scan_tables',
        description: 'Find tables with high sequential scan counts (potential missing indexes).',
        group: 'performance',
        inputSchema: z.object({
            minScans: z.number().optional()
        }),
        annotations: readOnly('Sequential Scan Tables'),
        icons: getToolIcons('performance', readOnly('Sequential Scan Tables')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { minScans?: number });
            const minScans = parsed.minScans ?? 100;

            const sql = `SELECT schemaname, relname as table_name,
                        seq_scan, seq_tup_read, 
                        idx_scan, idx_tup_fetch,
                        CASE WHEN idx_scan > 0 THEN round(100.0 * seq_scan / (seq_scan + idx_scan), 2) ELSE 100 END as seq_scan_pct
                        FROM pg_stat_user_tables
                        WHERE seq_scan > ${String(minScans)}
                        ORDER BY seq_scan DESC`;

            const result = await adapter.executeQuery(sql);
            return { tables: result.rows };
        }
    };
}

export function createIndexRecommendationsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_index_recommendations',
        description: 'Suggest missing indexes based on table statistics.',
        group: 'performance',
        inputSchema: z.object({
            table: z.string().optional()
        }),
        annotations: readOnly('Index Recommendations'),
        icons: getToolIcons('performance', readOnly('Index Recommendations')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table?: string });
            const tableClause = parsed.table ? `AND relname = '${parsed.table}'` : '';

            const sql = `SELECT schemaname, relname as table_name,
                        seq_scan, idx_scan,
                        n_live_tup as row_count,
                        pg_size_pretty(pg_table_size(relid)) as size,
                        CASE 
                            WHEN idx_scan = 0 AND seq_scan > 100 THEN 'HIGH - No index usage, many seq scans'
                            WHEN idx_scan > 0 AND seq_scan > idx_scan * 10 THEN 'MEDIUM - Seq scans dominate'
                            ELSE 'LOW - Good index usage'
                        END as recommendation
                        FROM pg_stat_user_tables
                        WHERE seq_scan > 50 ${tableClause}
                        ORDER BY seq_scan DESC
                        LIMIT 20`;

            const result = await adapter.executeQuery(sql);
            return { recommendations: result.rows };
        }
    };
}

export function createQueryPlanCompareTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_query_plan_compare',
        description: 'Compare execution plans of two SQL queries to identify performance differences.',
        group: 'performance',
        inputSchema: z.object({
            query1: z.string().describe('First SQL query'),
            query2: z.string().describe('Second SQL query'),
            analyze: z.boolean().optional().describe('Run EXPLAIN ANALYZE (executes queries)')
        }),
        annotations: readOnly('Query Plan Compare'),
        icons: getToolIcons('performance', readOnly('Query Plan Compare')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { query1: string; query2: string; analyze?: boolean });
            const explainType = parsed.analyze ? 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)' : 'EXPLAIN (FORMAT JSON)';

            const [result1, result2] = await Promise.all([
                adapter.executeQuery(`${explainType} ${parsed.query1}`),
                adapter.executeQuery(`${explainType} ${parsed.query2}`)
            ]);

            const row1 = result1.rows?.[0];
            const row2 = result2.rows?.[0];
            const queryPlan1 = row1?.['QUERY PLAN'] as unknown[] | undefined;
            const queryPlan2 = row2?.['QUERY PLAN'] as unknown[] | undefined;
            const plan1 = queryPlan1?.[0] as Record<string, unknown> | undefined;
            const plan2 = queryPlan2?.[0] as Record<string, unknown> | undefined;

            const comparison = {
                query1: {
                    planningTime: plan1?.['Planning Time'],
                    executionTime: plan1?.['Execution Time'],
                    totalCost: (plan1?.['Plan'] as Record<string, unknown> | undefined)?.['Total Cost'],
                    sharedBuffersHit: plan1?.['Shared Hit Blocks'],
                    sharedBuffersRead: plan1?.['Shared Read Blocks']
                },
                query2: {
                    planningTime: plan2?.['Planning Time'],
                    executionTime: plan2?.['Execution Time'],
                    totalCost: (plan2?.['Plan'] as Record<string, unknown> | undefined)?.['Total Cost'],
                    sharedBuffersHit: plan2?.['Shared Hit Blocks'],
                    sharedBuffersRead: plan2?.['Shared Read Blocks']
                },
                analysis: {
                    costDifference: plan1 && plan2
                        ? Number((plan1['Plan'] as Record<string, unknown>)?.['Total Cost']) -
                        Number((plan2['Plan'] as Record<string, unknown>)?.['Total Cost'])
                        : null,
                    recommendation: ''
                },
                fullPlans: { plan1, plan2 }
            };

            if (comparison.analysis.costDifference !== null) {
                if (comparison.analysis.costDifference > 0) {
                    comparison.analysis.recommendation = 'Query 2 has lower estimated cost';
                } else if (comparison.analysis.costDifference < 0) {
                    comparison.analysis.recommendation = 'Query 1 has lower estimated cost';
                } else {
                    comparison.analysis.recommendation = 'Both queries have similar estimated cost';
                }
            }

            return comparison;
        }
    };
}
