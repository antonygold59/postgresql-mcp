/**
 * Statistics Resource
 * 
 * Table and index statistics, cache hit ratios, and stale statistics detection.
 * Enhanced with stale statistics recommendations from legacy server.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

interface StatsRecommendation {
    priority: 'HIGH' | 'MEDIUM' | 'INFO';
    table?: string;
    percentStale?: number;
    action?: string;
    reason?: string;
    message?: string;
}

interface TableStatsRow {
    schemaname: string;
    table_name: string;
    seq_scan: number;
    idx_scan: number;
    inserts: number;
    updates: number;
    deletes: number;
    live_tuples: number;
    dead_tuples: number;
    n_mod_since_analyze: number;
    percent_modified_since_analyze: number;
}

export function createStatsResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://stats',
        name: 'Database Statistics',
        description: 'Table and index statistics, cache hit ratios, and stale statistics detection',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            // Table stats
            const tableStats = await adapter.executeQuery(`
                SELECT schemaname, relname as table_name,
                       seq_scan, idx_scan, n_tup_ins as inserts,
                       n_tup_upd as updates, n_tup_del as deletes,
                       n_live_tup as live_tuples, n_dead_tup as dead_tuples,
                       n_mod_since_analyze,
                       CASE
                           WHEN n_live_tup > 0
                           THEN round(100.0 * n_mod_since_analyze / n_live_tup, 2)
                           ELSE 0
                       END as percent_modified_since_analyze
                FROM pg_stat_user_tables
                ORDER BY n_live_tup DESC
                LIMIT 50
            `);

            // Cache hit ratio
            const cacheStats = await adapter.executeQuery(`
                SELECT 
                    sum(heap_blks_read) as heap_read,
                    sum(heap_blks_hit) as heap_hit,
                    CASE WHEN sum(heap_blks_read) + sum(heap_blks_hit) > 0 
                        THEN round(100.0 * sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)
                        ELSE 100 
                    END as cache_hit_ratio
                FROM pg_statio_user_tables
            `);

            // Generate stale statistics recommendations
            const recommendations: StatsRecommendation[] = [];
            const tables = (tableStats.rows ?? []) as unknown as TableStatsRow[];

            for (const table of tables.slice(0, 10)) {
                const pctStale = table.percent_modified_since_analyze;
                if (pctStale > 20) {
                    recommendations.push({
                        priority: 'HIGH',
                        table: table.schemaname + '.' + table.table_name,
                        percentStale: pctStale,
                        action: 'ANALYZE ' + table.schemaname + '.' + table.table_name + ';',
                        reason: 'Stale statistics may lead to poor query plans'
                    });
                } else if (pctStale > 10) {
                    recommendations.push({
                        priority: 'MEDIUM',
                        table: table.schemaname + '.' + table.table_name,
                        percentStale: pctStale,
                        action: 'ANALYZE ' + table.schemaname + '.' + table.table_name + ';',
                        reason: 'Statistics could be fresher for optimal query planning'
                    });
                }
            }

            if (recommendations.length === 0) {
                recommendations.push({
                    priority: 'INFO',
                    message: 'Table statistics are up to date'
                });
            }

            return {
                tableStats: tables,
                cacheHitRatio: cacheStats.rows?.[0],
                recommendations
            };
        }
    };
}
