#!/usr/bin/env node
/**
 * postgres-mcp - CLI Entry Point
 * 
 * Command-line interface for the PostgreSQL MCP server.
 */

import { Command } from 'commander';
import { PostgresAdapter } from './adapters/postgresql/index.js';
import { PostgresMcpServer } from './server/McpServer.js';
import { parseToolFilter, getFilterSummary } from './filtering/ToolFilter.js';
import { logger } from './utils/logger.js';
import type { DatabaseConfig } from './types/index.js';

const VERSION = '0.1.0';

interface CliOptions {
    postgres?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    ssl?: boolean;
    poolMax?: number;
    toolFilter?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

interface ListToolsOptions {
    filter?: string;
    group?: string;
}

const program = new Command();

program
    .name('postgres-mcp')
    .description('PostgreSQL MCP Server - Full-featured database tools for AI')
    .version(VERSION);

program
    .option('--postgres <url>', 'PostgreSQL connection string (postgres://user:pass@host:port/database)')
    .option('--host <host>', 'PostgreSQL host (default: localhost)')
    .option('--port <port>', 'PostgreSQL port (default: 5432)', parseInt)
    .option('--user <user>', 'PostgreSQL username')
    .option('--password <password>', 'PostgreSQL password')
    .option('--database <database>', 'PostgreSQL database name')
    .option('--ssl', 'Enable SSL connection')
    .option('--pool-max <size>', 'Maximum pool connections (default: 10)', parseInt)
    .option('--tool-filter <filter>', 'Tool filter string (e.g., "-vector,-postgis")')
    .option('--log-level <level>', 'Log level: debug, info, warn, error (default: info)')
    .action(async (options: CliOptions) => {
        // Set log level
        if (options.logLevel) {
            logger.setLevel(options.logLevel);
        }

        // Build database config
        const config: DatabaseConfig = {
            type: 'postgresql'
        };

        // Parse connection string or individual options
        if (options.postgres) {
            const url = new URL(options.postgres);
            config.host = url.hostname;
            config.port = parseInt(url.port) || 5432;
            config.username = url.username;
            config.password = url.password;
            config.database = url.pathname.slice(1); // Remove leading /

            if (url.searchParams.get('ssl') === 'true') {
                config.options = { ssl: true };
            }
        } else {
            config.host = options.host ?? process.env['PGHOST'] ?? 'localhost';
            config.port = options.port ?? parseInt(process.env['PGPORT'] ?? '5432');
            config.username = options.user ?? process.env['PGUSER'] ?? 'postgres';
            config.password = options.password ?? process.env['PGPASSWORD'] ?? '';
            config.database = options.database ?? process.env['PGDATABASE'] ?? 'postgres';

            if (options.ssl) {
                config.options = { ssl: true };
            }
        }

        // Pool configuration
        if (options.poolMax !== undefined && options.poolMax > 0) {
            config.pool = { max: options.poolMax };
        }

        // Create adapter and connect
        const adapter = new PostgresAdapter();

        try {
            await adapter.connect(config);

            // Get tool filter from option or environment
            const toolFilter = options.toolFilter ??
                process.env['POSTGRES_TOOL_FILTER'] ??
                process.env['MCP_TOOL_FILTER'];

            if (toolFilter) {
                const filterConfig = parseToolFilter(toolFilter);
                logger.info(getFilterSummary(filterConfig));
            }

            // Create and start server
            const server = new PostgresMcpServer({
                name: 'postgres-mcp',
                version: VERSION,
                adapter,
                toolFilter
            });

            // Handle shutdown
            const shutdown = (): void => {
                logger.info('Shutting down...');
                void server.stop().then(() => adapter.disconnect()).then(() => process.exit(0));
            };

            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);

            // Start server
            await server.start();

        } catch (error) {
            logger.error('Failed to start server', {
                error: error instanceof Error ? error.message : String(error)
            });
            await adapter.disconnect();
            process.exit(1);
        }
    });

// List tools command
program
    .command('list-tools')
    .description('List all available tools')
    .option('--filter <filter>', 'Apply tool filter')
    .option('--group <group>', 'Filter by tool group')
    // eslint-disable-next-line @typescript-eslint/require-await
    .action(async (options: ListToolsOptions) => {
        const adapter = new PostgresAdapter();
        const tools = adapter.getToolDefinitions();

        const filterConfig = parseToolFilter(options.filter);

        let filteredTools = tools;
        if (options.group) {
            filteredTools = tools.filter(t => t.group === options.group);
        }

        filteredTools = filteredTools.filter(t => filterConfig.enabledTools.has(t.name));

        console.log(`\nPostgreSQL MCP Tools (${String(filteredTools.length)}/${String(tools.length)}):\n`);

        // Group by category
        const grouped = new Map<string, typeof tools>();
        for (const tool of filteredTools) {
            const groupTools = grouped.get(tool.group) ?? [];
            groupTools.push(tool);
            grouped.set(tool.group, groupTools);
        }

        for (const [group, groupTools] of grouped) {
            console.log(`[${group}] (${String(groupTools.length)})`);
            for (const tool of groupTools) {
                const desc = tool.description.split('.')[0] ?? '';
                console.log(`  - ${tool.name}: ${desc}`);
            }
            console.log('');
        }
    });

// Print tool count
program
    .command('info')
    .description('Show server information')
    // eslint-disable-next-line @typescript-eslint/require-await
    .action(async () => {
        const adapter = new PostgresAdapter();
        const tools = adapter.getToolDefinitions();
        const resources = adapter.getResourceDefinitions();
        const prompts = adapter.getPromptDefinitions();
        const groups = adapter.getSupportedToolGroups();

        console.log('\nPostgreSQL MCP Server');
        console.log('=====================');
        console.log(`Version: ${VERSION}`);
        console.log(`Tools: ${String(tools.length)}`);
        console.log(`Resources: ${String(resources.length)}`);
        console.log(`Prompts: ${String(prompts.length)}`);
        console.log(`Tool Groups: ${groups.join(', ')}`);
        console.log('\nCapabilities:');
        const caps = adapter.getCapabilities();
        for (const [cap, enabled] of Object.entries(caps)) {
            console.log(`  ${cap}: ${enabled ? '✓' : '✗'}`);
        }
    });

program.parse();
