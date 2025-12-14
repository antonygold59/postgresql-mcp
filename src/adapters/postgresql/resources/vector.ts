/**
 * pgvector Status Resource
 * 
 * Provides pgvector extension status, vector columns, and index information.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition } from '../../../types/index.js';

/** Safely convert unknown value to string */
function toStr(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

interface VectorColumn {
    schema: string;
    table: string;
    column: string;
    dimensions: number;
    rowCount: number;
}

interface VectorIndex {
    schema: string;
    table: string;
    indexName: string;
    indexType: string;
    column: string;
    size: string;
    options: string | null;
}

interface VectorResourceData {
    extensionInstalled: boolean;
    extensionVersion: string | null;
    vectorColumns: VectorColumn[];
    columnCount: number;
    indexes: VectorIndex[];
    indexCount: number;
    hnswIndexCount: number;
    ivfflatIndexCount: number;
    unindexedColumns: string[];
    recommendations: string[];
}

export function createVectorResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://vector',
        name: 'pgvector Status',
        description: 'pgvector extension status, vector columns, index types, and performance recommendations',
        mimeType: 'application/json',
        handler: async (): Promise<string> => {
            const result: VectorResourceData = {
                extensionInstalled: false,
                extensionVersion: null,
                vectorColumns: [],
                columnCount: 0,
                indexes: [],
                indexCount: 0,
                hnswIndexCount: 0,
                ivfflatIndexCount: 0,
                unindexedColumns: [],
                recommendations: []
            };

            try {
                // Check if pgvector is installed
                const extCheck = await adapter.executeQuery(
                    `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
                );

                if (!extCheck.rows || extCheck.rows.length === 0) {
                    result.recommendations.push('pgvector extension is not installed. Use pg_vector_create_extension to enable vector similarity search.');
                    return JSON.stringify(result, null, 2);
                }

                result.extensionInstalled = true;
                const extVersion = extCheck.rows[0]?.['extversion'];
                result.extensionVersion = typeof extVersion === 'string' ? extVersion : null;

                // Get all vector columns
                const columnsResult = await adapter.executeQuery(
                    `SELECT 
                        n.nspname as schema_name,
                        c.relname as table_name,
                        a.attname as column_name,
                        COALESCE(
                            (regexp_match(format_type(a.atttypid, a.atttypmod), 'vector\\((\\d+)\\)'))[1]::int,
                            0
                        ) as dimensions,
                        COALESCE(s.n_live_tup, 0)::int as row_count
                     FROM pg_attribute a
                     JOIN pg_class c ON a.attrelid = c.oid
                     JOIN pg_namespace n ON c.relnamespace = n.oid
                     LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
                     WHERE format_type(a.atttypid, a.atttypmod) LIKE 'vector%'
                       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                       AND a.attnum > 0
                       AND NOT a.attisdropped
                     ORDER BY n.nspname, c.relname, a.attname`
                );

                if (columnsResult.rows) {
                    for (const row of columnsResult.rows) {
                        result.vectorColumns.push({
                            schema: toStr(row['schema_name']),
                            table: toStr(row['table_name']),
                            column: toStr(row['column_name']),
                            dimensions: Number(row['dimensions'] ?? 0),
                            rowCount: Number(row['row_count'] ?? 0)
                        });
                    }
                }
                result.columnCount = result.vectorColumns.length;

                // Get vector indexes
                const indexResult = await adapter.executeQuery(
                    `SELECT 
                        n.nspname as schema_name,
                        t.relname as table_name,
                        i.relname as index_name,
                        am.amname as index_type,
                        a.attname as column_name,
                        pg_size_pretty(pg_relation_size(i.oid)) as index_size,
                        pg_get_indexdef(idx.indexrelid) as options
                     FROM pg_index idx
                     JOIN pg_class i ON idx.indexrelid = i.oid
                     JOIN pg_class t ON idx.indrelid = t.oid
                     JOIN pg_namespace n ON t.relnamespace = n.oid
                     JOIN pg_am am ON i.relam = am.oid
                     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(idx.indkey)
                     WHERE am.amname IN ('hnsw', 'ivfflat')
                       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                     ORDER BY n.nspname, t.relname, i.relname`
                );

                if (indexResult.rows) {
                    for (const row of indexResult.rows) {
                        const options = row['options'];
                        result.indexes.push({
                            schema: toStr(row['schema_name']),
                            table: toStr(row['table_name']),
                            indexName: toStr(row['index_name']),
                            indexType: toStr(row['index_type']),
                            column: toStr(row['column_name']),
                            size: toStr(row['index_size']) || '0 bytes',
                            options: typeof options === 'string' ? options : null
                        });
                    }
                }
                result.indexCount = result.indexes.length;
                result.hnswIndexCount = result.indexes.filter(i => i.indexType === 'hnsw').length;
                result.ivfflatIndexCount = result.indexes.filter(i => i.indexType === 'ivfflat').length;

                // Find unindexed vector columns
                const indexedColumns = new Set(
                    result.indexes.map(i => `${i.schema}.${i.table}.${i.column}`)
                );

                result.unindexedColumns = result.vectorColumns
                    .filter(c => !indexedColumns.has(`${c.schema}.${c.table}.${c.column}`))
                    .map(c => `${c.schema}.${c.table}.${c.column}`);

                // Generate recommendations
                if (result.columnCount === 0) {
                    result.recommendations.push('No vector columns found. Use pg_vector_add_column to add vector columns to tables.');
                }

                if (result.unindexedColumns.length > 0) {
                    result.recommendations.push(`${String(result.unindexedColumns.length)} vector columns without indexes: ${result.unindexedColumns.slice(0, 3).join(', ')}${result.unindexedColumns.length > 3 ? '...' : ''}. Use pg_vector_create_index.`);
                }

                for (const col of result.vectorColumns) {
                    if (col.rowCount > 100000 && result.unindexedColumns.includes(`${col.schema}.${col.table}.${col.column}`)) {
                        result.recommendations.push(`Large unindexed vector column: ${col.table}.${col.column} (${String(col.rowCount)} rows). HNSW index strongly recommended.`);
                    }
                }

                if (result.ivfflatIndexCount > 0 && result.hnswIndexCount === 0) {
                    result.recommendations.push('Using IVFFlat indexes only. Consider HNSW for better query performance (higher build cost).');
                }

            } catch {
                result.recommendations.push('Error accessing pgvector information. Ensure extension is properly installed.');
            }

            return JSON.stringify(result, null, 2);
        }
    };
}
