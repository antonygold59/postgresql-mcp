/**
 * Performance Resource
 * 
 * Query performance metrics from pg_stat_statements.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

export function createPerformanceResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://performance',
        name: 'Query Performance',
        description: 'Query performance metrics from pg_stat_statements',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            // Check if pg_stat_statements is available
            const extResult = await adapter.executeQuery(`
                SELECT COUNT(*) as count 
                FROM pg_extension 
                WHERE extname = 'pg_stat_statements'
            `);
            const countValue = extResult.rows?.[0]?.['count'];
            const hasPgStat = Number(countValue ?? 0) > 0;

            if (!hasPgStat) {
                return {
                    extensionStatus: 'not_installed',
                    error: 'pg_stat_statements extension not installed',
                    recommendation: 'Run: CREATE EXTENSION pg_stat_statements;',
                    benefits: [
                        'Track query performance and identify slow queries',
                        'Optimize workload based on actual usage patterns',
                        'Enable all performance intelligence tools',
                        'Critical for production database monitoring'
                    ]
                };
            }

            // Get top queries by total time
            const topQueries = await adapter.executeQuery(`
                SELECT 
                    LEFT(query, 200) as query_preview,
                    calls,
                    round(total_exec_time::numeric, 2) as total_time_ms,
                    round(mean_exec_time::numeric, 2) as mean_time_ms,
                    round(stddev_exec_time::numeric, 2) as stddev_time_ms,
                    rows,
                    round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 2) as cache_hit_pct
                FROM pg_stat_statements
                WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                ORDER BY total_exec_time DESC
                LIMIT 20
            `);

            // Get summary statistics
            const summary = await adapter.executeQuery(`
                SELECT 
                    COUNT(*) as total_queries,
                    SUM(calls) as total_calls,
                    round(SUM(total_exec_time)::numeric, 2) as total_time_ms,
                    round(AVG(mean_exec_time)::numeric, 2) as avg_time_ms
                FROM pg_stat_statements
                WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = current_user)
            `);

            return {
                extensionStatus: 'installed',
                summary: summary.rows?.[0] ?? {},
                topQueries: topQueries.rows ?? [],
                recommendations: [
                    'Use pg_explain_analyze for detailed query analysis',
                    'Consider pg_query_plan_compare for optimization testing'
                ]
            };
        }
    };
}
