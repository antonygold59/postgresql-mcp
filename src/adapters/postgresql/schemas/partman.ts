/**
 * postgres-mcp - pg_partman Tool Schemas
 * 
 * Input validation schemas for automated partition management.
 */

import { z } from 'zod';

/**
 * Schema for creating a partition set with pg_partman.
 * Uses partman.create_parent() function.
 */
export const PartmanCreateParentSchema = z.object({
    parentTable: z.string().describe('Parent table name (schema.table format)'),
    controlColumn: z.string().describe('Column used for partitioning (timestamp or integer)'),
    interval: z.string().describe('Partition interval (e.g., "1 month", "1 day", "1 week", "10000" for integer)'),
    premake: z.number().optional().describe('Number of partitions to create in advance (default: 4)'),
    startPartition: z.string().optional().describe('Starting value for first partition (timestamp or integer)'),
    templateTable: z.string().optional().describe('Template table for indexes/privileges (schema.table format)'),
    epochType: z.enum(['seconds', 'milliseconds', 'nanoseconds']).optional()
        .describe('If control column is integer representing epoch time'),
    defaultPartition: z.boolean().optional().describe('Create a default partition (default: true)')
});

/**
 * Schema for running partition maintenance.
 * Uses partman.run_maintenance() or run_maintenance_proc().
 */
export const PartmanRunMaintenanceSchema = z.object({
    parentTable: z.string().optional().describe('Specific parent table to maintain (all if omitted)'),
    analyze: z.boolean().optional().describe('Run ANALYZE on new partitions (default: true)')
});

/**
 * Schema for listing managed partitions.
 * Uses partman.show_partitions() function.
 */
export const PartmanShowPartitionsSchema = z.object({
    parentTable: z.string().describe('Parent table name (schema.table format)'),
    includeDefault: z.boolean().optional().describe('Include default partition in results'),
    order: z.enum(['asc', 'desc']).optional().describe('Order of partitions by boundary')
});

/**
 * Schema for checking data in default partition.
 * Uses partman.check_default() function.
 */
export const PartmanCheckDefaultSchema = z.object({
    parentTable: z.string().describe('Parent table name to check')
});

/**
 * Schema for moving data from default to child partitions.
 * Uses partman.partition_data_* functions.
 */
export const PartmanPartitionDataSchema = z.object({
    parentTable: z.string().describe('Parent table name (schema.table format)'),
    batchSize: z.number().optional().describe('Rows to move per batch (default: varies by function)'),
    lockWaitSeconds: z.number().optional().describe('Lock wait timeout in seconds')
});

/**
 * Schema for configuring retention policies.
 * Updates partman.part_config table.
 */
export const PartmanRetentionSchema = z.object({
    parentTable: z.string().describe('Parent table name (schema.table format)'),
    retention: z.string().describe('Retention period (e.g., "30 days", "3 months", "365 days")'),
    retentionKeepTable: z.boolean().optional()
        .describe('Keep tables after detaching (true) or drop them (false)')
});

/**
 * Schema for undoing partitioning.
 * Converts a partitioned table back to a regular table.
 */
export const PartmanUndoPartitionSchema = z.object({
    parentTable: z.string().describe('Parent table to convert back to regular table'),
    targetTable: z.string().optional().describe('Target table for consolidated data'),
    batchSize: z.number().optional().describe('Rows to move per batch'),
    keepTable: z.boolean().optional().describe('Keep child tables after moving data')
});

/**
 * Schema for updating partition configuration.
 */
export const PartmanUpdateConfigSchema = z.object({
    parentTable: z.string().describe('Parent table name (schema.table format)'),
    premake: z.number().optional().describe('Number of partitions to pre-make'),
    optimizeTrigger: z.number().optional().describe('Trigger optimization threshold'),
    optimizeConstraint: z.number().optional().describe('Constraint optimization threshold'),
    inheritFk: z.boolean().optional().describe('Inherit foreign keys to children'),
    retention: z.string().optional().describe('Retention period'),
    retentionKeepTable: z.boolean().optional().describe('Keep tables after detaching')
});
