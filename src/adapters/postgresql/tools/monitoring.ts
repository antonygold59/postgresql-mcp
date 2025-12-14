/**
 * PostgreSQL Monitoring Tools
 * 
 * Database health, sizes, connections, and replication status.
 * 8 tools total.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../types/index.js';
import { z } from 'zod';
import { DatabaseSizeSchema, TableSizesSchema, ShowSettingsSchema } from '../types.js';

/**
 * Get all monitoring tools
 */
export function getMonitoringTools(adapter: PostgresAdapter): ToolDefinition[] {
    return [
        createDatabaseSizeTool(adapter),
        createTableSizesTool(adapter),
        createConnectionStatsTool(adapter),
        createReplicationStatusTool(adapter),
        createServerVersionTool(adapter),
        createShowSettingsTool(adapter),
        createUptimeTool(adapter),
        createRecoveryStatusTool(adapter)
    ];
}

function createDatabaseSizeTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_database_size',
        description: 'Get the size of a database.',
        group: 'monitoring',
        inputSchema: DatabaseSizeSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { database } = DatabaseSizeSchema.parse(params);
            // Database size query - using database param directly
            const sql = database
                ? `SELECT pg_database_size($1) as bytes, pg_size_pretty(pg_database_size($1)) as size`
                : `SELECT pg_database_size(current_database()) as bytes, pg_size_pretty(pg_database_size(current_database())) as size`;
            const result = await adapter.executeQuery(sql, database ? [database] : []);
            return result.rows?.[0];
        }
    };
}

function createTableSizesTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_table_sizes',
        description: 'Get sizes of all tables with indexes and total.',
        group: 'monitoring',
        inputSchema: TableSizesSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { schema, limit } = TableSizesSchema.parse(params);
            const schemaClause = schema ? `AND n.nspname = '${schema}'` : '';
            const limitClause = limit !== undefined && limit > 0 ? ` LIMIT ${String(limit)}` : ' LIMIT 50';

            const sql = `SELECT n.nspname as schema, c.relname as table_name,
                        pg_size_pretty(pg_table_size(c.oid)) as table_size,
                        pg_size_pretty(pg_indexes_size(c.oid)) as indexes_size,
                        pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
                        pg_total_relation_size(c.oid) as total_bytes
                        FROM pg_class c
                        LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE c.relkind IN ('r', 'p')
                        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                        ${schemaClause}
                        ORDER BY pg_total_relation_size(c.oid) DESC${limitClause}`;

            const result = await adapter.executeQuery(sql);
            return { tables: result.rows };
        }
    };
}

function createConnectionStatsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_connection_stats',
        description: 'Get connection statistics by database and state.',
        group: 'monitoring',
        inputSchema: z.object({}),
        handler: async (_params: unknown, _context: RequestContext) => {
            const sql = `SELECT datname, state, count(*) as connections
                        FROM pg_stat_activity
                        WHERE pid != pg_backend_pid()
                        GROUP BY datname, state
                        ORDER BY datname, state`;

            const result = await adapter.executeQuery(sql);

            // Also get max connections
            const maxResult = await adapter.executeQuery(`SHOW max_connections`);
            const maxConnections = maxResult.rows?.[0]?.['max_connections'];

            const totalResult = await adapter.executeQuery(
                `SELECT count(*) as total FROM pg_stat_activity`
            );

            return {
                byDatabaseAndState: result.rows,
                totalConnections: totalResult.rows?.[0]?.['total'],
                maxConnections
            };
        }
    };
}

function createReplicationStatusTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_replication_status',
        description: 'Check replication status and lag.',
        group: 'monitoring',
        inputSchema: z.object({}),
        handler: async (_params: unknown, _context: RequestContext) => {
            // Check if this is a replica
            const recoveryResult = await adapter.executeQuery(`SELECT pg_is_in_recovery() as is_replica`);
            const isReplica = recoveryResult.rows?.[0]?.['is_replica'];

            if (isReplica === true) {
                // Get replica lag info
                const sql = `SELECT 
                            now() - pg_last_xact_replay_timestamp() as replay_lag,
                            pg_last_wal_receive_lsn() as receive_lsn,
                            pg_last_wal_replay_lsn() as replay_lsn`;
                const result = await adapter.executeQuery(sql);
                return { role: 'replica', ...result.rows?.[0] };
            } else {
                // Get primary replication info
                const sql = `SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
                            now() - backend_start as connection_duration
                            FROM pg_stat_replication`;
                const result = await adapter.executeQuery(sql);
                return { role: 'primary', replicas: result.rows };
            }
        }
    };
}

function createServerVersionTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_server_version',
        description: 'Get PostgreSQL server version information.',
        group: 'monitoring',
        inputSchema: z.object({}),
        handler: async (_params: unknown, _context: RequestContext) => {
            const sql = `SELECT version() as full_version,
                        current_setting('server_version') as version,
                        current_setting('server_version_num') as version_num`;
            const result = await adapter.executeQuery(sql);
            return result.rows?.[0];
        }
    };
}

function createShowSettingsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_show_settings',
        description: 'Show current PostgreSQL configuration settings.',
        group: 'monitoring',
        inputSchema: ShowSettingsSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { pattern } = ShowSettingsSchema.parse(params);
            const whereClause = pattern ? `WHERE name LIKE $1` : '';

            const sql = `SELECT name, setting, unit, category, short_desc
                        FROM pg_settings
                        ${whereClause}
                        ORDER BY category, name`;

            const result = await adapter.executeQuery(sql, pattern ? [pattern] : []);
            return { settings: result.rows };
        }
    };
}

function createUptimeTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_uptime',
        description: 'Get server uptime and startup time.',
        group: 'monitoring',
        inputSchema: z.object({}),
        handler: async (_params: unknown, _context: RequestContext) => {
            const sql = `SELECT pg_postmaster_start_time() as start_time,
                        now() - pg_postmaster_start_time() as uptime`;
            const result = await adapter.executeQuery(sql);
            return result.rows?.[0];
        }
    };
}

function createRecoveryStatusTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_recovery_status',
        description: 'Check if server is in recovery mode (replica).',
        group: 'monitoring',
        inputSchema: z.object({}),
        handler: async (_params: unknown, _context: RequestContext) => {
            const sql = `SELECT pg_is_in_recovery() as in_recovery,
                        CASE WHEN pg_is_in_recovery() 
                            THEN pg_last_xact_replay_timestamp() 
                            ELSE NULL 
                        END as last_replay_timestamp`;
            const result = await adapter.executeQuery(sql);
            return result.rows?.[0];
        }
    };
}
