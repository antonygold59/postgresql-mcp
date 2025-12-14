/**
 * PostgreSQL Performance Tools
 * 
 * Query analysis, statistics, and performance monitoring.
 * 12 tools total.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../types/index.js';
import { z } from 'zod';
import { ExplainSchema, IndexStatsSchema, TableStatsSchema } from '../types.js';

/**
 * Get all performance tools
 */
export function getPerformanceTools(adapter: PostgresAdapter): ToolDefinition[] {
    return [
        createExplainTool(adapter),
        createExplainAnalyzeTool(adapter),
        createExplainBuffersTool(adapter),
        createIndexStatsTool(adapter),
        createTableStatsTool(adapter),
        createStatStatementsTool(adapter),
        createStatActivityTool(adapter),
        createLocksTool(adapter),
        createBloatCheckTool(adapter),
        createCacheHitRatioTool(adapter),
        createSeqScanTablesTool(adapter),
        createIndexRecommendationsTool(adapter)
    ];
}

function createExplainTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_explain',
        description: 'Show query execution plan without running the query.',
        group: 'performance',
        inputSchema: ExplainSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { sql, format } = ExplainSchema.parse(params);
            const fmt = format ?? 'text';
            const explainSql = `EXPLAIN (FORMAT ${fmt.toUpperCase()}) ${sql}`;
            const result = await adapter.executeQuery(explainSql);

            if (fmt === 'json') {
                return { plan: result.rows?.[0]?.['QUERY PLAN'] };
            }
            return { plan: result.rows?.map(r => Object.values(r)[0]).join('\n') };
        }
    };
}

function createExplainAnalyzeTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_explain_analyze',
        description: 'Run query and show actual execution plan with timing.',
        group: 'performance',
        inputSchema: ExplainSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { sql, format } = ExplainSchema.parse(params);
            const fmt = format ?? 'text';
            const explainSql = `EXPLAIN (ANALYZE, FORMAT ${fmt.toUpperCase()}) ${sql}`;
            const result = await adapter.executeQuery(explainSql);

            if (fmt === 'json') {
                return { plan: result.rows?.[0]?.['QUERY PLAN'] };
            }
            return { plan: result.rows?.map(r => Object.values(r)[0]).join('\n') };
        }
    };
}

function createExplainBuffersTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_explain_buffers',
        description: 'Show query plan with buffer usage statistics.',
        group: 'performance',
        inputSchema: ExplainSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { sql, format } = ExplainSchema.parse(params);
            const fmt = format ?? 'json';
            const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT ${fmt.toUpperCase()}) ${sql}`;
            const result = await adapter.executeQuery(explainSql);

            if (fmt === 'json') {
                return { plan: result.rows?.[0]?.['QUERY PLAN'] };
            }
            return { plan: result.rows?.map(r => Object.values(r)[0]).join('\n') };
        }
    };
}

function createIndexStatsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_index_stats',
        description: 'Get index usage statistics.',
        group: 'performance',
        inputSchema: IndexStatsSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, schema } = IndexStatsSchema.parse(params);
            let whereClause = "schemaname NOT IN ('pg_catalog', 'information_schema')";
            if (schema) whereClause += ` AND schemaname = '${schema}'`;
            if (table) whereClause += ` AND relname = '${table}'`;

            const sql = `SELECT schemaname, relname as table_name, indexrelname as index_name,
                        idx_scan as scans, idx_tup_read as tuples_read, idx_tup_fetch as tuples_fetched,
                        pg_size_pretty(pg_relation_size(indexrelid)) as size
                        FROM pg_stat_user_indexes
                        WHERE ${whereClause}
                        ORDER BY idx_scan DESC`;

            const result = await adapter.executeQuery(sql);
            return { indexes: result.rows };
        }
    };
}

function createTableStatsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_table_stats',
        description: 'Get table access statistics.',
        group: 'performance',
        inputSchema: TableStatsSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, schema } = TableStatsSchema.parse(params);
            let whereClause = "schemaname NOT IN ('pg_catalog', 'information_schema')";
            if (schema) whereClause += ` AND schemaname = '${schema}'`;
            if (table) whereClause += ` AND relname = '${table}'`;

            const sql = `SELECT schemaname, relname as table_name,
                        seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
                        n_tup_ins as inserts, n_tup_upd as updates, n_tup_del as deletes,
                        n_live_tup as live_tuples, n_dead_tup as dead_tuples,
                        last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
                        FROM pg_stat_user_tables
                        WHERE ${whereClause}
                        ORDER BY seq_scan DESC`;

            const result = await adapter.executeQuery(sql);
            return { tables: result.rows };
        }
    };
}

function createStatStatementsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stat_statements',
        description: 'Get query statistics from pg_stat_statements (requires extension).',
        group: 'performance',
        inputSchema: z.object({
            limit: z.number().optional(),
            orderBy: z.enum(['total_time', 'calls', 'mean_time', 'rows']).optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { limit?: number; orderBy?: string });
            const limit = parsed.limit ?? 20;
            const orderBy = parsed.orderBy ?? 'total_time';

            const sql = `SELECT query, calls, total_exec_time as total_time, 
                        mean_exec_time as mean_time, rows,
                        shared_blks_hit, shared_blks_read
                        FROM pg_stat_statements
                        ORDER BY ${orderBy === 'total_time' ? 'total_exec_time' : orderBy} DESC
                        LIMIT ${String(limit)}`;

            const result = await adapter.executeQuery(sql);
            return { statements: result.rows };
        }
    };
}

function createStatActivityTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stat_activity',
        description: 'Get currently running queries and connections.',
        group: 'performance',
        inputSchema: z.object({
            includeIdle: z.boolean().optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { includeIdle?: boolean });
            const idleClause = parsed.includeIdle ? '' : "AND state != 'idle'";

            const sql = `SELECT pid, usename, datname, client_addr, state,
                        query_start, state_change,
                        now() - query_start as duration,
                        query
                        FROM pg_stat_activity
                        WHERE pid != pg_backend_pid() ${idleClause}
                        ORDER BY query_start`;

            const result = await adapter.executeQuery(sql);
            return { connections: result.rows, count: result.rows?.length ?? 0 };
        }
    };
}

function createLocksTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_locks',
        description: 'View current lock information.',
        group: 'performance',
        inputSchema: z.object({
            showBlocked: z.boolean().optional()
        }),
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

function createBloatCheckTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_bloat_check',
        description: 'Check for table and index bloat.',
        group: 'performance',
        inputSchema: z.object({
            schema: z.string().optional()
        }),
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

function createCacheHitRatioTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_cache_hit_ratio',
        description: 'Get buffer cache hit ratio statistics.',
        group: 'performance',
        inputSchema: z.object({}),
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

function createSeqScanTablesTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_seq_scan_tables',
        description: 'Find tables with high sequential scan counts (potential missing indexes).',
        group: 'performance',
        inputSchema: z.object({
            minScans: z.number().optional()
        }),
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

function createIndexRecommendationsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_index_recommendations',
        description: 'Suggest missing indexes based on table statistics.',
        group: 'performance',
        inputSchema: z.object({
            table: z.string().optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table?: string });
            const tableClause = parsed.table ? `AND relname = '${parsed.table}'` : '';

            // Find tables with high seq_scan and low idx_scan
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
