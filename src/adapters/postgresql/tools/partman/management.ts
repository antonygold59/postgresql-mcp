/**
 * PostgreSQL pg_partman Extension Tools - Management
 * 
 * Core partition management tools: extension, create_parent, run_maintenance, show_partitions, show_config.
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly, write } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';
import {
    PartmanCreateParentSchema,
    PartmanRunMaintenanceSchema,
    PartmanShowPartitionsSchema
} from '../../schemas/index.js';

/**
 * Enable the pg_partman extension
 */
export function createPartmanExtensionTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_partman_create_extension',
        description: 'Enable the pg_partman extension for automated partition management. Requires superuser privileges.',
        group: 'partman',
        inputSchema: z.object({}),
        annotations: write('Create Partman Extension'),
        icons: getToolIcons('partman', write('Create Partman Extension')),
        handler: async (_params: unknown, _context: RequestContext) => {
            await adapter.executeQuery('CREATE EXTENSION IF NOT EXISTS pg_partman');
            return { success: true, message: 'pg_partman extension enabled' };
        }
    };
}

/**
 * Create a partition set with pg_partman
 */
export function createPartmanCreateParentTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_partman_create_parent',
        description: `Create a new partition set using pg_partman's create_parent() function. 
Supports time-based and integer-based partitioning with automatic child partition creation.
The parent table must already exist before calling this function.`,
        group: 'partman',
        inputSchema: PartmanCreateParentSchema,
        annotations: write('Create Partition Parent'),
        icons: getToolIcons('partman', write('Create Partition Parent')),
        handler: async (params: unknown, _context: RequestContext) => {
            const {
                parentTable,
                controlColumn,
                interval,
                premake,
                startPartition,
                templateTable,
                epochType,
                defaultPartition
            } = PartmanCreateParentSchema.parse(params);

            const args: string[] = [
                `p_parent_table := '${parentTable}'`,
                `p_control := '${controlColumn}'`,
                `p_type := 'native'`,
                `p_interval := '${interval}'`
            ];

            if (premake !== undefined) {
                args.push(`p_premake := ${String(premake)}`);
            }
            if (startPartition !== undefined) {
                args.push(`p_start_partition := '${startPartition}'`);
            }
            if (templateTable !== undefined) {
                args.push(`p_template_table := '${templateTable}'`);
            }
            if (epochType !== undefined) {
                args.push(`p_epoch := '${epochType}'`);
            }
            if (defaultPartition !== undefined) {
                args.push(`p_default_table := ${String(defaultPartition)}`);
            }

            const sql = `SELECT partman.create_parent(${args.join(', ')})`;
            await adapter.executeQuery(sql);

            return {
                success: true,
                parentTable,
                controlColumn,
                interval,
                premake: premake ?? 4,
                message: `Partition set created for ${parentTable} on column ${controlColumn}`
            };
        }
    };
}

/**
 * Run partition maintenance
 */
export function createPartmanRunMaintenanceTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_partman_run_maintenance',
        description: `Run partition maintenance to create new child partitions and enforce retention policies.
Should be executed regularly (e.g., via pg_cron) to keep partitions current.
Maintains all partition sets if no specific parent table is specified.`,
        group: 'partman',
        inputSchema: PartmanRunMaintenanceSchema,
        annotations: write('Run Partition Maintenance'),
        icons: getToolIcons('partman', write('Run Partition Maintenance')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { parentTable, analyze } = PartmanRunMaintenanceSchema.parse(params);

            const args: string[] = [];
            if (parentTable !== undefined) {
                args.push(`p_parent_table := '${parentTable}'`);
            }
            if (analyze !== undefined) {
                args.push(`p_analyze := ${String(analyze)}`);
            }

            const sql = args.length > 0
                ? `SELECT partman.run_maintenance(${args.join(', ')})`
                : 'SELECT partman.run_maintenance()';

            await adapter.executeQuery(sql);

            return {
                success: true,
                parentTable: parentTable ?? 'all',
                analyze: analyze ?? true,
                message: parentTable !== undefined
                    ? `Maintenance completed for ${parentTable}`
                    : 'Maintenance completed for all partition sets'
            };
        }
    };
}

/**
 * Show partitions managed by pg_partman
 */
export function createPartmanShowPartitionsTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_partman_show_partitions',
        description: 'List all child partitions for a partition set managed by pg_partman.',
        group: 'partman',
        inputSchema: PartmanShowPartitionsSchema,
        annotations: readOnly('Show Partman Partitions'),
        icons: getToolIcons('partman', readOnly('Show Partman Partitions')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { parentTable, includeDefault, order } = PartmanShowPartitionsSchema.parse(params);

            const orderDir = order === 'desc' ? 'DESC' : 'ASC';
            const includeDefaultVal = includeDefault ?? false;

            const sql = `
                SELECT * FROM partman.show_partitions(
                    p_parent_table := '${parentTable}',
                    p_include_default := ${String(includeDefaultVal)},
                    p_order := '${orderDir}'
                )
            `;

            const result = await adapter.executeQuery(sql);

            return {
                parentTable,
                partitions: result.rows ?? [],
                count: result.rows?.length ?? 0
            };
        }
    };
}

/**
 * Show partition configuration
 */
export function createPartmanShowConfigTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_partman_show_config',
        description: 'View the configuration for a partition set from partman.part_config table.',
        group: 'partman',
        inputSchema: z.object({
            parentTable: z.string().optional().describe('Parent table name (all configs if omitted)')
        }),
        annotations: readOnly('Show Partman Config'),
        icons: getToolIcons('partman', readOnly('Show Partman Config')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = params as { parentTable?: string };

            let sql = `
                SELECT 
                    parent_table,
                    control,
                    partition_interval,
                    partition_type,
                    premake,
                    automatic_maintenance,
                    template_table,
                    retention,
                    retention_keep_table,
                    epoch,
                    inherit_fk,
                    default_table
                FROM partman.part_config
            `;

            const queryParams: unknown[] = [];
            if (parsed.parentTable !== undefined) {
                sql += ' WHERE parent_table = $1';
                queryParams.push(parsed.parentTable);
            }

            sql += ' ORDER BY parent_table';

            const result = await adapter.executeQuery(sql, queryParams);

            return {
                configs: result.rows ?? [],
                count: result.rows?.length ?? 0
            };
        }
    };
}
