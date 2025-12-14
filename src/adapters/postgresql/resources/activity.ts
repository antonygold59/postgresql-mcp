/**
 * Activity Resource
 * 
 * Current database connections and running queries.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

export function createActivityResource(adapter: PostgresAdapter): ResourceDefinition {
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
