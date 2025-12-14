/**
 * PostgreSQL Core Database Tools
 * 
 * Fundamental database operations: read, write, table management, indexes.
 * 8 tools total.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../types/index.js';
import {
    ReadQuerySchema,
    WriteQuerySchema,
    ListTablesSchema,
    DescribeTableSchema,
    CreateTableSchema,
    DropTableSchema,
    GetIndexesSchema,
    CreateIndexSchema
} from '../types.js';

/**
 * Get all core database tools
 */
export function getCoreTools(adapter: PostgresAdapter): ToolDefinition[] {
    return [
        createReadQueryTool(adapter),
        createWriteQueryTool(adapter),
        createListTablesTool(adapter),
        createDescribeTableTool(adapter),
        createCreateTableTool(adapter),
        createDropTableTool(adapter),
        createGetIndexesTool(adapter),
        createCreateIndexTool(adapter)
    ];
}

/**
 * Execute a read-only SQL query
 */
function createReadQueryTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_read_query',
        description: 'Execute a read-only SQL query (SELECT, WITH). Returns rows as JSON.',
        group: 'core',
        inputSchema: ReadQuerySchema,
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
function createWriteQueryTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_write_query',
        description: 'Execute a write SQL query (INSERT, UPDATE, DELETE). Returns affected row count.',
        group: 'core',
        inputSchema: WriteQuerySchema,
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

/**
 * List all tables in the database
 */
function createListTablesTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_list_tables',
        description: 'List all tables, views, and materialized views with metadata.',
        group: 'core',
        inputSchema: ListTablesSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { schema } = ListTablesSchema.parse(params);
            let tables = await adapter.listTables();

            if (schema) {
                tables = tables.filter(t => t.schema === schema);
            }

            return {
                tables,
                count: tables.length
            };
        }
    };
}

/**
 * Describe a table's structure
 */
function createDescribeTableTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_describe_table',
        description: 'Get detailed table structure including columns, types, and constraints.',
        group: 'core',
        inputSchema: DescribeTableSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, schema } = DescribeTableSchema.parse(params);
            return adapter.describeTable(table, schema);
        }
    };
}

/**
 * Create a new table
 */
function createCreateTableTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_create_table',
        description: 'Create a new table with specified columns and constraints.',
        group: 'core',
        inputSchema: CreateTableSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { name, schema, columns, ifNotExists } = CreateTableSchema.parse(params);

            const schemaPrefix = schema ? `"${schema}".` : '';
            const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS ' : '';

            const columnDefs = columns.map(col => {
                const parts = [`"${col.name}"`, col.type];

                if (col.primaryKey) {
                    parts.push('PRIMARY KEY');
                }
                if (col.unique && !col.primaryKey) {
                    parts.push('UNIQUE');
                }
                if (col.nullable === false) {
                    parts.push('NOT NULL');
                }
                if (col.default !== undefined) {
                    parts.push(`DEFAULT ${col.default}`);
                }
                if (col.references) {
                    let ref = `REFERENCES "${col.references.table}"("${col.references.column}")`;
                    if (col.references.onDelete) {
                        ref += ` ON DELETE ${col.references.onDelete}`;
                    }
                    if (col.references.onUpdate) {
                        ref += ` ON UPDATE ${col.references.onUpdate}`;
                    }
                    parts.push(ref);
                }

                return parts.join(' ');
            });

            const sql = `CREATE TABLE ${ifNotExistsClause}${schemaPrefix}"${name}" (\n  ${columnDefs.join(',\n  ')}\n)`;

            await adapter.executeQuery(sql);

            return {
                success: true,
                table: `${schema ?? 'public'}.${name}`,
                sql
            };
        }
    };
}

/**
 * Drop a table
 */
function createDropTableTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_drop_table',
        description: 'Drop a table from the database.',
        group: 'core',
        inputSchema: DropTableSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, schema, ifExists, cascade } = DropTableSchema.parse(params);

            const schemaPrefix = schema ? `"${schema}".` : '';
            const ifExistsClause = ifExists ? 'IF EXISTS ' : '';
            const cascadeClause = cascade ? ' CASCADE' : '';

            const sql = `DROP TABLE ${ifExistsClause}${schemaPrefix}"${table}"${cascadeClause}`;

            await adapter.executeQuery(sql);

            return {
                success: true,
                dropped: `${schema ?? 'public'}.${table}`
            };
        }
    };
}

/**
 * Get indexes for a table
 */
function createGetIndexesTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_get_indexes',
        description: 'List all indexes on a table with usage statistics.',
        group: 'core',
        inputSchema: GetIndexesSchema,
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
function createCreateIndexTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_create_index',
        description: 'Create an index on a table. Supports btree, hash, gin, gist, brin index types.',
        group: 'core',
        inputSchema: CreateIndexSchema,
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
