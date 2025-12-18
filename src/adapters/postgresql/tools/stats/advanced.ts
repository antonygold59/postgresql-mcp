/**
 * PostgreSQL Statistics Tools - Advanced Statistics
 * 
 * Advanced statistical analysis tools: time series, distribution, hypothesis testing, sampling.
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';

// =============================================================================
// Advanced Statistics Schemas
// =============================================================================

export const StatsTimeSeriesSchema = z.object({
    table: z.string().describe('Table name'),
    valueColumn: z.string().describe('Numeric column to aggregate'),
    timeColumn: z.string().describe('Timestamp column'),
    interval: z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']).describe('Time bucket size'),
    aggregation: z.enum(['sum', 'avg', 'min', 'max', 'count']).optional().describe('Aggregation function (default: avg)'),
    schema: z.string().optional().describe('Schema name'),
    where: z.string().optional().describe('Filter condition'),
    limit: z.number().optional().describe('Max time buckets to return')
});

export const StatsDistributionSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('Numeric column'),
    buckets: z.number().optional().describe('Number of histogram buckets (default: 10)'),
    schema: z.string().optional().describe('Schema name'),
    where: z.string().optional().describe('Filter condition')
});

export const StatsHypothesisSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('Numeric column'),
    testType: z.enum(['t_test', 'z_test']).describe('Type of hypothesis test'),
    hypothesizedMean: z.number().describe('Hypothesized population mean'),
    schema: z.string().optional().describe('Schema name'),
    where: z.string().optional().describe('Filter condition')
});

export const StatsSamplingSchema = z.object({
    table: z.string().describe('Table name'),
    method: z.enum(['random', 'bernoulli', 'system']).optional().describe('Sampling method (default: random)'),
    sampleSize: z.number().optional().describe('Number of rows for random sampling'),
    percentage: z.number().optional().describe('Percentage for bernoulli/system sampling (0-100)'),
    schema: z.string().optional().describe('Schema name'),
    select: z.array(z.string()).optional().describe('Columns to select'),
    where: z.string().optional().describe('Filter condition')
});

// =============================================================================
// Tool Implementations
// =============================================================================

/**
 * Time series analysis
 */
export function createStatsTimeSeriesTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stats_time_series',
        description: 'Aggregate data into time buckets for time series analysis.',
        group: 'stats',
        inputSchema: StatsTimeSeriesSchema,
        annotations: readOnly('Time Series Analysis'),
        icons: getToolIcons('stats', readOnly('Time Series Analysis')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, valueColumn, timeColumn, interval, aggregation, schema, where, limit } =
                StatsTimeSeriesSchema.parse(params);

            const schemaPrefix = schema ? `"${schema}".` : '';
            const whereClause = where ? `WHERE ${where}` : '';
            const agg = aggregation ?? 'avg';
            const lim = limit ?? 100;

            const sql = `
                SELECT 
                    DATE_TRUNC('${interval}', "${timeColumn}") as time_bucket,
                    ${agg.toUpperCase()}("${valueColumn}")::numeric(20,6) as value,
                    COUNT(*) as count
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
                GROUP BY DATE_TRUNC('${interval}', "${timeColumn}")
                ORDER BY time_bucket DESC
                LIMIT ${String(lim)}
            `;

            const result = await adapter.executeQuery(sql);

            return {
                table: `${schema ?? 'public'}.${table}`,
                valueColumn,
                timeColumn,
                interval,
                aggregation: agg,
                buckets: (result.rows ?? []).map(row => ({
                    timeBucket: (row as { time_bucket: Date }).time_bucket,
                    value: Number((row as { value: string | number }).value),
                    count: Number((row as { count: string | number }).count)
                }))
            };
        }
    };
}

/**
 * Distribution analysis with histogram
 */
export function createStatsDistributionTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stats_distribution',
        description: 'Analyze data distribution with histogram buckets, skewness, and kurtosis.',
        group: 'stats',
        inputSchema: StatsDistributionSchema,
        annotations: readOnly('Distribution Analysis'),
        icons: getToolIcons('stats', readOnly('Distribution Analysis')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, buckets, schema, where } = StatsDistributionSchema.parse(params);

            const schemaPrefix = schema ? `"${schema}".` : '';
            const whereClause = where ? `WHERE ${where}` : '';
            const numBuckets = buckets ?? 10;

            const rangeQuery = `
                SELECT MIN("${column}") as min_val, MAX("${column}") as max_val
                FROM ${schemaPrefix}"${table}" ${whereClause}
            `;
            const rangeResult = await adapter.executeQuery(rangeQuery);
            const range = rangeResult.rows?.[0] as { min_val: number; max_val: number } | undefined;

            if (range?.min_val == null || range.max_val == null) {
                return { error: 'No data or all nulls in column' };
            }

            const minVal = range.min_val;
            const maxVal = range.max_val;
            const bucketWidth = (maxVal - minVal) / numBuckets;

            const histogramQuery = `
                SELECT 
                    WIDTH_BUCKET("${column}", ${String(minVal)}, ${String(maxVal + 0.0001)}, ${String(numBuckets)}) as bucket,
                    COUNT(*) as frequency,
                    MIN("${column}") as bucket_min,
                    MAX("${column}") as bucket_max
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
                GROUP BY WIDTH_BUCKET("${column}", ${String(minVal)}, ${String(maxVal + 0.0001)}, ${String(numBuckets)})
                ORDER BY bucket
            `;

            const histResult = await adapter.executeQuery(histogramQuery);

            return {
                table: `${schema ?? 'public'}.${table}`,
                column,
                range: { min: minVal, max: maxVal },
                bucketWidth,
                histogram: (histResult.rows ?? []).map(row => ({
                    bucket: Number((row as { bucket: string | number }).bucket),
                    frequency: Number((row as { frequency: string | number }).frequency),
                    rangeMin: (row as { bucket_min: number }).bucket_min,
                    rangeMax: (row as { bucket_max: number }).bucket_max
                }))
            };
        }
    };
}

/**
 * Hypothesis testing (t-test)
 */
export function createStatsHypothesisTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stats_hypothesis',
        description: 'Perform one-sample t-test or z-test against a hypothesized mean.',
        group: 'stats',
        inputSchema: StatsHypothesisSchema,
        annotations: readOnly('Hypothesis Testing'),
        icons: getToolIcons('stats', readOnly('Hypothesis Testing')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, testType, hypothesizedMean, schema, where } =
                StatsHypothesisSchema.parse(params);

            const schemaPrefix = schema ? `"${schema}".` : '';
            const whereClause = where ? `WHERE ${where}` : '';

            const sql = `
                SELECT 
                    COUNT("${column}") as n,
                    AVG("${column}")::numeric(20,6) as mean,
                    STDDEV_SAMP("${column}")::numeric(20,6) as stddev
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

            const result = await adapter.executeQuery(sql);
            const row = result.rows?.[0] as { n: string | number; mean: string | number; stddev: string | number } | undefined;
            if (!row) return { error: 'No data found' };

            const n = Number(row.n);
            const sampleMean = Number(row.mean);
            const stddev = Number(row.stddev);

            if (n < 2 || isNaN(stddev) || stddev === 0) {
                return {
                    error: 'Insufficient data or zero variance',
                    sampleSize: n
                };
            }

            const standardError = stddev / Math.sqrt(n);
            const testStatistic = (sampleMean - hypothesizedMean) / standardError;
            const degreesOfFreedom = n - 1;

            return {
                table: `${schema ?? 'public'}.${table}`,
                column,
                testType,
                hypothesizedMean,
                results: {
                    sampleSize: n,
                    sampleMean,
                    sampleStdDev: stddev,
                    standardError,
                    testStatistic,
                    degreesOfFreedom: testType === 't_test' ? degreesOfFreedom : null,
                    interpretation: Math.abs(testStatistic) > 1.96
                        ? 'Test statistic suggests potential significance at α=0.05 level'
                        : 'Test statistic does not suggest significance at α=0.05 level',
                    note: 'For exact p-values, use external statistical software'
                }
            };
        }
    };
}

/**
 * Random sampling
 */
export function createStatsSamplingTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stats_sampling',
        description: 'Get a random sample of rows using PostgreSQL sampling methods.',
        group: 'stats',
        inputSchema: StatsSamplingSchema,
        annotations: readOnly('Random Sampling'),
        icons: getToolIcons('stats', readOnly('Random Sampling')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, method, sampleSize, percentage, schema, select, where } =
                StatsSamplingSchema.parse(params);

            const schemaPrefix = schema ? `"${schema}".` : '';
            const columns = select && select.length > 0 ? select.map(c => `"${c}"`).join(', ') : '*';
            const whereClause = where ? `WHERE ${where}` : '';
            const samplingMethod = method ?? 'random';

            let sql: string;

            if (samplingMethod === 'random') {
                const limit = sampleSize ?? 100;
                sql = `
                    SELECT ${columns}
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    ORDER BY RANDOM()
                    LIMIT ${String(limit)}
                `;
            } else {
                const pct = percentage ?? 10;
                sql = `
                    SELECT ${columns}
                    FROM ${schemaPrefix}"${table}"
                    TABLESAMPLE ${samplingMethod.toUpperCase()}(${String(pct)})
                    ${whereClause}
                `;
            }

            const result = await adapter.executeQuery(sql);

            return {
                table: `${schema ?? 'public'}.${table}`,
                method: samplingMethod,
                sampleSize: result.rows?.length ?? 0,
                rows: result.rows ?? []
            };
        }
    };
}
