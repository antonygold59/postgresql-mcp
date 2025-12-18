/**
 * postgres-mcp - Extension Tool Schemas
 * 
 * Input validation schemas for PostgreSQL extensions:
 * - pg_stat_kcache
 * - citext
 * - ltree
 * - pgcrypto
 */

import { z } from 'zod';

// =============================================================================
// pg_stat_kcache Schemas
// =============================================================================

/**
 * Schema for querying enhanced statistics with kcache data.
 * Joins pg_stat_statements with pg_stat_kcache for full picture.
 */
export const KcacheQueryStatsSchema = z.object({
    limit: z.number().optional().describe('Maximum number of queries to return (default: 25)'),
    orderBy: z.enum(['total_time', 'cpu_time', 'reads', 'writes']).optional()
        .describe('Order results by metric (default: total_time)'),
    minCalls: z.number().optional().describe('Minimum call count to include')
});

/**
 * Schema for top resource consumers query.
 */
export const KcacheTopConsumersSchema = z.object({
    resource: z.enum(['cpu', 'reads', 'writes', 'page_faults']).describe('Resource type to rank by'),
    limit: z.number().optional().describe('Number of top queries to return (default: 10)')
});

/**
 * Schema for database-level aggregation.
 */
export const KcacheDatabaseStatsSchema = z.object({
    database: z.string().optional().describe('Database name (current database if omitted)')
});

/**
 * Schema for identifying resource-bound queries.
 */
export const KcacheResourceAnalysisSchema = z.object({
    queryId: z.string().optional().describe('Specific query ID to analyze (all if omitted)'),
    threshold: z.number().optional().describe('CPU/IO ratio threshold for classification (default: 0.5)')
});

// =============================================================================
// citext Schemas
// =============================================================================

/**
 * Schema for converting a text column to citext.
 */
export const CitextConvertColumnSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('Text column to convert to citext'),
    schema: z.string().optional().describe('Schema name (default: public)')
});

/**
 * Schema for listing citext columns.
 */
export const CitextListColumnsSchema = z.object({
    schema: z.string().optional().describe('Schema name to filter (all schemas if omitted)')
});

/**
 * Schema for analyzing candidate columns for citext conversion.
 */
export const CitextAnalyzeCandidatesSchema = z.object({
    patterns: z.array(z.string()).optional()
        .describe('Column name patterns to match (default: email, username, name, etc.)'),
    schema: z.string().optional().describe('Schema name to filter')
});

/**
 * Schema for citext schema advisor tool.
 */
export const CitextSchemaAdvisorSchema = z.object({
    table: z.string().describe('Table name to analyze'),
    schema: z.string().optional().describe('Schema name (default: public)')
});

// =============================================================================
// ltree Schemas
// =============================================================================

/**
 * Schema for querying ltree hierarchies (ancestors/descendants).
 */
export const LtreeQuerySchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('ltree column name'),
    path: z.string().describe('ltree path to query (e.g., "Top.Science.Astronomy")'),
    mode: z.enum(['ancestors', 'descendants', 'exact']).optional()
        .describe('Query mode: ancestors (@>), descendants (<@), or exact (default: descendants)'),
    schema: z.string().optional().describe('Schema name (default: public)'),
    limit: z.number().optional().describe('Maximum results')
});

/**
 * Schema for extracting subpath from ltree.
 */
export const LtreeSubpathSchema = z.object({
    path: z.string().describe('ltree path (e.g., "Top.Science.Astronomy.Stars")'),
    offset: z.number().describe('Starting position (0-indexed, negative counts from end)'),
    length: z.number().optional().describe('Number of labels (omit for rest of path)')
});

/**
 * Schema for finding longest common ancestor.
 */
export const LtreeLcaSchema = z.object({
    paths: z.array(z.string()).min(2).describe('Array of ltree paths to find common ancestor')
});

/**
 * Schema for pattern matching with lquery.
 */
export const LtreeMatchSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('ltree column name'),
    pattern: z.string().describe('lquery pattern (e.g., "*.Science.*" or "Top.*{1,3}.Stars")'),
    schema: z.string().optional().describe('Schema name (default: public)'),
    limit: z.number().optional().describe('Maximum results')
});

/**
 * Schema for listing ltree columns in the database.
 */
export const LtreeListColumnsSchema = z.object({
    schema: z.string().optional().describe('Schema name to filter (all schemas if omitted)')
});

/**
 * Schema for converting a text column to ltree.
 */
export const LtreeConvertColumnSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('Text column to convert to ltree'),
    schema: z.string().optional().describe('Schema name (default: public)')
});

/**
 * Schema for creating a GiST index on ltree column.
 */
export const LtreeIndexSchema = z.object({
    table: z.string().describe('Table name'),
    column: z.string().describe('ltree column name'),
    indexName: z.string().optional().describe('Custom index name (auto-generated if omitted)'),
    schema: z.string().optional().describe('Schema name (default: public)')
});

// =============================================================================
// pgcrypto Schemas
// =============================================================================

/**
 * Schema for hashing data with digest().
 */
export const PgcryptoHashSchema = z.object({
    data: z.string().describe('Data to hash'),
    algorithm: z.enum(['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512'])
        .describe('Hash algorithm'),
    encoding: z.enum(['hex', 'base64']).optional()
        .describe('Output encoding (default: hex)')
});

/**
 * Schema for HMAC authentication.
 */
export const PgcryptoHmacSchema = z.object({
    data: z.string().describe('Data to authenticate'),
    key: z.string().describe('Secret key for HMAC'),
    algorithm: z.enum(['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512'])
        .describe('Hash algorithm'),
    encoding: z.enum(['hex', 'base64']).optional()
        .describe('Output encoding (default: hex)')
});

/**
 * Schema for PGP symmetric encryption.
 */
export const PgcryptoEncryptSchema = z.object({
    data: z.string().describe('Data to encrypt'),
    password: z.string().describe('Encryption password'),
    options: z.string().optional()
        .describe('PGP options (e.g., "compress-algo=1, cipher-algo=aes256")')
});

/**
 * Schema for PGP symmetric decryption.
 */
export const PgcryptoDecryptSchema = z.object({
    encryptedData: z.string().describe('Encrypted data (base64 from encrypt)'),
    password: z.string().describe('Decryption password')
});

/**
 * Schema for generating random bytes.
 */
export const PgcryptoRandomBytesSchema = z.object({
    length: z.number().min(1).max(1024)
        .describe('Number of random bytes to generate (1-1024)'),
    encoding: z.enum(['hex', 'base64']).optional()
        .describe('Output encoding (default: hex)')
});

/**
 * Schema for generating password salt.
 */
export const PgcryptoGenSaltSchema = z.object({
    type: z.enum(['bf', 'md5', 'xdes', 'des'])
        .describe('Salt type: bf (bcrypt, recommended), md5, xdes, or des'),
    iterations: z.number().optional()
        .describe('Iteration count (for bf: 4-31, for xdes: odd 1-16777215)')
});

/**
 * Schema for password hashing with crypt().
 */
export const PgcryptoCryptSchema = z.object({
    password: z.string().describe('Password to hash or verify'),
    salt: z.string().describe('Salt from gen_salt() or stored hash for verification')
});
