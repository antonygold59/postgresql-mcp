/**
 * postgres-mcp - PostgreSQL Zod Schemas
 * 
 * Re-exports all input validation schemas from modular files.
 */

// Core tool schemas (queries, tables, indexes, transactions)
export {
    ReadQuerySchema,
    WriteQuerySchema,
    ListTablesSchema,
    DescribeTableSchema,
    CreateTableSchema,
    DropTableSchema,
    GetIndexesSchema,
    CreateIndexSchema,
    BeginTransactionSchema,
    TransactionIdSchema,
    SavepointSchema,
    ExecuteInTransactionSchema,
    TransactionExecuteSchema
} from './core.js';

// JSONB operation schemas
export {
    JsonbExtractSchema,
    JsonbSetSchema,
    JsonbContainsSchema,
    JsonbPathQuerySchema
} from './jsonb.js';

// Text search schemas
export {
    TextSearchSchema,
    TrigramSimilaritySchema,
    RegexpMatchSchema
} from './text-search.js';

// Performance and explain schemas
export {
    ExplainSchema,
    IndexStatsSchema,
    TableStatsSchema
} from './performance.js';

// Admin operation schemas
export {
    VacuumSchema,
    AnalyzeSchema,
    ReindexSchema,
    TerminateBackendSchema,
    CancelBackendSchema
} from './admin.js';

// Monitoring schemas
export {
    DatabaseSizeSchema,
    TableSizesSchema,
    ShowSettingsSchema
} from './monitoring.js';

// Backup and export schemas
export {
    CopyExportSchema,
    DumpSchemaSchema
} from './backup.js';

// Schema management schemas
export {
    CreateSchemaSchema,
    DropSchemaSchema,
    CreateSequenceSchema,
    CreateViewSchema
} from './schema-mgmt.js';

// pgvector schemas
export {
    VectorSearchSchema,
    VectorCreateIndexSchema
} from './vector.js';

// PostGIS schemas
export {
    GeometryDistanceSchema,
    PointInPolygonSchema,
    SpatialIndexSchema
} from './postgis.js';

// Partitioning schemas
export {
    CreatePartitionedTableSchema,
    CreatePartitionSchema,
    AttachPartitionSchema,
    DetachPartitionSchema
} from './partitioning.js';

// pg_cron schemas
export {
    CronScheduleSchema,
    CronScheduleInDatabaseSchema,
    CronUnscheduleSchema,
    CronAlterJobSchema,
    CronJobRunDetailsSchema,
    CronCleanupHistorySchema
} from './cron.js';

// pg_partman schemas
export {
    PartmanCreateParentSchema,
    PartmanRunMaintenanceSchema,
    PartmanShowPartitionsSchema,
    PartmanCheckDefaultSchema,
    PartmanPartitionDataSchema,
    PartmanRetentionSchema,
    PartmanUndoPartitionSchema,
    PartmanUpdateConfigSchema
} from './partman.js';

// Extension schemas (kcache, citext, ltree, pgcrypto)
export {
    // pg_stat_kcache
    KcacheQueryStatsSchema,
    KcacheTopConsumersSchema,
    KcacheDatabaseStatsSchema,
    KcacheResourceAnalysisSchema,
    // citext
    CitextConvertColumnSchema,
    CitextListColumnsSchema,
    CitextAnalyzeCandidatesSchema,
    CitextSchemaAdvisorSchema,
    // ltree
    LtreeQuerySchema,
    LtreeSubpathSchema,
    LtreeLcaSchema,
    LtreeMatchSchema,
    LtreeListColumnsSchema,
    LtreeConvertColumnSchema,
    LtreeIndexSchema,
    // pgcrypto
    PgcryptoHashSchema,
    PgcryptoHmacSchema,
    PgcryptoEncryptSchema,
    PgcryptoDecryptSchema,
    PgcryptoRandomBytesSchema,
    PgcryptoGenSaltSchema,
    PgcryptoCryptSchema
} from './extensions.js';
