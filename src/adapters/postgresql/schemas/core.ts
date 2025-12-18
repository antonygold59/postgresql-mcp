/**
 * postgres-mcp - Core Tool Schemas
 * 
 * Input validation schemas for core database operations.
 */

import { z } from 'zod';

// =============================================================================
// Query Schemas
// =============================================================================

export const ReadQuerySchema = z.object({
    sql: z.string().describe('SELECT query to execute'),
    params: z.array(z.unknown()).optional().describe('Query parameters ($1, $2, etc.)')
});

export const WriteQuerySchema = z.object({
    sql: z.string().describe('INSERT/UPDATE/DELETE query to execute'),
    params: z.array(z.unknown()).optional().describe('Query parameters ($1, $2, etc.)')
});

// =============================================================================
// Table Schemas
// =============================================================================

export const ListTablesSchema = z.object({
    schema: z.string().optional().describe('Schema name (default: all user schemas)')
});

export const DescribeTableSchema = z.object({
    table: z.string().describe('Table name'),
    schema: z.string().optional().describe('Schema name (default: public)')
});

export const CreateTableSchema = z.object({
    name: z.string().describe('Table name'),
    schema: z.string().optional().describe('Schema name (default: public)'),
    columns: z.array(z.object({
        name: z.string(),
        type: z.string(),
        nullable: z.boolean().optional(),
        primaryKey: z.boolean().optional(),
        unique: z.boolean().optional(),
        default: z.string().optional(),
        references: z.object({
            table: z.string(),
            column: z.string(),
            onDelete: z.string().optional(),
            onUpdate: z.string().optional()
        }).optional()
    })).describe('Column definitions'),
    ifNotExists: z.boolean().optional().describe('Use IF NOT EXISTS')
});

export const DropTableSchema = z.object({
    table: z.string().describe('Table name'),
    schema: z.string().optional().describe('Schema name (default: public)'),
    ifExists: z.boolean().optional().describe('Use IF EXISTS'),
    cascade: z.boolean().optional().describe('Use CASCADE')
});

// =============================================================================
// Index Schemas
// =============================================================================

export const GetIndexesSchema = z.object({
    table: z.string().describe('Table name'),
    schema: z.string().optional().describe('Schema name (default: public)')
});

export const CreateIndexSchema = z.object({
    name: z.string().describe('Index name'),
    table: z.string().describe('Table name'),
    schema: z.string().optional().describe('Schema name (default: public)'),
    columns: z.array(z.string()).describe('Columns to index'),
    unique: z.boolean().optional().describe('Create a unique index'),
    type: z.enum(['btree', 'hash', 'gist', 'gin', 'spgist', 'brin']).optional().describe('Index type'),
    where: z.string().optional().describe('Partial index condition'),
    concurrently: z.boolean().optional().describe('Create index concurrently')
});

// =============================================================================
// Transaction Schemas
// =============================================================================

export const BeginTransactionSchema = z.object({
    isolationLevel: z.enum([
        'READ UNCOMMITTED',
        'READ COMMITTED',
        'REPEATABLE READ',
        'SERIALIZABLE'
    ]).optional().describe('Transaction isolation level')
});

export const TransactionIdSchema = z.object({
    transactionId: z.string().describe('Transaction ID from pg_transaction_begin')
});

export const SavepointSchema = z.object({
    transactionId: z.string().describe('Transaction ID'),
    name: z.string().describe('Savepoint name')
});

export const ExecuteInTransactionSchema = z.object({
    transactionId: z.string().describe('Transaction ID'),
    sql: z.string().describe('SQL to execute'),
    params: z.array(z.unknown()).optional().describe('Query parameters')
});

export const TransactionExecuteSchema = z.object({
    statements: z.array(z.object({
        sql: z.string(),
        params: z.array(z.unknown()).optional()
    })).describe('Statements to execute atomically'),
    isolationLevel: z.string().optional().describe('Transaction isolation level')
});
