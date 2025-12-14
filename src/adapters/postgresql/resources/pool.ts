/**
 * Pool Resource
 * 
 * MCP server connection pool statistics.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

export function createPoolResource(adapter: PostgresAdapter): ResourceDefinition {
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
