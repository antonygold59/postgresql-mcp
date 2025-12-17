/**
 * postgres-mcp - Structured Logger
 * 
 * Centralized logging utility with levels and structured output.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    details?: Record<string, unknown> | undefined;
}

class Logger {
    private minLevel: LogLevel = 'info';

    private readonly levelPriority: Record<LogLevel, number> = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    };

    setLevel(level: LogLevel): void {
        this.minLevel = level;
    }

    private shouldLog(level: LogLevel): boolean {
        return this.levelPriority[level] >= this.levelPriority[this.minLevel];
    }

    /**
     * List of keys that contain sensitive data and should be redacted
     */
    private readonly sensitiveKeys: ReadonlySet<string> = new Set([
        'password',
        'secret',
        'token',
        'key',
        'apikey',
        'api_key',
        'accesstoken',
        'access_token',
        'refreshtoken',
        'refresh_token',
        'authorization',
        'credential',
        'credentials',
        // OAuth-specific sensitive fields
        'issuer',
        'audience',
        'jwksuri',
        'jwks_uri',
        'client_secret',
        'clientsecret'
    ]);

    /**
     * Sanitize details object by redacting sensitive values
     * This prevents clear-text logging of OAuth config and other secrets
     */
    private sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
        const sanitized: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(details)) {
            const lowerKey = key.toLowerCase();

            // Check if this key matches any sensitive pattern
            const isSensitive = this.sensitiveKeys.has(lowerKey) ||
                [...this.sensitiveKeys].some(sk => lowerKey.includes(sk));

            if (isSensitive && value !== undefined && value !== null) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Recursively sanitize nested objects
                sanitized[key] = this.sanitizeDetails(value as Record<string, unknown>);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    private formatEntry(entry: LogEntry): string {
        const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
        if (entry.details) {
            const sanitizedDetails = this.sanitizeDetails(entry.details);
            return `${base} ${JSON.stringify(sanitizedDetails)}`;
        }
        return base;
    }

    private log(level: LogLevel, message: string, details?: Record<string, unknown>): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const entry: LogEntry = {
            level,
            message,
            timestamp: new Date().toISOString(),
            details
        };

        const formatted = this.formatEntry(entry);

        // Write to stderr to avoid interfering with MCP stdio transport
        switch (level) {
            case 'error':
                console.error(formatted);
                break;
            case 'warn':
                console.warn(formatted);
                break;
            default:
                console.error(formatted); // Use stderr for all levels
        }
    }

    debug(message: string, details?: Record<string, unknown>): void {
        this.log('debug', message, details);
    }

    info(message: string, details?: Record<string, unknown>): void {
        this.log('info', message, details);
    }

    warn(message: string, details?: Record<string, unknown>): void {
        this.log('warn', message, details);
    }

    error(message: string, details?: Record<string, unknown>): void {
        this.log('error', message, details);
    }
}

export const logger = new Logger();
