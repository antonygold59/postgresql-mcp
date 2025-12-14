/**
 * PostgreSQL Backup Tools
 * 
 * COPY operations, dump commands, and backup planning.
 * 6 tools total.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../types/index.js';
import { z } from 'zod';
import { CopyExportSchema, DumpSchemaSchema } from '../types.js';

/**
 * Get all backup tools
 */
export function getBackupTools(adapter: PostgresAdapter): ToolDefinition[] {
    return [
        createDumpTableTool(adapter),
        createDumpSchemaTool(adapter),
        createCopyExportTool(adapter),
        createCopyImportTool(adapter),
        createBackupPlanTool(adapter),
        createRestoreCommandTool(adapter)
    ];
}

function createDumpTableTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_dump_table',
        description: 'Generate CREATE TABLE statement for a table.',
        group: 'backup',
        inputSchema: z.object({
            table: z.string(),
            schema: z.string().optional(),
            includeData: z.boolean().optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { table: string; schema?: string; includeData?: boolean });
            const schemaName = parsed.schema ?? 'public';

            // Get table DDL using pg_get_tabledef function or reconstruct
            const tableInfo = await adapter.describeTable(parsed.table, schemaName);

            // Build CREATE TABLE statement
            const columns = tableInfo.columns?.map(col => {
                let def = `    "${col.name}" ${col.type}`;
                if (col.defaultValue !== undefined && col.defaultValue !== null) {
                    let defaultStr: string;
                    if (typeof col.defaultValue === 'object') {
                        defaultStr = JSON.stringify(col.defaultValue);
                    } else if (typeof col.defaultValue === 'string' || typeof col.defaultValue === 'number' || typeof col.defaultValue === 'boolean') {
                        defaultStr = String(col.defaultValue);
                    } else {
                        defaultStr = JSON.stringify(col.defaultValue);
                    }
                    def += ` DEFAULT ${defaultStr}`;
                }
                if (!col.nullable) def += ' NOT NULL';
                return def;
            }).join(',\n') ?? '';

            const createTable = `CREATE TABLE "${schemaName}"."${parsed.table}" (\n${columns}\n);`;

            const result: { createTable: string; insertStatements?: string } = { createTable };

            if (parsed.includeData) {
                const dataResult = await adapter.executeQuery(
                    `SELECT * FROM "${schemaName}"."${parsed.table}" LIMIT 1000`
                );
                if (dataResult.rows !== undefined && dataResult.rows.length > 0) {
                    const firstRow = dataResult.rows[0];
                    if (firstRow === undefined) return result;
                    const cols = Object.keys(firstRow).map(c => `"${c}"`).join(', ');
                    const inserts = dataResult.rows.map(row => {
                        const vals = Object.entries(row).map(([, value]) => {
                            if (value === null) return 'NULL';
                            if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
                            if (typeof value === 'number' || typeof value === 'boolean') return String(value);
                            // For objects, arrays, and any other types
                            return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
                        }).join(', ');
                        return `INSERT INTO "${schemaName}"."${parsed.table}" (${cols}) VALUES (${vals});`;
                    }).join('\n');
                    result.insertStatements = inserts;
                }
            }

            return result;
        }
    };
}

function createDumpSchemaTool(_adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_dump_schema',
        description: 'Get the pg_dump command for a schema or database.',
        group: 'backup',
        inputSchema: DumpSchemaSchema,
        // eslint-disable-next-line @typescript-eslint/require-await
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, schema } = DumpSchemaSchema.parse(params);

            let command = 'pg_dump';
            command += ' --format=custom';  // Custom format for pg_restore
            command += ' --verbose';

            if (schema) {
                command += ` --schema="${schema}"`;
            }
            if (table) {
                command += ` --table="${table}"`;
            }

            command += ' --file=backup.dump';
            command += ' $POSTGRES_CONNECTION_STRING';

            return {
                command,
                notes: [
                    'Replace $POSTGRES_CONNECTION_STRING with your connection string',
                    'Use --format=plain for SQL output',
                    'Add --data-only to exclude schema',
                    'Add --schema-only to exclude data'
                ]
            };
        }
    };
}

function createCopyExportTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_copy_export',
        description: 'Export query results using COPY TO (returns data as text).',
        group: 'backup',
        inputSchema: CopyExportSchema,
        handler: async (params: unknown, _context: RequestContext) => {
            const { query, format, header, delimiter } = CopyExportSchema.parse(params);

            const options: string[] = [];
            options.push(`FORMAT ${format ?? 'csv'}`);
            if (header !== false) options.push('HEADER');
            if (delimiter) options.push(`DELIMITER '${delimiter}'`);

            // Note: The sql variable would be used with COPY TO STDOUT command
            // but requires special handling - using regular query instead
            const copyCommand = `COPY (${query}) TO STDOUT WITH (${options.join(', ')})`;
            void copyCommand; // Reference to show the intended command

            // Note: Actual COPY TO STDOUT requires special handling
            // This returns the equivalent data via a regular query
            const result = await adapter.executeQuery(query);

            if (format === 'csv' || format === undefined) {
                if (result.rows === undefined || result.rows.length === 0) return { data: '', rowCount: 0 };

                const firstRowData = result.rows[0];
                if (firstRowData === undefined) return { data: '', rowCount: 0 };
                const headers = Object.keys(firstRowData);
                const delim = delimiter ?? ',';
                const lines: string[] = [];

                if (header !== false) {
                    lines.push(headers.join(delim));
                }

                for (const row of result.rows) {
                    lines.push(headers.map(h => {
                        const v = row[h];
                        if (v === null) return '';
                        if (typeof v === 'object') return JSON.stringify(v);
                        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
                            return JSON.stringify(v);
                        }
                        const s = String(v);
                        return s.includes(delim) || s.includes('"') || s.includes('\n')
                            ? `"${s.replace(/"/g, '""')}"`
                            : s;
                    }).join(delim));
                }

                return { data: lines.join('\n'), rowCount: result.rows.length };
            }

            return { rows: result.rows, rowCount: result.rows?.length ?? 0 };
        }
    };
}

function createCopyImportTool(_adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_copy_import',
        description: 'Generate COPY FROM command for importing data.',
        group: 'backup',
        inputSchema: z.object({
            table: z.string(),
            schema: z.string().optional(),
            format: z.enum(['csv', 'text', 'binary']).optional(),
            header: z.boolean().optional(),
            delimiter: z.string().optional(),
            columns: z.array(z.string()).optional()
        }),
        // eslint-disable-next-line @typescript-eslint/require-await
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as {
                table: string;
                schema?: string;
                format?: string;
                header?: boolean;
                delimiter?: string;
                columns?: string[];
            });

            const tableName = parsed.schema
                ? `"${parsed.schema}"."${parsed.table}"`
                : `"${parsed.table}"`;

            const columnClause = parsed.columns !== undefined && parsed.columns.length > 0
                ? ` (${parsed.columns.map(c => `"${c}"`).join(', ')})`
                : '';

            const options: string[] = [];
            options.push(`FORMAT ${parsed.format ?? 'csv'}`);
            if (parsed.header) options.push('HEADER');
            if (parsed.delimiter) options.push(`DELIMITER '${parsed.delimiter}'`);

            return {
                command: `COPY ${tableName}${columnClause} FROM '/path/to/file.csv' WITH (${options.join(', ')})`,
                stdinCommand: `COPY ${tableName}${columnClause} FROM STDIN WITH (${options.join(', ')})`,
                notes: 'Use \\copy in psql for client-side files'
            };
        }
    };
}

function createBackupPlanTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_create_backup_plan',
        description: 'Generate a backup strategy recommendation.',
        group: 'backup',
        inputSchema: z.object({
            frequency: z.enum(['hourly', 'daily', 'weekly']).optional(),
            retention: z.number().optional()
        }),
        handler: async (params: unknown, _context: RequestContext) => {
            const parsed = (params as { frequency?: string; retention?: number });
            const freq = parsed.frequency ?? 'daily';
            const retention = parsed.retention ?? 7;

            // Get database size for estimation
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

function createRestoreCommandTool(_adapter: PostgresAdapter): ToolDefinition {
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
