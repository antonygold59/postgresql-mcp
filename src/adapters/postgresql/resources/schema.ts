/**
 * Schema Resource
 * 
 * Full database schema including tables, views, indexes, and constraints.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

export function createSchemaResource(adapter: PostgresAdapter): ResourceDefinition {
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
