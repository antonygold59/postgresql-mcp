/**
 * PostgreSQL Performance Tools - Statistics
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';
import { IndexStatsSchema, TableStatsSchema } from '../../schemas/index.js';

export function createIndexStatsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_index_stats',
        description: 'Get index usage statistics.',
        group: 'performance',
        inputSchema: IndexStatsSchema,
        annotations: readOnly('Index Stats'),
        icons: getToolIcons('performance', readOnly('Index Stats')),
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

export function createTableStatsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_table_stats',
        description: 'Get table access statistics.',
        group: 'performance',
        inputSchema: TableStatsSchema,
        annotations: readOnly('Table Stats'),
        icons: getToolIcons('performance', readOnly('Table Stats')),
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

export function createStatStatementsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stat_statements',
        description: 'Get query statistics from pg_stat_statements (requires extension).',
        group: 'performance',
        inputSchema: z.object({
            limit: z.number().optional(),
            orderBy: z.enum(['total_time', 'calls', 'mean_time', 'rows']).optional()
        }),
        annotations: readOnly('Query Statistics'),
        icons: getToolIcons('performance', readOnly('Query Statistics')),
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

export function createStatActivityTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stat_activity',
        description: 'Get currently running queries and connections.',
        group: 'performance',
        inputSchema: z.object({
            includeIdle: z.boolean().optional()
        }),
        annotations: readOnly('Activity Stats'),
        icons: getToolIcons('performance', readOnly('Activity Stats')),
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
