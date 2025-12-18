/**
 * PostgreSQL JSONB Tools - Basic Operations
 * 
 * Core JSONB operations including extract, set, insert, delete, contains, path query, aggregation, and type checks.
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly, write } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';
import {
    JsonbExtractSchema,
    JsonbSetSchema,
    JsonbContainsSchema,
    JsonbPathQuerySchema
} from '../../schemas/index.js';

export function createJsonbExtractTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_extract',
        description: 'Extract a value from a JSONB column using a path expression.',
        group: 'jsonb',
        inputSchema: JsonbExtractSchema,
        annotations: readOnly('JSONB Extract'),
        icons: getToolIcons('jsonb', readOnly('JSONB Extract')),
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

export function createJsonbSetTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_set',
        description: 'Set a value in a JSONB column at a specified path.',
        group: 'jsonb',
        inputSchema: JsonbSetSchema,
        annotations: write('JSONB Set'),
        icons: getToolIcons('jsonb', write('JSONB Set')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, path, value, where, createMissing } = JsonbSetSchema.parse(params);
            const createFlag = createMissing !== false;
            const sql = `UPDATE "${table}" SET "${column}" = jsonb_set("${column}", $1, $2::jsonb, $3) WHERE ${where}`;
            const result = await adapter.executeQuery(sql, [path, JSON.stringify(value), createFlag]);
            return { rowsAffected: result.rowsAffected };
        }
    };
}

export function createJsonbInsertTool(adapter: PostgresAdapter): ToolDefinition {
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
        annotations: write('JSONB Insert'),
        icons: getToolIcons('jsonb', write('JSONB Insert')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; path: string[]; value: unknown; where: string; insertAfter?: boolean });
            const sql = `UPDATE "${parsed.table}" SET "${parsed.column}" = jsonb_insert("${parsed.column}", $1, $2::jsonb, $3) WHERE ${parsed.where}`;
            const result = await adapter.executeQuery(sql, [parsed.path, JSON.stringify(parsed.value), parsed.insertAfter ?? false]);
            return { rowsAffected: result.rowsAffected };
        }
    };
}

export function createJsonbDeleteTool(adapter: PostgresAdapter): ToolDefinition {
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
        annotations: write('JSONB Delete'),
        icons: getToolIcons('jsonb', write('JSONB Delete')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; path: string | string[]; where: string });
            const pathExpr = Array.isArray(parsed.path) ? `#- $1` : `- $1`;
            const sql = `UPDATE "${parsed.table}" SET "${parsed.column}" = "${parsed.column}" ${pathExpr} WHERE ${parsed.where}`;
            const result = await adapter.executeQuery(sql, [parsed.path]);
            return { rowsAffected: result.rowsAffected };
        }
    };
}

export function createJsonbContainsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_contains',
        description: 'Find rows where JSONB column contains the specified value.',
        group: 'jsonb',
        inputSchema: JsonbContainsSchema,
        annotations: readOnly('JSONB Contains'),
        icons: getToolIcons('jsonb', readOnly('JSONB Contains')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, value, select } = JsonbContainsSchema.parse(params);
            const selectCols = select !== undefined && select.length > 0 ? select.map(c => `"${c}"`).join(', ') : '*';
            const sql = `SELECT ${selectCols} FROM "${table}" WHERE "${column}" @> $1::jsonb`;
            const result = await adapter.executeQuery(sql, [JSON.stringify(value)]);
            return { rows: result.rows, count: result.rows?.length ?? 0 };
        }
    };
}

export function createJsonbPathQueryTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_path_query',
        description: 'Query JSONB using SQL/JSON path expressions (PostgreSQL 12+).',
        group: 'jsonb',
        inputSchema: JsonbPathQuerySchema,
        annotations: readOnly('JSONB Path Query'),
        icons: getToolIcons('jsonb', readOnly('JSONB Path Query')),
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

export function createJsonbAggTool(adapter: PostgresAdapter): ToolDefinition {
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
        annotations: readOnly('JSONB Aggregate'),
        icons: getToolIcons('jsonb', readOnly('JSONB Aggregate')),
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

export function createJsonbObjectTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_object',
        description: 'Build a JSONB object from key-value pairs.',
        group: 'jsonb',
        inputSchema: z.object({
            pairs: z.record(z.string(), z.unknown())
        }),
        annotations: readOnly('JSONB Object'),
        icons: getToolIcons('jsonb', readOnly('JSONB Object')),
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

export function createJsonbArrayTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_array',
        description: 'Build a JSONB array from values.',
        group: 'jsonb',
        inputSchema: z.object({
            values: z.array(z.unknown())
        }),
        annotations: readOnly('JSONB Array'),
        icons: getToolIcons('jsonb', readOnly('JSONB Array')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { values: unknown[] });
            const placeholders = parsed.values.map((_, i) => `$${String(i + 1)}::jsonb`).join(', ');
            const sql = `SELECT jsonb_build_array(${placeholders}) as result`;
            const result = await adapter.executeQuery(sql, parsed.values.map(v => JSON.stringify(v)));
            return { result: result.rows?.[0]?.['result'] };
        }
    };
}

export function createJsonbKeysTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_keys',
        description: 'Get all keys from a JSONB object.',
        group: 'jsonb',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            where: z.string().optional()
        }),
        annotations: readOnly('JSONB Keys'),
        icons: getToolIcons('jsonb', readOnly('JSONB Keys')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; where?: string });
            const whereClause = parsed.where ? ` WHERE ${parsed.where}` : '';
            const sql = `SELECT DISTINCT jsonb_object_keys("${parsed.column}") as key FROM "${parsed.table}"${whereClause}`;
            const result = await adapter.executeQuery(sql);
            return { keys: result.rows?.map(r => r['key']) };
        }
    };
}

export function createJsonbStripNullsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_jsonb_strip_nulls',
        description: 'Remove null values from a JSONB column.',
        group: 'jsonb',
        inputSchema: z.object({
            table: z.string(),
            column: z.string(),
            where: z.string()
        }),
        annotations: write('JSONB Strip Nulls'),
        icons: getToolIcons('jsonb', write('JSONB Strip Nulls')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; column: string; where: string });
            const sql = `UPDATE "${parsed.table}" SET "${parsed.column}" = jsonb_strip_nulls("${parsed.column}") WHERE ${parsed.where}`;
            const result = await adapter.executeQuery(sql);
            return { rowsAffected: result.rowsAffected };
        }
    };
}

export function createJsonbTypeofTool(adapter: PostgresAdapter): ToolDefinition {
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
        annotations: readOnly('JSONB Typeof'),
        icons: getToolIcons('jsonb', readOnly('JSONB Typeof')),
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
