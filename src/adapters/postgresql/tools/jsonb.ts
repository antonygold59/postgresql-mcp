/**
 * PostgreSQL JSONB Tools
 * 
 * JSONB operations including path queries, containment, and aggregation.
 * 12 tools total.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../types/index.js';
import { z } from 'zod';
import {
    JsonbExtractSchema,
    JsonbSetSchema,
    JsonbContainsSchema,
    JsonbPathQuerySchema
} from '../types.js';

/**
 * Get all JSONB tools
 */
export function getJsonbTools(adapter: PostgresAdapter): ToolDefinition[] {
    return [
        createJsonbExtractTool(adapter),
        createJsonbSetTool(adapter),
        createJsonbInsertTool(adapter),
        createJsonbDeleteTool(adapter),
        createJsonbContainsTool(adapter),
        createJsonbPathQueryTool(adapter),
        createJsonbAggTool(adapter),
        createJsonbObjectTool(adapter),
        createJsonbArrayTool(adapter),
        createJsonbKeysTool(adapter),
        createJsonbStripNullsTool(adapter),
        createJsonbTypeofTool(adapter)
    ];
}

function createJsonbExtractTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_extract',
        description: 'Extract a value from a JSONB column using a path expression.',
        group: 'jsonb',
        inputSchema: JsonbExtractSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, path, where } = JsonbExtractSchema.parse(params);
            const whereClause = where ? ` WHERE ${where}` : '';
            const sql = `SELECT "${column}" #> $1 as value FROM "${table}"${whereClause}`;
            const pathArray = path.startsWith('$.')
                ? path.slice(2).split('.').map(p => p.replace(/\[(\d+)\]/g, ',$1').split(',')).flat()
                : path.replace(/[{}]/g, '').split(',');
            const result = await adapter.executeQuery(sql, [pathArray]);
            return { values: result.rows?.map(r => r['value']) };
        }
    };
}

function createJsonbSetTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_set',
        description: 'Set a value in a JSONB column at a specified path.',
        group: 'jsonb',
        inputSchema: JsonbSetSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, path, value, where, createMissing } = JsonbSetSchema.parse(params);
            const createFlag = createMissing !== false;
            const sql = `UPDATE "${table}" SET "${column}" = jsonb_set("${column}", $1, $2::jsonb, $3) WHERE ${where}`;
            const result = await adapter.executeQuery(sql, [path, JSON.stringify(value), createFlag]);
            return { rowsAffected: result.rowsAffected };
        }
    };
}

function createJsonbInsertTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_insert',
        description: 'Insert a value into a JSONB array or object.',
        group: 'jsonb',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            path: z.array(z.string()),
            value: z.unknown(),
            where: z.string(),
            insertAfter: z.boolean().optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; path: string[]; value: unknown; where: string; insertAfter?: boolean });
            const sql = `UPDATE "${parsed.table}" SET "${parsed.column}" = jsonb_insert("${parsed.column}", $1, $2::jsonb, $3) WHERE ${parsed.where}`;
            const result = await adapter.executeQuery(sql, [parsed.path, JSON.stringify(parsed.value), parsed.insertAfter ?? false]);
            return { rowsAffected: result.rowsAffected };
        }
    };
}

function createJsonbDeleteTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_delete',
        description: 'Delete a key or array element from a JSONB column.',
        group: 'jsonb',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            path: z.union([z.string(), z.array(z.string())]),
            where: z.string()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; path: string | string[]; where: string });
            const pathExpr = Array.isArray(parsed.path) ? `#- $1` : `- $1`;
            const sql = `UPDATE "${parsed.table}" SET "${parsed.column}" = "${parsed.column}" ${pathExpr} WHERE ${parsed.where}`;
            const result = await adapter.executeQuery(sql, [parsed.path]);
            return { rowsAffected: result.rowsAffected };
        }
    };
}

function createJsonbContainsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_contains',
        description: 'Find rows where JSONB column contains the specified value.',
        group: 'jsonb',
        inputSchema: JsonbContainsSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, value, select } = JsonbContainsSchema.parse(params);
            const selectCols = select !== undefined && select.length > 0 ? select.map(c => `"${c}"`).join(', ') : '*';
            const sql = `SELECT ${selectCols} FROM "${table}" WHERE "${column}" @> $1::jsonb`;
            const result = await adapter.executeQuery(sql, [JSON.stringify(value)]);
            return { rows: result.rows, count: result.rows?.length ?? 0 };
        }
    };
}

function createJsonbPathQueryTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_path_query',
        description: 'Query JSONB using SQL/JSON path expressions (PostgreSQL 12+).',
        group: 'jsonb',
        inputSchema: JsonbPathQuerySchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, path, vars, where } = JsonbPathQuerySchema.parse(params);
            const whereClause = where ? ` WHERE ${where}` : '';
            const varsJson = vars ? JSON.stringify(vars) : '{}';
            const sql = `SELECT jsonb_path_query("${column}", $1::jsonpath, $2::jsonb) as result FROM "${table}"${whereClause}`;
            const result = await adapter.executeQuery(sql, [path, varsJson]);
            return { results: result.rows?.map(r => r['result']) };
        }
    };
}

function createJsonbAggTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_agg',
        description: 'Aggregate rows into a JSONB array.',
        group: 'jsonb',
        inputSchema: z.object({
            table: z.string(),
            select: z.array(z.string()).optional(),
            where: z.string().optional(),
            groupBy: z.string().optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; select?: string[]; where?: string; groupBy?: string });
            const selectExpr = parsed.select !== undefined && parsed.select.length > 0
                ? `jsonb_build_object(${parsed.select.map(c => `'${c}', "${c}"`).join(', ')})`
                : 'to_jsonb(t.*)';
            const whereClause = parsed.where ? ` WHERE ${parsed.where}` : '';
            const groupClause = parsed.groupBy ? ` GROUP BY "${parsed.groupBy}"` : '';
            const sql = `SELECT jsonb_agg(${selectExpr}) as result FROM "${parsed.table}" t${whereClause}${groupClause}`;
            const result = await adapter.executeQuery(sql);
            return { result: result.rows?.[0]?.['result'] };
        }
    };
}

function createJsonbObjectTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_object',
        description: 'Build a JSONB object from key-value pairs.',
        group: 'jsonb',
        inputSchema: z.object({
            pairs: z.record(z.string(), z.unknown())
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { pairs: Record<string, unknown> });
            const entries = Object.entries(parsed.pairs);
            const args = entries.flatMap(([k, v]) => [k, JSON.stringify(v)]);
            const placeholders = entries.map((_, i) => `$${String(i * 2 + 1)}, $${String(i * 2 + 2)}::jsonb`).join(', ');
            const sql = `SELECT jsonb_build_object(${placeholders}) as result`;
            const result = await adapter.executeQuery(sql, args);
            return { result: result.rows?.[0]?.['result'] };
        }
    };
}

function createJsonbArrayTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_array',
        description: 'Build a JSONB array from values.',
        group: 'jsonb',
        inputSchema: z.object({
            values: z.array(z.unknown())
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { values: unknown[] });
            const placeholders = parsed.values.map((_, i) => `$${String(i + 1)}::jsonb`).join(', ');
            const sql = `SELECT jsonb_build_array(${placeholders}) as result`;
            const result = await adapter.executeQuery(sql, parsed.values.map(v => JSON.stringify(v)));
            return { result: result.rows?.[0]?.['result'] };
        }
    };
}

function createJsonbKeysTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_keys',
        description: 'Get all keys from a JSONB object.',
        group: 'jsonb',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            where: z.string().optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; where?: string });
            const whereClause = parsed.where ? ` WHERE ${parsed.where}` : '';
            const sql = `SELECT DISTINCT jsonb_object_keys("${parsed.column}") as key FROM "${parsed.table}"${whereClause}`;
            const result = await adapter.executeQuery(sql);
            return { keys: result.rows?.map(r => r['key']) };
        }
    };
}

function createJsonbStripNullsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_strip_nulls',
        description: 'Remove null values from a JSONB column.',
        group: 'jsonb',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            where: z.string()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; where: string });
            const sql = `UPDATE "${parsed.table}" SET "${parsed.column}" = jsonb_strip_nulls("${parsed.column}") WHERE ${parsed.where}`;
            const result = await adapter.executeQuery(sql);
            return { rowsAffected: result.rowsAffected };
        }
    };
}

function createJsonbTypeofTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_typeof',
        description: 'Get the type of a JSONB value (object, array, string, number, boolean, null).',
        group: 'jsonb',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            path: z.array(z.string()).optional(),
            where: z.string().optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; path?: string[]; where?: string });
            const whereClause = parsed.where ? ` WHERE ${parsed.where}` : '';
            const pathExpr = parsed.path ? ` #> $1` : '';
            const sql = `SELECT jsonb_typeof("${parsed.column}"${pathExpr}) as type FROM "${parsed.table}"${whereClause}`;
            const queryParams = parsed.path ? [parsed.path] : [];
            const result = await adapter.executeQuery(sql, queryParams);
            return { types: result.rows?.map(r => r['type']) };
        }
    };
}
