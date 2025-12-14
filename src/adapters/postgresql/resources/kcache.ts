/**
 * pg_stat_kcache Status Resource
 * 
 * Provides pg_stat_kcache OS-level performance metrics summary.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition } from '../../../types/index.js';

/** Safely convert unknown value to string */
function toStr(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

interface KcacheResourceData {
    extensionInstalled: boolean;
    extensionVersion: string | null;
    pgStatStatementsInstalled: boolean;
    summary: {
        totalQueries: number;
        totalCpuTime: number;
        totalReads: number;
        totalWrites: number;
    };
    topCpuQueries: {
        queryPreview: string;
        calls: number;
        cpuTimeSeconds: number;
        cpuPerCall: number;
    }[];
    topIoQueries: {
        queryPreview: string;
        calls: number;
        readsBytes: number;
        writesBytes: number;
    }[];
    resourceClassification: {
        cpuBound: number;
        ioBound: number;
        balanced: number;
    };
    recommendations: string[];
}

export function createKcacheResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://kcache',
        name: 'pg_stat_kcache Status',
        description: 'pg_stat_kcache OS-level CPU and I/O performance metrics summary',
        mimeType: 'application/json',
        handler: async (): Promise<string> => {
            const result: KcacheResourceData = {
                extensionInstalled: false,
                extensionVersion: null,
                pgStatStatementsInstalled: false,
                summary: {
                    totalQueries: 0,
                    totalCpuTime: 0,
                    totalReads: 0,
                    totalWrites: 0
                },
                topCpuQueries: [],
                topIoQueries: [],
                resourceClassification: {
                    cpuBound: 0,
                    ioBound: 0,
                    balanced: 0
                },
                recommendations: []
            };

            try {
                // Check for pg_stat_statements first (required)
                const stmtCheck = await adapter.executeQuery(
                    `SELECT extversion FROM pg_extension WHERE extname = 'pg_stat_statements'`
                );

                result.pgStatStatementsInstalled = (stmtCheck.rows?.length ?? 0) > 0;

                // Check if pg_stat_kcache is installed
                const extCheck = await adapter.executeQuery(
                    `SELECT extversion FROM pg_extension WHERE extname = 'pg_stat_kcache'`
                );

                if (!extCheck.rows || extCheck.rows.length === 0) {
                    result.recommendations.push('pg_stat_kcache extension is not installed. Use pg_kcache_create_extension to enable OS-level performance monitoring.');
                    if (!result.pgStatStatementsInstalled) {
                        result.recommendations.push('pg_stat_statements is also required and not installed.');
                    }
                    return JSON.stringify(result, null, 2);
                }

                result.extensionInstalled = true;
                const extVersion = extCheck.rows[0]?.['extversion'];
                result.extensionVersion = typeof extVersion === 'string' ? extVersion : null;

                if (!result.pgStatStatementsInstalled) {
                    result.recommendations.push('pg_stat_statements is required but not installed. pg_stat_kcache will not function properly.');
                    return JSON.stringify(result, null, 2);
                }

                // Get summary statistics
                const summaryResult = await adapter.executeQuery(
                    `SELECT 
                        COUNT(*)::int as total_queries,
                        COALESCE(SUM(user_time + system_time), 0)::float as total_cpu,
                        COALESCE(SUM(reads), 0)::bigint as total_reads,
                        COALESCE(SUM(writes), 0)::bigint as total_writes
                     FROM pg_stat_kcache`
                );

                if (summaryResult.rows && summaryResult.rows.length > 0) {
                    const row = summaryResult.rows[0];
                    result.summary.totalQueries = Number(row?.['total_queries'] ?? 0);
                    result.summary.totalCpuTime = Number(row?.['total_cpu'] ?? 0);
                    result.summary.totalReads = Number(row?.['total_reads'] ?? 0);
                    result.summary.totalWrites = Number(row?.['total_writes'] ?? 0);
                }

                // Get top CPU-consuming queries
                const cpuResult = await adapter.executeQuery(
                    `SELECT 
                        substring(s.query, 1, 100) as query,
                        s.calls::int,
                        round((k.user_time + k.system_time)::numeric, 3) as cpu_time,
                        round(((k.user_time + k.system_time) / NULLIF(s.calls, 0))::numeric, 6) as cpu_per_call
                     FROM pg_stat_kcache k
                     JOIN pg_stat_statements s USING (queryid, dbid, userid)
                     WHERE s.calls > 0
                     ORDER BY (k.user_time + k.system_time) DESC
                     LIMIT 5`
                );

                if (cpuResult.rows) {
                    for (const row of cpuResult.rows) {
                        result.topCpuQueries.push({
                            queryPreview: toStr(row['query']),
                            calls: Number(row['calls'] ?? 0),
                            cpuTimeSeconds: Number(row['cpu_time'] ?? 0),
                            cpuPerCall: Number(row['cpu_per_call'] ?? 0)
                        });
                    }
                }

                // Get top I/O-consuming queries
                const ioResult = await adapter.executeQuery(
                    `SELECT 
                        substring(s.query, 1, 100) as query,
                        s.calls::int,
                        k.reads::bigint,
                        k.writes::bigint
                     FROM pg_stat_kcache k
                     JOIN pg_stat_statements s USING (queryid, dbid, userid)
                     WHERE s.calls > 0
                     ORDER BY k.reads DESC
                     LIMIT 5`
                );

                if (ioResult.rows) {
                    for (const row of ioResult.rows) {
                        result.topIoQueries.push({
                            queryPreview: toStr(row['query']),
                            calls: Number(row['calls'] ?? 0),
                            readsBytes: Number(row['reads'] ?? 0),
                            writesBytes: Number(row['writes'] ?? 0)
                        });
                    }
                }

                // Resource classification
                const classResult = await adapter.executeQuery(
                    `WITH metrics AS (
                        SELECT 
                            queryid,
                            (user_time + system_time) as cpu_time,
                            reads + writes as io_bytes
                        FROM pg_stat_kcache
                        WHERE user_time + system_time > 0 OR reads + writes > 0
                    )
                    SELECT 
                        CASE 
                            WHEN cpu_time > io_bytes / 1000000.0 * 2 THEN 'cpu_bound'
                            WHEN io_bytes / 1000000.0 > cpu_time * 2 THEN 'io_bound'
                            ELSE 'balanced'
                        END as classification,
                        COUNT(*)::int as count
                    FROM metrics
                    GROUP BY 1`
                );

                if (classResult.rows) {
                    for (const row of classResult.rows) {
                        const classification = toStr(row['classification']);
                        const count = Number(row['count'] ?? 0);
                        if (classification === 'cpu_bound') {
                            result.resourceClassification.cpuBound = count;
                        } else if (classification === 'io_bound') {
                            result.resourceClassification.ioBound = count;
                        } else {
                            result.resourceClassification.balanced = count;
                        }
                    }
                }

                // Generate recommendations
                if (result.summary.totalQueries === 0) {
                    result.recommendations.push('No query statistics collected yet. Run some queries and check again.');
                }

                if (result.resourceClassification.cpuBound > result.resourceClassification.ioBound * 2) {
                    result.recommendations.push('Workload is heavily CPU-bound. Consider optimizing complex calculations or using materialized views.');
                }

                if (result.resourceClassification.ioBound > result.resourceClassification.cpuBound * 2) {
                    result.recommendations.push('Workload is heavily I/O-bound. Review indexes and consider increasing shared_buffers.');
                }

                if (result.topCpuQueries.length > 0 && result.topCpuQueries[0] !== undefined && result.topCpuQueries[0].cpuTimeSeconds > 100) {
                    result.recommendations.push('Some queries have very high CPU time. Use pg_kcache_top_cpu for detailed analysis.');
                }

            } catch {
                result.recommendations.push('Error accessing pg_stat_kcache. Ensure both pg_stat_statements and pg_stat_kcache are in shared_preload_libraries.');
            }

            return JSON.stringify(result, null, 2);
        }
    };
}
