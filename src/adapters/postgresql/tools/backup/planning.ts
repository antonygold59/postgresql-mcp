/**
 * PostgreSQL Backup Tools - Planning
 * 
 * Backup planning tools: backup_plan, restore_command, physical_backup, restore_validate, backup_schedule_optimize.
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';

export function createBackupPlanTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_create_backup_plan',
        description: 'Generate a backup strategy recommendation.',
        group: 'backup',
        inputSchema: z.object({
            frequency: z.enum(['hourly', 'daily', 'weekly']).optional(),
            retention: z.number().optional()
        }),
        annotations: readOnly('Create Backup Plan'),
        icons: getToolIcons('backup', readOnly('Create Backup Plan')),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { frequency?: string; retention?: number });
            const freq = parsed.frequency ?? 'daily';
            const retention = parsed.retention ?? 7;

            const sizeResult = await adapter.executeQuery(
                `SELECT pg_database_size(current_database()) as bytes`
            );
            const sizeBytes = Number(sizeResult.rows?.[0]?.['bytes'] ?? 0);
            const sizeGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(2);

            return {
                strategy: {
                    fullBackup: {
                        command: 'pg_dump --format=custom --verbose --file=backup_$(date +%Y%m%d).dump $DATABASE_URL',
                        frequency: freq,
                        retention: `${String(retention)} backups`
                    },
                    walArchiving: {
                        note: 'Enable archive_mode and archive_command for point-in-time recovery',
                        configChanges: [
                            "archive_mode = on",
                            "archive_command = 'cp %p /path/to/wal_archive/%f'"
                        ]
                    }
                },
                estimates: {
                    databaseSize: `${sizeGB} GB`,
                    backupStoragePerDay: `~${(Number(sizeGB) * 0.3).toFixed(2)} GB (compressed)`,
                    totalStorageNeeded: `~${(Number(sizeGB) * 0.3 * retention).toFixed(2)} GB`
                }
            };
        }
    };
}

export function createRestoreCommandTool(_adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_restore_command',
        description: 'Generate pg_restore command for restoring backups.',
        group: 'backup',
        inputSchema: z.object({
            backupFile: z.string(),
            database: z.string().optional(),
            schema: z.string().optional(),
            table: z.string().optional(),
            dataOnly: z.boolean().optional(),
            schemaOnly: z.boolean().optional()
        }),
        annotations: readOnly('Restore Command'),
        icons: getToolIcons('backup', readOnly('Restore Command')),
        // eslint-disable-next-line @typescript-eslint/require-await
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as {
                backupFile: string;
                database?: string;
                schema?: string;
                table?: string;
                dataOnly?: boolean;
                schemaOnly?: boolean;
            });

            let command = 'pg_restore --verbose';

            if (parsed.database) command += ` --dbname="${parsed.database}"`;
            if (parsed.schema) command += ` --schema="${parsed.schema}"`;
            if (parsed.table) command += ` --table="${parsed.table}"`;
            if (parsed.dataOnly) command += ' --data-only';
            if (parsed.schemaOnly) command += ' --schema-only';

            command += ` "${parsed.backupFile}"`;

            return {
                command,
                notes: [
                    'Add --clean to drop database objects before recreating',
                    'Add --if-exists to avoid errors on drop',
                    'Add --no-owner to skip ownership commands',
                    'Use -j N for parallel restore (N workers)'
                ]
            };
        }
    };
}

/**
 * Generate pg_basebackup command for physical backup
 */
export function createPhysicalBackupTool(_adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_backup_physical',
        description: 'Generate pg_basebackup command for physical (binary) backup.',
        group: 'backup',
        inputSchema: z.object({
            targetDir: z.string().describe('Target directory for backup'),
            format: z.enum(['plain', 'tar']).optional().describe('Backup format'),
            checkpoint: z.enum(['fast', 'spread']).optional().describe('Checkpoint mode'),
            compress: z.number().optional().describe('Compression level 0-9')
        }),
        annotations: readOnly('Physical Backup'),
        icons: getToolIcons('backup', readOnly('Physical Backup')),
        // eslint-disable-next-line @typescript-eslint/require-await
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as {
                targetDir: string;
                format?: string;
                checkpoint?: string;
                compress?: number;
            });

            let command = 'pg_basebackup';
            command += ` -D "${parsed.targetDir}"`;
            command += ` -Ft`;
            if (parsed.format === 'plain') command = command.replace('-Ft', '-Fp');
            command += ' -Xs';
            command += ' -P';

            if (parsed.checkpoint === 'fast') {
                command += ' -c fast';
            }

            if (parsed.compress !== undefined && parsed.compress > 0) {
                command += ` -z -Z ${String(parsed.compress)}`;
            }

            command += ' -h localhost -U postgres';

            return {
                command,
                notes: [
                    'Requires replication connection permission',
                    'Add -h HOST -p PORT -U USER to specify connection',
                    'Add --slot=NAME to use a replication slot',
                    'Physical backups capture the entire cluster'
                ],
                requirements: [
                    'wal_level = replica (or higher)',
                    'max_wal_senders > 0',
                    'pg_hba.conf must allow replication connections'
                ]
            };
        }
    };
}

/**
 * Validate backup restorability
 */
export function createRestoreValidateTool(_adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_restore_validate',
        description: 'Generate commands to validate backup integrity and restorability.',
        group: 'backup',
        inputSchema: z.object({
            backupFile: z.string().describe('Path to backup file'),
            backupType: z.enum(['pg_dump', 'pg_basebackup']).optional()
        }),
        annotations: readOnly('Restore Validate'),
        icons: getToolIcons('backup', readOnly('Restore Validate')),
        // eslint-disable-next-line @typescript-eslint/require-await
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { backupFile: string; backupType?: string });
            const backupType = parsed.backupType ?? 'pg_dump';

            if (backupType === 'pg_dump') {
                return {
                    validationSteps: [
                        {
                            step: 1,
                            name: 'Check backup file integrity',
                            command: `pg_restore --list "${parsed.backupFile}"`
                        },
                        {
                            step: 2,
                            name: 'Test restore to temporary database',
                            commands: [
                                'createdb test_restore',
                                `pg_restore --dbname=test_restore "${parsed.backupFile}"`,
                                '-- Run validation queries',
                                'dropdb test_restore'
                            ]
                        },
                        {
                            step: 3,
                            name: 'Verify table counts match',
                            note: 'Compare pg_class counts between source and restored database'
                        }
                    ],
                    recommendations: [
                        'Automate validation as part of backup workflow',
                        'Keep validation logs for compliance',
                        'Test restores regularly, not just during incidents'
                    ]
                };
            } else {
                return {
                    validationSteps: [
                        {
                            step: 1,
                            name: 'Verify base backup files',
                            command: `ls -la "${parsed.backupFile}"/`
                        },
                        {
                            step: 2,
                            name: 'Check backup_label file',
                            command: `cat "${parsed.backupFile}"/backup_label`
                        },
                        {
                            step: 3,
                            name: 'Test recovery in isolated environment',
                            note: 'Configure recovery.conf/recovery.signal and start standby'
                        }
                    ],
                    recommendations: [
                        'Use pg_verifybackup (PostgreSQL 13+) for physical backup validation',
                        'Maintain WAL archives for point-in-time recovery testing',
                        'Document recovery procedures and test quarterly'
                    ]
                };
            }
        }
    };
}

/**
 * Optimize backup schedule
 */
export function createBackupScheduleOptimizeTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_backup_schedule_optimize',
        description: 'Analyze database activity patterns and recommend optimal backup schedule.',
        group: 'backup',
        inputSchema: z.object({}),
        annotations: readOnly('Backup Schedule Optimize'),
        icons: getToolIcons('backup', readOnly('Backup Schedule Optimize')),
        handler: async (_params: unknown, _context: RequestContext) => {
            const [dbSize, changeRate, connActivity] = await Promise.all([
                adapter.executeQuery(`
                    SELECT 
                        pg_database_size(current_database()) as size_bytes,
                        pg_size_pretty(pg_database_size(current_database())) as size
                `),
                adapter.executeQuery(`
                    SELECT 
                        sum(n_tup_ins + n_tup_upd + n_tup_del) as total_changes,
                        sum(n_live_tup) as total_rows
                    FROM pg_stat_user_tables
                `),
                adapter.executeQuery(`
                    SELECT 
                        extract(hour from backend_start) as hour,
                        count(*) as connection_count
                    FROM pg_stat_activity
                    WHERE backend_type = 'client backend'
                    GROUP BY extract(hour from backend_start)
                    ORDER BY hour
                `)
            ]);

            const sizeBytes = Number(dbSize.rows?.[0]?.['size_bytes'] ?? 0);
            const totalChanges = Number(changeRate.rows?.[0]?.['total_changes'] ?? 0);
            const totalRows = Number(changeRate.rows?.[0]?.['total_rows'] ?? 1);
            const changePercent = (totalChanges / Math.max(totalRows, 1)) * 100;

            let strategy: string;
            let fullBackupFrequency: string;
            let incrementalFrequency: string;

            if (sizeBytes > 100 * 1024 * 1024 * 1024) {
                strategy = 'Large database - use incremental/WAL-based backups';
                fullBackupFrequency = 'Weekly';
                incrementalFrequency = 'Continuous WAL archiving';
            } else if (changePercent > 50) {
                strategy = 'High change rate - frequent backups recommended';
                fullBackupFrequency = 'Daily';
                incrementalFrequency = 'Every 6 hours';
            } else if (changePercent > 10) {
                strategy = 'Moderate activity - standard backup schedule';
                fullBackupFrequency = 'Daily';
                incrementalFrequency = 'Every 12 hours';
            } else {
                strategy = 'Low activity - conservative backup schedule';
                fullBackupFrequency = 'Daily';
                incrementalFrequency = 'Not required';
            }

            return {
                analysis: {
                    databaseSize: dbSize.rows?.[0]?.['size'],
                    totalChanges,
                    changeRatePercent: changePercent.toFixed(2),
                    activityByHour: connActivity.rows
                },
                recommendation: {
                    strategy,
                    fullBackupFrequency,
                    incrementalFrequency,
                    bestTimeForBackup: 'Off-peak hours (typically 2-4 AM local time)',
                    retentionPolicy: 'Keep 7 daily, 4 weekly, 12 monthly'
                },
                commands: {
                    cronSchedule: `0 2 * * * pg_dump -Fc -f /backups/daily_$(date +\\%Y\\%m\\%d).dump $DATABASE_URL`,
                    walArchive: "archive_command = 'test ! -f /wal_archive/%f && cp %p /wal_archive/%f'"
                }
            };
        }
    };
}
