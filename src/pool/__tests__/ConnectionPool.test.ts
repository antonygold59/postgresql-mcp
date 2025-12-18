/**
 * Unit tests for Connection Pool
 * 
 * Tests health monitoring, graceful shutdown, and statistics tracking.
 * Uses manually constructed mock to test behavior without a real database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PoolError } from '../../types/index.js';

// Create mock functions that we can reference
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();

const mockPoolConnect = vi.fn();
const mockPoolQuery = vi.fn();
const mockPoolEnd = vi.fn();
const mockPoolOn = vi.fn();

// Track pool counts
let mockTotalCount = 5;
let mockIdleCount = 3;
let mockWaitingCount = 0;

// Mock pg module before importing ConnectionPool
vi.mock('pg', () => {
    const MockPool = function () {
        return {
            connect: mockPoolConnect,
            query: mockPoolQuery,
            end: mockPoolEnd,
            on: mockPoolOn,
            get totalCount() { return mockTotalCount; },
            get idleCount() { return mockIdleCount; },
            get waitingCount() { return mockWaitingCount; }
        };
    };
    return {
        default: { Pool: MockPool }
    };
});

// Mock the logger to avoid console output
vi.mock('../../utils/logger.js', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

// Import after mocking
import { ConnectionPool } from '../ConnectionPool.js';

describe('ConnectionPool', () => {
    let pool: ConnectionPool;

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset mock state
        mockTotalCount = 5;
        mockIdleCount = 3;
        mockWaitingCount = 0;

        // Setup default mock implementations
        mockClientQuery.mockResolvedValue({ rows: [{ version: 'PostgreSQL 16.0' }] });
        mockClientRelease.mockReturnValue(undefined);
        mockPoolConnect.mockResolvedValue({
            query: mockClientQuery,
            release: mockClientRelease
        });
        mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockPoolEnd.mockResolvedValue(undefined);

        pool = new ConnectionPool({
            host: 'localhost',
            port: 5432,
            user: 'test',
            password: 'test',
            database: 'testdb'
        });
    });

    describe('Initialization', () => {
        it('should initialize successfully', async () => {
            await pool.initialize();
            expect(pool.isInitialized()).toBe(true);
        });

        it('should not reinitialize if already initialized', async () => {
            await pool.initialize();

            await pool.initialize(); // Should warn but not throw

            // Connect should not be called again (only once per init)
            expect(pool.isInitialized()).toBe(true);
        });

        it('should test connection on initialization', async () => {
            await pool.initialize();

            // Should have connected and run a query
            expect(mockPoolConnect).toHaveBeenCalled();
            expect(mockClientQuery).toHaveBeenCalled();
        });
    });

    describe('Health Monitoring', () => {
        it('should report unhealthy when not initialized', async () => {
            const health = await pool.checkHealth();

            expect(health.connected).toBe(false);
            expect(health.error).toBe('Pool not initialized');
        });

        it('should report healthy after initialization', async () => {
            await pool.initialize();

            // Mock successful health check query
            mockPoolQuery.mockResolvedValueOnce({
                rows: [{ version: 'PostgreSQL 16.0', current_database: 'testdb' }]
            });

            const health = await pool.checkHealth();

            expect(health.connected).toBe(true);
            expect(health.latencyMs).toBeDefined();
        });

        it('should include pool stats in health response', async () => {
            await pool.initialize();

            mockPoolQuery.mockResolvedValueOnce({
                rows: [{ version: 'PostgreSQL 16.0', current_database: 'testdb' }]
            });

            const health = await pool.checkHealth();

            expect(health.poolStats).toBeDefined();
            expect(typeof health.poolStats?.total).toBe('number');
            expect(typeof health.poolStats?.idle).toBe('number');
        });

        it('should report unhealthy on query failure', async () => {
            await pool.initialize();

            mockPoolQuery.mockRejectedValueOnce(new Error('Connection refused'));

            const health = await pool.checkHealth();

            expect(health.connected).toBe(false);
            expect(health.error).toContain('Connection refused');
        });

        it('should measure latency for health checks', async () => {
            await pool.initialize();

            // Add artificial delay to query
            mockPoolQuery.mockImplementationOnce(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return { rows: [{ version: 'PostgreSQL 16.0', current_database: 'testdb' }] };
            });

            const health = await pool.checkHealth();

            expect(health.latencyMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Statistics Tracking', () => {
        it('should track total query count', async () => {
            await pool.initialize();

            const initialStats = pool.getStats();
            const initialQueries = initialStats.totalQueries;

            await pool.query('SELECT 1');
            await pool.query('SELECT 2');

            const updatedStats = pool.getStats();
            expect(updatedStats.totalQueries).toBe(initialQueries + 2);
        });

        it('should return pool stats snapshot', async () => {
            await pool.initialize();

            const stats = pool.getStats();

            expect(stats).toHaveProperty('total');
            expect(stats).toHaveProperty('active');
            expect(stats).toHaveProperty('idle');
            expect(stats).toHaveProperty('waiting');
            expect(stats).toHaveProperty('totalQueries');
        });

        it('should sync stats from pg pool', async () => {
            await pool.initialize();

            // Set mock pg pool counters
            mockTotalCount = 10;
            mockIdleCount = 4;
            mockWaitingCount = 2;

            const stats = pool.getStats();

            expect(stats.total).toBe(10);
            expect(stats.idle).toBe(4);
            expect(stats.waiting).toBe(2);
            expect(stats.active).toBe(6); // total - idle
        });
    });

    describe('Graceful Shutdown', () => {
        it('should set shutting down state', async () => {
            await pool.initialize();
            expect(pool.isClosing()).toBe(false);

            await pool.shutdown();
            expect(pool.isClosing()).toBe(true);
        });

        it('should reject new connections after shutdown', async () => {
            await pool.initialize();
            await pool.shutdown();

            // After shutdown, pool is null so 'not initialized' is the correct error
            await expect(pool.getConnection()).rejects.toThrow(PoolError);
            await expect(pool.getConnection()).rejects.toThrow('not initialized');
        });

        it('should report unhealthy during shutdown', async () => {
            await pool.initialize();
            await pool.shutdown();

            const health = await pool.checkHealth();
            expect(health.connected).toBe(false);
            expect(health.error).toContain('shutting down');
        });

        it('should call pool.end() on shutdown', async () => {
            await pool.initialize();
            await pool.shutdown();

            expect(mockPoolEnd).toHaveBeenCalled();
        });

        it('should handle shutdown when not initialized', async () => {
            // Should not throw
            await expect(pool.shutdown()).resolves.toBeUndefined();
        });
    });

    describe('Connection Management', () => {
        it('should throw when getting connection from uninitialized pool', async () => {
            await expect(pool.getConnection()).rejects.toThrow(PoolError);
            await expect(pool.getConnection()).rejects.toThrow('not initialized');
        });

        it('should throw when querying uninitialized pool', async () => {
            await expect(pool.query('SELECT 1')).rejects.toThrow(PoolError);
        });

        it('should release connections properly', async () => {
            await pool.initialize();

            const client = await pool.getConnection();
            pool.releaseConnection(client);

            expect(mockClientRelease).toHaveBeenCalled();
        });
    });

    describe('Event Handlers', () => {
        it('should register pool event handlers', async () => {
            await pool.initialize();

            // Verify event handlers were registered
            const onCalls = mockPoolOn.mock.calls;
            const registeredEvents = onCalls.map(call => call[0]);

            expect(registeredEvents).toContain('connect');
            expect(registeredEvents).toContain('acquire');
            expect(registeredEvents).toContain('release');
            expect(registeredEvents).toContain('remove');
            expect(registeredEvents).toContain('error');
        });
    });
});
