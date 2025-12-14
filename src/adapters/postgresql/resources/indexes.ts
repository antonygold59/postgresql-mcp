/**
 * Indexes Resource
 * 
 * Index usage statistics with unused/rarely-used detection and DROP recommendations.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

interface IndexRecommendation {
    type: 'UNUSED_INDEX' | 'RARELY_USED' | 'HEALTHY';
    priority?: 'HIGH' | 'MEDIUM';
    index?: string;
    table?: string;
    size?: string;
    scans?: number;
    action?: string;
    benefit?: string;
    message?: string;
}

interface IndexRow {
    schemaname: string;
    tablename: string;
    indexname: string;
    index_scans: number;
    tuples_read: number;
    tuples_fetched: number;
    index_size: string;
    size_bytes: number;
}

export function createIndexesResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://indexes',
        name: 'Index Statistics',
        description: 'Index usage statistics with unused/rarely-used detection and DROP recommendations',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            // Get index usage statistics
            const indexResult = await adapter.executeQuery(`
                SELECT
                    schemaname,
                    relname as tablename,
                    indexrelname as indexname,
                    idx_scan as index_scans,
                    idx_tup_read as tuples_read,
                    idx_tup_fetch as tuples_fetched,
                    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
                    pg_relation_size(indexrelid) as size_bytes
                FROM pg_stat_user_indexes
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
                LIMIT 50
            `);
            const indexes = (indexResult.rows ?? []) as unknown as IndexRow[];

            // Analyze indexes
            const unusedIndexes = indexes.filter((idx: IndexRow) =>
                idx.index_scans === 0 && idx.size_bytes > 1024 * 1024  // > 1MB
            );
            const rarelyUsed = indexes.filter((idx: IndexRow) =>
                idx.index_scans > 0 &&
                idx.index_scans < 100 &&
                idx.size_bytes > 10 * 1024 * 1024  // > 10MB
            );

            // Generate recommendations
            const recommendations: IndexRecommendation[] = [];

            for (const idx of unusedIndexes.slice(0, 5)) {
                recommendations.push({
                    type: 'UNUSED_INDEX',
                    priority: 'HIGH',
                    index: idx.schemaname + '.' + idx.indexname,
                    table: idx.tablename,
                    size: idx.index_size,
                    scans: idx.index_scans,
                    action: 'DROP INDEX IF EXISTS ' + idx.schemaname + '.' + idx.indexname + ';',
                    benefit: 'Reclaim ' + idx.index_size + ' and reduce write overhead'
                });
            }

            for (const idx of rarelyUsed.slice(0, 3)) {
                recommendations.push({
                    type: 'RARELY_USED',
                    priority: 'MEDIUM',
                    index: idx.schemaname + '.' + idx.indexname,
                    table: idx.tablename,
                    size: idx.index_size,
                    scans: idx.index_scans,
                    action: '-- Review before dropping: ' + idx.schemaname + '.' + idx.indexname,
                    benefit: idx.index_scans.toString() + ' scans for ' + idx.index_size + ' index'
                });
            }

            if (recommendations.length === 0) {
                recommendations.push({
                    type: 'HEALTHY',
                    message: 'No obvious index optimization opportunities found'
                });
            }

            return {
                totalIndexes: indexes.length,
                unusedIndexes: unusedIndexes.length,
                rarelyUsedIndexes: rarelyUsed.length,
                indexDetails: indexes.slice(0, 20),
                recommendations,
                summary: 'Analyzed ' + indexes.length.toString() + ' indexes. Found ' + unusedIndexes.length.toString() + ' unused and ' + rarelyUsed.length.toString() + ' rarely-used indexes.'
            };
        }
    };
}
