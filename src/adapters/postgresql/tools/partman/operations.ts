/**
 * PostgreSQL pg_partman Extension Tools - Operations
 * 
 * Partition operations: check_default, partition_data, set_retention, undo_partition, analyze_health.
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly, write, destructive } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';
import {
    PartmanCheckDefaultSchema,
    PartmanPartitionDataSchema,
    PartmanRetentionSchema,
    PartmanUndoPartitionSchema
} from '../../schemas/index.js';

/**
 * Check for data in default partition
 */
export function createPartmanCheckDefaultTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_partman_check_default',
        description: `Check if any data exists in the default partition that should be moved to child partitions.
Data in default indicates partitions may be missing for certain time/value ranges.`,
        group: 'partman',
        inputSchema: PartmanCheckDefaultSchema,
        annotations: readOnly('Check Partman Default'),
        icons: getToolIcons('partman', readOnly('Check Partman Default')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { parentTable } = PartmanCheckDefaultSchema.parse(params);

            const sql = `
                SELECT 
                    c.relname as default_partition,
                    n.nspname as schema,
                    c.reltuples::bigint as estimated_rows
                FROM pg_inherits i
                JOIN pg_class c ON c.oid = i.inhrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_class p ON p.oid = i.inhparent
                JOIN pg_namespace pn ON pn.oid = p.relnamespace
                WHERE (pn.nspname || '.' || p.relname) = $1
                  AND c.relname LIKE '%_default'
            `;

            const result = await adapter.executeQuery(sql, [parentTable]);
            const defaultInfo = result.rows?.[0];

            if (!defaultInfo) {
                return {
                    parentTable,
                    hasDefault: false,
                    message: 'No default partition found'
                };
            }

            const hasData = (defaultInfo['estimated_rows'] as number) > 0;

            return {
                parentTable,
                hasDefault: true,
                defaultPartition: `${String(defaultInfo['schema'])}.${String(defaultInfo['default_partition'])}`,
                estimatedRows: defaultInfo['estimated_rows'],
                hasDataInDefault: hasData,
                recommendation: hasData
                    ? 'Run pg_partman_partition_data to move data to appropriate child partitions'
                    : 'Default partition is empty - no action needed'
            };
        }
    };
}

/**
 * Move data from default to child partitions
 */
export function createPartmanPartitionDataTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_partman_partition_data',
        description: `Move data from the default partition to appropriate child partitions.
Creates new partitions if needed for the data being moved.`,
        group: 'partman',
        inputSchema: PartmanPartitionDataSchema,
        annotations: write('Partition Data'),
        icons: getToolIcons('partman', write('Partition Data')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { parentTable, batchSize, lockWaitSeconds } = PartmanPartitionDataSchema.parse(params);

            const args: string[] = [
                `p_parent_table := '${parentTable}'`
            ];

            if (batchSize !== undefined) {
                args.push(`p_batch_count := ${String(batchSize)}`);
            }
            if (lockWaitSeconds !== undefined) {
                args.push(`p_lock_wait := ${String(lockWaitSeconds)}`);
            }

            const configResult = await adapter.executeQuery(`
                SELECT control, epoch 
                FROM partman.part_config 
                WHERE parent_table = $1
            `, [parentTable]);

            const config = configResult.rows?.[0];
            if (!config) {
                return {
                    success: false,
                    error: `No pg_partman configuration found for ${parentTable}`
                };
            }

            const sql = `SELECT partman.partition_data_proc(${args.join(', ')})`;
            const result = await adapter.executeQuery(sql);
            const rowsMoved = result.rows?.[0]?.['partition_data_proc'] as number ?? 0;

            return {
                success: true,
                parentTable,
                rowsMoved,
                message: rowsMoved > 0
                    ? `Moved ${String(rowsMoved)} rows from default to child partitions`
                    : 'No rows needed to be moved'
            };
        }
    };
}

/**
 * Configure retention policies
 */
export function createPartmanSetRetentionTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_partman_set_retention',
        description: `Configure retention policy for a partition set. 
Partitions older than the retention period will be dropped or detached during maintenance.`,
        group: 'partman',
        inputSchema: PartmanRetentionSchema,
        annotations: write('Set Partition Retention'),
        icons: getToolIcons('partman', write('Set Partition Retention')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { parentTable, retention, retentionKeepTable } = PartmanRetentionSchema.parse(params);

            const updates: string[] = [`retention = '${retention}'`];
            if (retentionKeepTable !== undefined) {
                updates.push(`retention_keep_table = ${String(retentionKeepTable)}`);
            }

            const sql = `
                UPDATE partman.part_config
                SET ${updates.join(', ')}
                WHERE parent_table = $1
            `;

            const result = await adapter.executeQuery(sql, [parentTable]);

            if ((result.rowsAffected ?? 0) === 0) {
                return {
                    success: false,
                    error: `No pg_partman configuration found for ${parentTable}`
                };
            }

            return {
                success: true,
                parentTable,
                retention,
                retentionKeepTable: retentionKeepTable ?? false,
                message: `Retention policy set: partitions older than ${retention} will be ${retentionKeepTable === true ? 'detached' : 'dropped'}`
            };
        }
    };
}

/**
 * Undo partitioning - convert back to regular table
 */
export function createPartmanUndoPartitionTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_partman_undo_partition',
        description: `Convert a partitioned table back to a regular table by moving all data 
from child partitions to the parent (or a target table) and removing partition configuration.`,
        group: 'partman',
        inputSchema: PartmanUndoPartitionSchema,
        annotations: destructive('Undo Partitioning'),
        icons: getToolIcons('partman', destructive('Undo Partitioning')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { parentTable, targetTable, batchSize, keepTable } =
                PartmanUndoPartitionSchema.parse(params);

            const args: string[] = [
                `p_parent_table := '${parentTable}'`
            ];

            if (targetTable !== undefined) {
                args.push(`p_target_table := '${targetTable}'`);
            }
            if (batchSize !== undefined) {
                args.push(`p_batch_count := ${String(batchSize)}`);
            }
            if (keepTable !== undefined) {
                args.push(`p_keep_table := ${String(keepTable)}`);
            }

            const sql = `SELECT partman.undo_partition_proc(${args.join(', ')})`;
            const result = await adapter.executeQuery(sql);
            const rowsMoved = result.rows?.[0]?.['undo_partition_proc'] as number ?? 0;

            return {
                success: true,
                parentTable,
                targetTable: targetTable ?? parentTable,
                rowsMoved,
                message: `Partition set removed. ${String(rowsMoved)} rows consolidated.`
            };
        }
    };
}

/**
 * Analyze partition health and provide recommendations
 */
export function createPartmanAnalyzeHealthTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_partman_analyze_partition_health',
        description: `Analyze the health of partition sets managed by pg_partman.
Checks for issues like data in default partitions, missing premake partitions, 
stale maintenance, and retention configuration.`,
        group: 'partman',
        inputSchema: z.object({
            parentTable: z.string().optional().describe('Specific parent table to analyze (all if omitted)')
        }),
        annotations: readOnly('Analyze Partition Health'),
        icons: getToolIcons('partman', readOnly('Analyze Partition Health')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = params as { parentTable?: string };

            let configSql = `
                SELECT 
                    parent_table,
                    control,
                    partition_interval,
                    premake,
                    retention,
                    retention_keep_table,
                    automatic_maintenance,
                    template_table
                FROM partman.part_config
            `;

            const queryParams: unknown[] = [];
            if (parsed.parentTable !== undefined) {
                configSql += ' WHERE parent_table = $1';
                queryParams.push(parsed.parentTable);
            }

            const configResult = await adapter.executeQuery(configSql, queryParams);
            const configs = configResult.rows ?? [];

            const healthChecks: {
                parentTable: string;
                issues: string[];
                warnings: string[];
                recommendations: string[];
                partitionCount: number;
                hasDataInDefault: boolean;
            }[] = [];

            for (const config of configs) {
                const parentTable = config['parent_table'] as string;
                const issues: string[] = [];
                const warnings: string[] = [];
                const recommendations: string[] = [];

                const partCountResult = await adapter.executeQuery(`
                    SELECT COUNT(*) as count 
                    FROM partman.show_partitions(p_parent_table := $1)
                `, [parentTable]);
                const partitionCount = Number(partCountResult.rows?.[0]?.['count'] ?? 0);

                const premake = config['premake'] as number ?? 4;
                if (partitionCount < premake) {
                    warnings.push(`Only ${String(partitionCount)} partitions exist, premake is set to ${String(premake)}`);
                    recommendations.push('Run pg_partman_run_maintenance to create premake partitions');
                }

                const defaultCheckResult = await adapter.executeQuery(`
                    SELECT c.reltuples::bigint as rows
                    FROM pg_inherits i
                    JOIN pg_class c ON c.oid = i.inhrelid
                    JOIN pg_class p ON p.oid = i.inhparent
                    JOIN pg_namespace pn ON pn.oid = p.relnamespace
                    WHERE (pn.nspname || '.' || p.relname) = $1
                      AND c.relname LIKE '%_default'
                `, [parentTable]);

                const defaultRows = Number(defaultCheckResult.rows?.[0]?.['rows'] ?? 0);
                const hasDataInDefault = defaultRows > 0;

                if (hasDataInDefault) {
                    issues.push(`Approximately ${String(defaultRows)} rows in default partition`);
                    recommendations.push('Run pg_partman_partition_data to move data to child partitions');
                }

                const retention = config['retention'] as string | null;
                if (!retention) {
                    warnings.push('No retention policy configured');
                    recommendations.push('Consider setting retention with pg_partman_set_retention');
                }

                const autoMaint = config['automatic_maintenance'] as string;
                if (autoMaint !== 'on') {
                    warnings.push('Automatic maintenance is not enabled');
                    recommendations.push('Schedule regular maintenance with pg_cron or enable automatic_maintenance');
                }

                healthChecks.push({
                    parentTable,
                    issues,
                    warnings,
                    recommendations,
                    partitionCount,
                    hasDataInDefault
                });
            }

            const totalIssues = healthChecks.reduce((sum, h) => sum + h.issues.length, 0);
            const totalWarnings = healthChecks.reduce((sum, h) => sum + h.warnings.length, 0);

            return {
                partitionSets: healthChecks,
                summary: {
                    totalPartitionSets: healthChecks.length,
                    totalIssues,
                    totalWarnings,
                    overallHealth: totalIssues === 0
                        ? (totalWarnings === 0 ? 'healthy' : 'warnings')
                        : 'issues_found'
                }
            };
        }
    };
}
