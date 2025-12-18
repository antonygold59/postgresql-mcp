/**
 * PostgreSQL Performance Tools - Monitoring
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';

export function createLocksTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_locks',
        description: 'View current lock information.',
        group: 'performance',
        inputSchema: z.object({
            showBlocked: z.boolean().optional()
        }),
        annotations: readOnly('Lock Information'),
        icons: getToolIcons('performance', readOnly('Lock Information')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { showBlocked?: boolean });

            let sql: string;
            if (parsed.showBlocked) {
                sql = `SELECT blocked.pid as blocked_pid, blocked.query as blocked_query,
                        blocking.pid as blocking_pid, blocking.query as blocking_query
                        FROM pg_stat_activity blocked
                        JOIN pg_locks bl ON blocked.pid = bl.pid
                        JOIN pg_locks lk ON bl.locktype = lk.locktype 
                            AND bl.relation = lk.relation 
                            AND bl.pid != lk.pid
                        JOIN pg_stat_activity blocking ON lk.pid = blocking.pid
                        WHERE NOT bl.granted`;
            } else {
                sql = `SELECT l.locktype, l.relation::regclass, l.mode, l.granted,
                        a.pid, a.usename, a.query, a.state
                        FROM pg_locks l
                        JOIN pg_stat_activity a ON l.pid = a.pid
                        WHERE l.pid != pg_backend_pid()
                        ORDER BY l.granted, l.pid`;
            }

            const result = await adapter.executeQuery(sql);
            return { locks: result.rows };
        }
    };
}

export function createBloatCheckTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_bloat_check',
        description: 'Check for table and index bloat.',
        group: 'performance',
        inputSchema: z.object({
            schema: z.string().optional()
        }),
        annotations: readOnly('Bloat Check'),
        icons: getToolIcons('performance', readOnly('Bloat Check')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { schema?: string });
            const schemaClause = parsed.schema ? `AND schemaname = '${parsed.schema}'` : '';

            const sql = `SELECT schemaname, relname as table_name,
                        n_live_tup as live_tuples, n_dead_tup as dead_tuples,
                        CASE WHEN n_live_tup > 0 THEN round(100.0 * n_dead_tup / n_live_tup, 2) ELSE 0 END as dead_pct,
                        pg_size_pretty(pg_table_size(relid)) as table_size
                        FROM pg_stat_user_tables
                        WHERE n_dead_tup > 0 ${schemaClause}
                        ORDER BY n_dead_tup DESC
                        LIMIT 20`;

            const result = await adapter.executeQuery(sql);
            return { bloatedTables: result.rows };
        }
    };
}

export function createCacheHitRatioTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_cache_hit_ratio',
        description: 'Get buffer cache hit ratio statistics.',
        group: 'performance',
        inputSchema: z.object({}),
        annotations: readOnly('Cache Hit Ratio'),
        icons: getToolIcons('performance', readOnly('Cache Hit Ratio')),
        handler: async (_params: unknown, _context: RequestContext) => {
            const sql = `SELECT 
                        sum(heap_blks_read) as heap_read,
                        sum(heap_blks_hit) as heap_hit,
                        CASE WHEN sum(heap_blks_read) + sum(heap_blks_hit) > 0 
                            THEN round(100.0 * sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)
                            ELSE 100 END as cache_hit_ratio
                        FROM pg_statio_user_tables`;

            const result = await adapter.executeQuery(sql);
            return result.rows?.[0];
        }
    };
}
