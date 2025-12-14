/**
 * PostgreSQL MCP Resources
 * 
 * Provides structured data access via URI patterns.
 * 15 resources total.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition } from '../../../types/index.js';

// Core resources
import { createSchemaResource } from './schema.js';
import { createTablesResource } from './tables.js';
import { createSettingsResource } from './settings.js';
import { createStatsResource } from './stats.js';
import { createActivityResource } from './activity.js';
import { createPoolResource } from './pool.js';

// Migrated resources from legacy postgres-mcp-server
import { createCapabilitiesResource } from './capabilities.js';
import { createPerformanceResource } from './performance.js';
import { createHealthResource } from './health.js';
import { createExtensionsResource } from './extensions.js';
import { createIndexesResource } from './indexes.js';
import { createReplicationResource } from './replication.js';
import { createVacuumResource } from './vacuum.js';
import { createLocksResource } from './locks.js';

/**
 * Get all PostgreSQL resources (15 total)
 * 
 * Core (6):
 * - postgres://schema - Full database schema
 * - postgres://tables - Table listing with metadata
 * - postgres://settings - PostgreSQL configuration
 * - postgres://stats - Table/index statistics with stale detection
 * - postgres://activity - Active connections and queries
 * - postgres://pool - Connection pool statistics
 * 
 * Migrated from legacy server (9):
 * - postgres://capabilities - Server version, extensions, tool categories
 * - postgres://performance - pg_stat_statements query metrics
 * - postgres://health - Comprehensive database health status
 * - postgres://extensions - Extension inventory with recommendations
 * - postgres://indexes - Index usage with unused detection
 * - postgres://replication - Replication status and lag monitoring
 * - postgres://vacuum - Vacuum stats and wraparound warnings
 * - postgres://locks - Lock contention detection
 */
export function getPostgresResources(adapter: PostgresAdapter): ResourceDefinition[] {
    return [
        // Core resources
        createSchemaResource(adapter),
        createTablesResource(adapter),
        createSettingsResource(adapter),
        createStatsResource(adapter),
        createActivityResource(adapter),
        createPoolResource(adapter),
        // Migrated resources
        createCapabilitiesResource(adapter),
        createPerformanceResource(adapter),
        createHealthResource(adapter),
        createExtensionsResource(adapter),
        createIndexesResource(adapter),
        createReplicationResource(adapter),
        createVacuumResource(adapter),
        createLocksResource(adapter)
    ];
}
