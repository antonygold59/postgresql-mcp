/**
 * postgres-mcp - pg_cron Tool Schemas
 * 
 * Input validation schemas for scheduled job management.
 */

import { z } from 'zod';

/**
 * Schedule for cron jobs. Supports:
 * - Standard cron: "0 10 * * *" (daily at 10:00)
 * - Interval: "30 seconds" (every 30 seconds)
 * - Special: "0 12 $ * *" (noon on last day of month)
 */
export const CronScheduleSchema = z.object({
    schedule: z.string().describe('Cron schedule expression (e.g., "0 10 * * *" or "30 seconds")'),
    command: z.string().describe('SQL command to execute'),
    jobName: z.string().optional().describe('Optional unique name for the job')
});

export const CronScheduleInDatabaseSchema = z.object({
    jobName: z.string().describe('Unique name for the job'),
    schedule: z.string().describe('Cron schedule expression'),
    command: z.string().describe('SQL command to execute'),
    database: z.string().describe('Target database name'),
    username: z.string().optional().describe('User to run the job as'),
    active: z.boolean().optional().describe('Whether the job is active (default: true)')
});

export const CronUnscheduleSchema = z.object({
    jobId: z.number().optional().describe('Job ID to remove'),
    jobName: z.string().optional().describe('Job name to remove')
}).refine(
    data => data.jobId !== undefined || data.jobName !== undefined,
    { message: 'Either jobId or jobName must be provided' }
);

export const CronAlterJobSchema = z.object({
    jobId: z.number().describe('Job ID to modify'),
    schedule: z.string().optional().describe('New cron schedule'),
    command: z.string().optional().describe('New SQL command'),
    database: z.string().optional().describe('New target database'),
    username: z.string().optional().describe('New username'),
    active: z.boolean().optional().describe('Enable/disable the job')
});

export const CronJobRunDetailsSchema = z.object({
    jobId: z.number().optional().describe('Filter by job ID'),
    status: z.enum(['running', 'succeeded', 'failed']).optional().describe('Filter by status'),
    limit: z.number().optional().describe('Maximum records to return (default: 100)')
});

export const CronCleanupHistorySchema = z.object({
    olderThanDays: z.number().optional().describe('Delete records older than N days (default: 7)'),
    jobId: z.number().optional().describe('Clean up only for specific job')
});
