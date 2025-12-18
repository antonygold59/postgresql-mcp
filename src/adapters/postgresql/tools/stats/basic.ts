/**
 * PostgreSQL Statistics Tools - Basic Statistics
 * 
 * Core statistical analysis tools: descriptive statistics, percentiles, correlation, regression.
 */

import type { PostgresAdapter } from '../../PostgresAdapter.js';
import type { ToolDefinition, RequestContext } from '../../../../types/index.js';
import { z } from 'zod';
import { readOnly } from '../../../../utils/annotations.js';
import { getToolIcons } from '../../../../utils/icons.js';

// =============================================================================
// Statistics Schemas
// =============================================================================

export const StatsDescriptiveSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('Numeric column to analyze'),
    schema: z.string().optional().describe('Schema name (default: public)'),
    where: z.string().optional().describe('Filter condition')
});

export const StatsPercentilesSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('Numeric column'),
    percentiles: z.array(z.number()).optional().describe('Percentiles to calculate (0-1), default: [0.25, 0.5, 0.75]'),
    schema: z.string().optional().describe('Schema name'),
    where: z.string().optional().describe('Filter condition')
});

export const StatsCorrelationSchema = z.object({
    table: z.string().describe('Table name'),
    column1: z.string().describe('First numeric column'),
    column2: z.string().describe('Second numeric column'),
    schema: z.string().optional().describe('Schema name'),
    where: z.string().optional().describe('Filter condition')
});

export const StatsRegressionSchema = z.object({
    table: z.string().describe('Table name'),
    xColumn: z.string().describe('Independent variable (X)'),
    yColumn: z.string().describe('Dependent variable (Y)'),
    schema: z.string().optional().describe('Schema name'),
    where: z.string().optional().describe('Filter condition')
});

// =============================================================================
// Tool Implementations
// =============================================================================

/**
 * Descriptive statistics: count, min, max, avg, stddev, variance
 */
export function createStatsDescriptiveTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stats_descriptive',
        description: 'Calculate descriptive statistics (count, min, max, avg, stddev, variance, sum) for a numeric column.',
        group: 'stats',
        inputSchema: StatsDescriptiveSchema,
        annotations: readOnly('Descriptive Statistics'),
        icons: getToolIcons('stats', readOnly('Descriptive Statistics')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, schema, where } = StatsDescriptiveSchema.parse(params);

            const schemaPrefix = schema ? `"${schema}".` : '';
            const whereClause = where ? `WHERE ${where}` : '';

            const sql = `
                SELECT 
                    COUNT("${column}") as count,
                    MIN("${column}") as min,
                    MAX("${column}") as max,
                    AVG("${column}")::numeric(20,6) as avg,
                    STDDEV("${column}")::numeric(20,6) as stddev,
                    VARIANCE("${column}")::numeric(20,6) as variance,
                    SUM("${column}")::numeric(20,6) as sum,
                    (SELECT MODE() WITHIN GROUP (ORDER BY "${column}") FROM ${schemaPrefix}"${table}" ${whereClause}) as mode
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

            const result = await adapter.executeQuery(sql);
            const stats = result.rows?.[0] as {
                count: string | number;
                min: string | number | null;
                max: string | number | null;
                avg: string | number | null;
                stddev: string | number | null;
                variance: string | number | null;
                sum: string | number | null;
                mode: unknown;
            } | undefined;

            if (!stats) return { error: 'No stats found' };

            return {
                table: `${schema ?? 'public'}.${table}`,
                column,
                statistics: {
                    count: Number(stats.count),
                    min: stats.min !== null ? Number(stats.min) : null,
                    max: stats.max !== null ? Number(stats.max) : null,
                    avg: stats.avg !== null ? Number(stats.avg) : null,
                    stddev: stats.stddev !== null ? Number(stats.stddev) : null,
                    variance: stats.variance !== null ? Number(stats.variance) : null,
                    sum: stats.sum !== null ? Number(stats.sum) : null,
                    mode: stats.mode
                }
            };
        }
    };
}

/**
 * Calculate percentiles
 */
export function createStatsPercentilesTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stats_percentiles',
        description: 'Calculate percentiles (quartiles, custom percentiles) for a numeric column.',
        group: 'stats',
        inputSchema: StatsPercentilesSchema,
        annotations: readOnly('Percentiles'),
        icons: getToolIcons('stats', readOnly('Percentiles')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column, percentiles, schema, where } = StatsPercentilesSchema.parse(params);

            const pctiles = percentiles ?? [0.25, 0.5, 0.75];
            const schemaPrefix = schema ? `"${schema}".` : '';
            const whereClause = where ? `WHERE ${where}` : '';

            const percentileSelects = pctiles.map(p =>
                `PERCENTILE_CONT(${String(p)}) WITHIN GROUP (ORDER BY "${column}") as p${String(Math.round(p * 100))}`
            ).join(',\n                    ');

            const sql = `
                SELECT 
                    ${percentileSelects}
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

            const result = await adapter.executeQuery(sql);
            const row = (result.rows?.[0] ?? {}) as Record<string, string | number | null>;

            const percentileResults: Record<string, number | null> = {};
            for (const p of pctiles) {
                const key = `p${String(Math.round(p * 100))}`;
                percentileResults[key] = row[key] !== null ? Number(row[key]) : null;
            }

            return {
                table: `${schema ?? 'public'}.${table}`,
                column,
                percentiles: percentileResults
            };
        }
    };
}

/**
 * Correlation analysis
 */
export function createStatsCorrelationTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stats_correlation',
        description: 'Calculate Pearson correlation coefficient between two numeric columns.',
        group: 'stats',
        inputSchema: StatsCorrelationSchema,
        annotations: readOnly('Correlation Analysis'),
        icons: getToolIcons('stats', readOnly('Correlation Analysis')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, column1, column2, schema, where } = StatsCorrelationSchema.parse(params);

            const schemaPrefix = schema ? `"${schema}".` : '';
            const whereClause = where ? `WHERE ${where}` : '';

            const sql = `
                SELECT 
                    CORR("${column1}", "${column2}")::numeric(10,6) as correlation,
                    COVAR_POP("${column1}", "${column2}")::numeric(20,6) as covariance_pop,
                    COVAR_SAMP("${column1}", "${column2}")::numeric(20,6) as covariance_sample,
                    COUNT(*) as sample_size
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

            const result = await adapter.executeQuery(sql);
            const row = result.rows?.[0] as {
                correlation: string | number | null;
                covariance_pop: string | number | null;
                covariance_sample: string | number | null;
                sample_size: string | number;
            } | undefined;

            if (!row) return { error: 'No correlation data found' };

            const corr = row.correlation !== null ? Number(row.correlation) : null;
            let interpretation = 'N/A';
            if (corr !== null) {
                const absCorr = Math.abs(corr);
                if (absCorr >= 0.9) interpretation = 'Very strong';
                else if (absCorr >= 0.7) interpretation = 'Strong';
                else if (absCorr >= 0.5) interpretation = 'Moderate';
                else if (absCorr >= 0.3) interpretation = 'Weak';
                else interpretation = 'Very weak or no correlation';
                if (corr < 0) interpretation += ' (negative)';
                else interpretation += ' (positive)';
            }

            return {
                table: `${schema ?? 'public'}.${table}`,
                columns: [column1, column2],
                correlation: corr,
                interpretation,
                covariancePopulation: row.covariance_pop !== null ? Number(row.covariance_pop) : null,
                covarianceSample: row.covariance_sample !== null ? Number(row.covariance_sample) : null,
                sampleSize: Number(row.sample_size)
            };
        }
    };
}

/**
 * Linear regression
 */
export function createStatsRegressionTool(adapter: PostgresAdapter): ToolDefinition {
    return {
        name: 'pg_stats_regression',
        description: 'Perform linear regression analysis (y = mx + b) between two columns.',
        group: 'stats',
        inputSchema: StatsRegressionSchema,
        annotations: readOnly('Linear Regression'),
        icons: getToolIcons('stats', readOnly('Linear Regression')),
        handler: async (params: unknown, _context: RequestContext) => {
            const { table, xColumn, yColumn, schema, where } = StatsRegressionSchema.parse(params);

            const schemaPrefix = schema ? `"${schema}".` : '';
            const whereClause = where ? `WHERE ${where}` : '';

            const sql = `
                SELECT 
                    REGR_SLOPE("${yColumn}", "${xColumn}")::numeric(20,6) as slope,
                    REGR_INTERCEPT("${yColumn}", "${xColumn}")::numeric(20,6) as intercept,
                    REGR_R2("${yColumn}", "${xColumn}")::numeric(10,6) as r_squared,
                    REGR_AVGX("${yColumn}", "${xColumn}")::numeric(20,6) as avg_x,
                    REGR_AVGY("${yColumn}", "${xColumn}")::numeric(20,6) as avg_y,
                    REGR_COUNT("${yColumn}", "${xColumn}") as sample_size,
                    REGR_SXX("${yColumn}", "${xColumn}")::numeric(20,6) as sum_squares_x,
                    REGR_SYY("${yColumn}", "${xColumn}")::numeric(20,6) as sum_squares_y,
                    REGR_SXY("${yColumn}", "${xColumn}")::numeric(20,6) as sum_products
                FROM ${schemaPrefix}"${table}"
                ${whereClause}
            `;

            const result = await adapter.executeQuery(sql);
            const row = result.rows?.[0] as {
                slope: string | number | null;
                intercept: string | number | null;
                r_squared: string | number | null;
                avg_x: string | number | null;
                avg_y: string | number | null;
                sample_size: string | number;
            } | undefined;

            if (!row) return { error: 'No regression data found' };

            const slope = row.slope !== null ? Number(row.slope) : null;
            const intercept = row.intercept !== null ? Number(row.intercept) : null;
            const rSquared = row.r_squared !== null ? Number(row.r_squared) : null;

            let equation = 'N/A';
            if (slope !== null && intercept !== null) {
                const sign = intercept >= 0 ? '+' : '-';
                equation = `y = ${slope.toFixed(4)}x ${sign} ${Math.abs(intercept).toFixed(4)}`;
            }

            return {
                table: `${schema ?? 'public'}.${table}`,
                xColumn,
                yColumn,
                regression: {
                    slope,
                    intercept,
                    rSquared,
                    equation,
                    avgX: row.avg_x !== null ? Number(row.avg_x) : null,
                    avgY: row.avg_y !== null ? Number(row.avg_y) : null,
                    sampleSize: Number(row.sample_size)
                }
            };
        }
    };
}
