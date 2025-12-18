/**
 * PostgreSQL Core Tools - Index Operations
 * 
 * Index listing and creation tools.
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { readOnly, write } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';
import { GetIndexesSchema, CreateIndexSchema } from '../../schemas/index.js';

/**
 * Get indexes for a table
 */
export function createGetIndexesTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_get_indexes',
        description: 'List all indexes on a table with usage statistics.',
        group: 'core',
        inputSchema: GetIndexesSchema,
        annotations: readOnly('Get Indexes'),
        icons: getToolIcons('core', readOnly('Get Indexes')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, schema } = GetIndexesSchema.parse(params);
            const indexes = await adapter.getTableIndexes(table, schema);
            return { indexes, count: indexes.length };
        }
    };
}

/**
 * Create an index
 */
export function createCreateIndexTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_create_index',
        description: 'Create an index on a table. Supports btree, hash, gin, gist, brin index types.',
        group: 'core',
        inputSchema: CreateIndexSchema,
        annotations: write('Create Index'),
        icons: getToolIcons('core', write('Create Index')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { name, table, schema, columns, unique, type, where, concurrently } =
                CreateIndexSchema.parse(params);

            const schemaPrefix = schema ? `"${schema}".` : '';
            const uniqueClause = unique ? 'UNIQUE ' : '';
            const concurrentlyClause = concurrently ? 'CONCURRENTLY ' : '';
            const usingClause = type ? `USING ${type} ` : '';
            const whereClause = where ? ` WHERE ${where}` : '';

            const columnList = columns.map(c => `"${c}"`).join(', ');

            const sql = `CREATE ${uniqueClause}INDEX ${concurrentlyClause}"${name}" ` +
                `ON ${schemaPrefix}"${table}" ${usingClause}(${columnList})${whereClause}`;

            await adapter.executeQuery(sql);

            return {
                success: true,
                index: name,
                table: `${schema ?? 'public'}.${table}`,
                sql
            };
        }
    };
}
