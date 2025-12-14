/**
 * postgres-mcp - MCP Server Wrapper
 * 
 * Wraps the MCP SDK server with database adapter integration,
 * tool filtering, and graceful shutdown support.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import type { ToolFilterConfig } from '../types/index.js';
import { parseToolFilter } from '../filtering/ToolFilter.js';
import { logger } from '../utils/logger.js';

export interface ServerConfig {
    name: string;
    version: string;
    adapter: DatabaseAdapter;
    toolFilter?: string | undefined;
}

/**
 * PostgreSQL MCP Server
 */
export class PostgresMcpServer {
    private server: McpServer;
    private adapter: DatabaseAdapter;
    private filterConfig: ToolFilterConfig;
    private transport: StdioServerTransport | null = null;

    constructor(config: ServerConfig) {
        this.adapter = config.adapter;
        this.filterConfig = parseToolFilter(config.toolFilter);

        this.server = new McpServer({
            name: config.name,
            version: config.version
        });

        logger.info('MCP Server initialized', {
            name: config.name,
            version: config.version,
            toolFilter: config.toolFilter ?? 'none'
        });
    }

    /**
     * Register all tools, resources, and prompts
     */
    private registerComponents(): void {
        // Register tools (with filtering)
        this.adapter.registerTools(this.server, this.filterConfig.enabledTools);

        // Register resources
        this.adapter.registerResources(this.server);

        // Register prompts
        this.adapter.registerPrompts(this.server);

        const toolCount = this.filterConfig.enabledTools.size;
        const resourceCount = this.adapter.getResourceDefinitions().length;
        const promptCount = this.adapter.getPromptDefinitions().length;

        logger.info('Components registered', {
            tools: toolCount,
            resources: resourceCount,
            prompts: promptCount
        });
    }

    /**
     * Start the server with stdio transport
     */
    async start(): Promise<void> {
        // Register all components
        this.registerComponents();

        // Create and connect transport
        this.transport = new StdioServerTransport();

        await this.server.connect(this.transport);

        logger.info('MCP Server started with stdio transport');
    }

    /**
     * Gracefully stop the server
     */
    async stop(): Promise<void> {
        logger.info('Stopping MCP Server...');

        try {
            await this.server.close();
            logger.info('MCP Server stopped');
        } catch (error) {
            logger.error('Error stopping server', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get the underlying MCP server instance
     */
    getMcpServer(): McpServer {
        return this.server;
    }

    /**
     * Get the database adapter
     */
    getAdapter(): DatabaseAdapter {
        return this.adapter;
    }

    /**
     * Get filter configuration
     */
    getFilterConfig(): ToolFilterConfig {
        return this.filterConfig;
    }
}
