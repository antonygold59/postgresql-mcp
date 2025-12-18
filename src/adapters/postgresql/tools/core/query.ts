/**
 * PostgreSQL Core Tools - Query Operations
 * 
 * Read and write query tools.
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { readOnly, write } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';
import { ReadQuerySchema, WriteQuerySchema } from '../../schemas/index.js';

/**
 * Execute a read-only SQL query
 */
export function createReadQueryTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_read_query',
        description: 'Execute a read-only SQL query (SELECT, WITH). Returns rows as JSON.',
        group: 'core',
        inputSchema: ReadQuerySchema,
        annotations: readOnly('Read Query'),
        icons: getToolIcons('core', readOnly('Read Query')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { sql, params: queryParams } = ReadQuerySchema.parse(params);
            const result = await adapter.executeReadQuery(sql, queryParams);
            return {
                rows: result.rows,
                rowCount: result.rows?.length ?? 0,
                executionTimeMs: result.executionTimeMs
            };
        }
    };
}

/**
 * Execute a write SQL query
 */
export function createWriteQueryTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_write_query',
        description: 'Execute a write SQL query (INSERT, UPDATE, DELETE). Returns affected row count.',
        group: 'core',
        inputSchema: WriteQuerySchema,
        annotations: write('Write Query'),
        icons: getToolIcons('core', write('Write Query')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { sql, params: queryParams } = WriteQuerySchema.parse(params);
            const result = await adapter.executeWriteQuery(sql, queryParams);
            return {
                rowsAffected: result.rowsAffected,
                command: result.command,
                executionTimeMs: result.executionTimeMs
            };
        }
    };
}
