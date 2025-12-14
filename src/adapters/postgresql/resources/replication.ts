/**
 * Replication Resource
 * 
 * Primary/replica status, replication slots, WAL status, and lag monitoring.
 */

import type { PostgresAdapter } from '../PostgresAdapter.js';
import type { ResourceDefinition, RequestContext } from '../../../types/index.js';

interface ReplicationInfo {
    role: string;
    replicationSlots: Record<string, unknown>[];
    replicationStats: Record<string, unknown>[];
    walStatus: Record<string, unknown>;
    replicationDelay?: string;
}

export function createReplicationResource(adapter: PostgresAdapter): ResourceDefinition {
    return {
        uri: 'postgres://replication',
        name: 'Replication Status',
        description: 'Primary/replica status, replication slots, WAL status, and lag monitoring',
        mimeType: 'application/json',
        handler: async (_uri: string, _context: RequestContext) => {
            // Check if we're on primary or replica
            const roleResult = await adapter.executeQuery('SELECT pg_is_in_recovery() as is_replica');
            const isReplica = roleResult.rows?.[0]?.['is_replica'] === true;

            const replicationInfo: ReplicationInfo = {
                role: isReplica ? 'replica' : 'primary',
                replicationSlots: [],
                replicationStats: [],
                walStatus: {}
            };

            if (!isReplica) {
                // Primary server - get replication slots
                const slotsResult = await adapter.executeQuery(`
                    SELECT
                        slot_name,
                        slot_type,
                        database,
                        active,
                        restart_lsn,
                        confirmed_flush_lsn,
                        wal_status,
                        safe_wal_size
                    FROM pg_replication_slots
                `);
                replicationInfo.replicationSlots = slotsResult.rows ?? [];

                // Get replication statistics
                const statsResult = await adapter.executeQuery(`
                    SELECT
                        client_addr,
                        application_name,
                        state,
                        sync_state,
                        replay_lsn,
                        write_lag,
                        flush_lag,
                        replay_lag
                    FROM pg_stat_replication
                `);
                replicationInfo.replicationStats = statsResult.rows ?? [];
            } else {
                // Replica server - get replication delay
                const lagResult = await adapter.executeQuery(`
                    SELECT
                        now() - pg_last_xact_replay_timestamp() AS replication_delay
                `);
                const delay = lagResult.rows?.[0]?.['replication_delay'];
                // Handle interval type from PostgreSQL - convert to string representation
                if (delay != null && typeof delay === 'object') {
                    replicationInfo.replicationDelay = JSON.stringify(delay);
                } else if (typeof delay === 'string') {
                    replicationInfo.replicationDelay = delay;
                } else if (delay != null) {
                    replicationInfo.replicationDelay = JSON.stringify(delay);
                } else {
                    replicationInfo.replicationDelay = 'Unknown';
                }
            }

            // Get WAL status (works on both primary and replica)
            try {
                const walResult = await adapter.executeQuery(`
                    SELECT
                        pg_current_wal_lsn() as current_wal_lsn,
                        pg_walfile_name(pg_current_wal_lsn()) as current_wal_file
                `);
                replicationInfo.walStatus = walResult.rows?.[0] ?? {};
            } catch {
                // pg_current_wal_lsn() might fail on replica
                replicationInfo.walStatus = { note: 'WAL position unavailable (replica mode)' };
            }

            return replicationInfo;
        }
    };
}
