/**
 * Settings Resource
 * 
 * Current PostgreSQL configuration settings.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

export function createSettingsResource(adapter: PostgresAdapter): ResourceDefinition {
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
