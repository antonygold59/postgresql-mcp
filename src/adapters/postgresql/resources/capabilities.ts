/**
 * Capabilities Resource
 * 
 * Server version, tool categories, extension status, and recommendations.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

interface ExtensionStatus {
    installed: boolean;
    purpose: string;
    requiredFor: string[];
}

interface ToolCategory {
    count: number;
    description: string;
}

export function createCapabilitiesResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://capabilities',
        name: 'Server Capabilities',
        description: 'PostgreSQL version, installed extensions, tool categories, and recommendations',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            // Get PostgreSQL version
            const versionResult = await adapter.executeQuery('SELECT version()');
            const pgVersion = versionResult.rows?.[0]?.['version'] ?? 'Unknown';

            // Get installed extensions
            const extResult = await adapter.executeQuery(`
                SELECT extname, extversion
                FROM pg_extension
                ORDER BY extname
            `);
            const extensions = extResult.rows ?? [];
            const installedNames = extensions.map((e: Record<string, unknown>) => e['extname'] as string);

            // Check critical extensions
            const hasPgStat = installedNames.includes('pg_stat_statements');
            const hasHypopg = installedNames.includes('hypopg');
            const hasPgvector = installedNames.includes('vector');
            const hasPostgis = installedNames.includes('postgis');

            // Tool categories
            const toolCategories: Record<string, ToolCategory> = {
                'Core': { count: 13, description: 'CRUD, schema, tables, indexes, health analysis' },
                'Transactions': { count: 7, description: 'BEGIN, COMMIT, ROLLBACK, savepoints' },
                'JSONB': { count: 19, description: 'jsonb_set, jsonb_extract, path queries, merge, diff' },
                'Text': { count: 11, description: 'Full-text search, trigram, fuzzy matching' },
                'Stats': { count: 8, description: 'Descriptive stats, percentiles, correlation, regression' },
                'Performance': { count: 16, description: 'EXPLAIN ANALYZE, plan compare, baseline' },
                'Admin': { count: 10, description: 'VACUUM, ANALYZE, REINDEX, configuration' },
                'Monitoring': { count: 11, description: 'Database sizes, connections, replication' },
                'Backup': { count: 9, description: 'pg_dump, COPY, physical backup, restore validation' },
                'Schema': { count: 10, description: 'Schemas, sequences, views, functions, triggers' },
                'Vector': { count: 14, description: 'pgvector - similarity search, clustering' },
                'PostGIS': { count: 12, description: 'Geospatial operations, spatial indexes' },
                'Partitioning': { count: 6, description: 'Range/list/hash partitioning management' }
            };

            // Critical extension status
            const criticalExtensions: Record<string, ExtensionStatus> = {
                pg_stat_statements: {
                    installed: hasPgStat,
                    purpose: 'Query performance tracking',
                    requiredFor: ['get_top_queries', 'performance monitoring']
                },
                hypopg: {
                    installed: hasHypopg,
                    purpose: 'Hypothetical index testing (zero-risk)',
                    requiredFor: ['explain_query with hypothetical indexes']
                },
                pgvector: {
                    installed: hasPgvector,
                    purpose: 'Vector similarity search',
                    requiredFor: ['All pg_vector_* tools', 'semantic search']
                },
                postgis: {
                    installed: hasPostgis,
                    purpose: 'Geospatial operations',
                    requiredFor: ['All pg_geo_* tools', 'spatial queries']
                }
            };

            // Generate recommendations
            const recommendations: { priority: string; extension: string; sql: string; reason: string }[] = [];

            if (!hasPgStat) {
                recommendations.push({
                    priority: 'HIGH',
                    extension: 'pg_stat_statements',
                    sql: 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;',
                    reason: 'Critical for performance monitoring'
                });
            }
            if (!hasHypopg) {
                recommendations.push({
                    priority: 'MEDIUM',
                    extension: 'hypopg',
                    sql: 'CREATE EXTENSION IF NOT EXISTS hypopg;',
                    reason: 'Enables risk-free index testing'
                });
            }

            return {
                serverVersion: '0.3.0',
                postgresqlVersion: pgVersion,
                totalTools: 146,
                totalResources: 15,
                totalPrompts: 7,
                toolCategories,
                installedExtensions: extensions,
                criticalExtensions,
                recommendations
            };
        }
    };
}
