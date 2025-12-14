/**
 * PostgreSQL MCP Resources
 * 
 * Provides structured data access via URI patterns.
 * 6 resources total.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

/**
 * Get all PostgreSQL resources
 */
export function getPostgresResources(adapter: PostgresAdapter): ResourceDefinition[] {
    return [
        createSchemaResource(adapter),
        createTablesResource(adapter),
        createSettingsResource(adapter),
        createStatsResource(adapter),
        createActivityResource(adapter),
        createPoolResource(adapter)
    ];
}

/**
 * Full database schema resource
 */
function createSchemaResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://schema',
        name: 'Database Schema',
        description: 'Full database schema including tables, views, indexes, and constraints',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            const schema = await adapter.getSchema();
            return schema;
        }
    };
}

/**
 * Tables list resource
 */
function createTablesResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://tables',
        name: 'Tables List',
        description: 'List of all tables with metadata (sizes, row counts, etc.)',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            const tables = await adapter.listTables();
            return { tables, count: tables.length };
        }
    };
}

/**
 * Server settings resource
 */
function createSettingsResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://settings',
        name: 'Server Settings',
        description: 'Current PostgreSQL configuration settings',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            const result = await adapter.executeQuery(`
                SELECT name, setting, unit, category, short_desc
                FROM pg_settings
                WHERE category NOT LIKE '%Developer%'
                ORDER BY category, name
            `);
            return { settings: result.rows };
        }
    };
}

/**
 * Database statistics resource
 */
function createStatsResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://stats',
        name: 'Database Statistics',
        description: 'Table and index statistics, cache hit ratios',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            // Table stats
            const tableStats = await adapter.executeQuery(`
                SELECT schemaname, relname as table_name,
                       seq_scan, idx_scan, n_tup_ins as inserts,
                       n_tup_upd as updates, n_tup_del as deletes,
                       n_live_tup as live_tuples, n_dead_tup as dead_tuples
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

            return {
                tableStats: tableStats.rows,
                cacheHitRatio: cacheStats.rows?.[0]
            };
        }
    };
}

/**
 * Active connections resource
 */
function createActivityResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://activity',
        name: 'Active Connections',
        description: 'Current database connections and running queries',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            const result = await adapter.executeQuery(`
                SELECT pid, usename, datname, client_addr, state,
                       query_start, state_change,
                       now() - query_start as duration,
                       LEFT(query, 200) as query_preview
                FROM pg_stat_activity
                WHERE pid != pg_backend_pid()
                ORDER BY query_start
            `);

            // Connection counts by state
            const counts = await adapter.executeQuery(`
                SELECT state, count(*) as count
                FROM pg_stat_activity
                WHERE pid != pg_backend_pid()
                GROUP BY state
            `);

            return {
                connections: result.rows,
                total: result.rows?.length ?? 0,
                byState: counts.rows
            };
        }
    };
}

/**
 * Connection pool resource
 */
function createPoolResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://pool',
        name: 'Connection Pool',
        description: 'MCP server connection pool statistics',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            const pool = adapter.getPool();
            if (!pool) {
                return { error: 'Pool not initialized' };
            }

            const stats = pool.getStats();
            const health = await pool.checkHealth();

            return {
                stats,
                health,
                isInitialized: pool.isInitialized()
            };
        }
    };
}
