/**
 * Tables Resource
 * 
 * List of all tables with metadata (sizes, row counts, etc.).
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

export function createTablesResource(adapter: PostgresAdapter): ResourceDefinition {
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
