/**
 * Unit tests for HTTP Transport security features
 * 
 * Tests rate limiting, CORS headers, security headers, and HSTS support.
 * Uses mocked HTTP primitives to test behavior without starting a real server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpTransport } from '../http.js';

// Mock the logger to avoid console output during tests
vi.mock('../../utils/logger.js', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

/**
 * Create a mock IncomingMessage for testing
 */
function createMockRequest(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
    return {
        method: 'GET',
        url: '/test',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
        ...overrides
    } as IncomingMessage;
}

/**
 * Create a mock ServerResponse for testing with header tracking
 */
function createMockResponse(): ServerResponse & {
    _headers: Record<string, string>;
    _statusCode: number | null;
    _body: string;
} {
    const headers: Record<string, string> = {};
    return {
        _headers: headers,
        _statusCode: null,
        _body: '',
        setHeader: vi.fn((name: string, value: string) => {
            headers[name.toLowerCase()] = value;
        }),
        getHeader: vi.fn((name: string) => headers[name.toLowerCase()]),
        writeHead: vi.fn(function (this: { _statusCode: number }, code: number) {
            this._statusCode = code;
        }),
        end: vi.fn(function (this: { _body: string }, body?: string) {
            if (body) this._body = body;
        }),
        headersSent: false
    } as unknown as ServerResponse & {
        _headers: Record<string, string>;
        _statusCode: number | null;
        _body: string;
    };
}

describe('HttpTransport', () => {
    describe('Rate Limiting', () => {
        it('should allow requests within rate limit', () => {
            const transport = new HttpTransport({
                port: 3000,
                enableRateLimit: true,
                rateLimitMaxRequests: 5,
                rateLimitWindowMs: 60000
            });

            // Access private method via type casting for testing
            const checkRateLimit = (transport as unknown as {
                checkRateLimit: (req: IncomingMessage) => boolean
            }).checkRateLimit.bind(transport);

            const req = createMockRequest();

            // First 5 requests should be allowed
            for (let i = 0; i < 5; i++) {
                expect(checkRateLimit(req)).toBe(true);
            }
        });

        it('should block requests exceeding rate limit', () => {
            const transport = new HttpTransport({
                port: 3000,
                enableRateLimit: true,
                rateLimitMaxRequests: 3,
                rateLimitWindowMs: 60000
            });

            const checkRateLimit = (transport as unknown as {
                checkRateLimit: (req: IncomingMessage) => boolean
            }).checkRateLimit.bind(transport);

            const req = createMockRequest();

            // First 3 requests allowed
            expect(checkRateLimit(req)).toBe(true);
            expect(checkRateLimit(req)).toBe(true);
            expect(checkRateLimit(req)).toBe(true);

            // 4th request should be blocked
            expect(checkRateLimit(req)).toBe(false);
        });

        it('should track rate limits per IP address', () => {
            const transport = new HttpTransport({
                port: 3000,
                enableRateLimit: true,
                rateLimitMaxRequests: 2,
                rateLimitWindowMs: 60000
            });

            const checkRateLimit = (transport as unknown as {
                checkRateLimit: (req: IncomingMessage) => boolean
            }).checkRateLimit.bind(transport);

            const req1 = createMockRequest({ socket: { remoteAddress: '192.168.1.1' } } as unknown as IncomingMessage);
            const req2 = createMockRequest({ socket: { remoteAddress: '192.168.1.2' } } as unknown as IncomingMessage);

            // IP 1: use up their limit
            expect(checkRateLimit(req1)).toBe(true);
            expect(checkRateLimit(req1)).toBe(true);
            expect(checkRateLimit(req1)).toBe(false);

            // IP 2: should have their own limit
            expect(checkRateLimit(req2)).toBe(true);
            expect(checkRateLimit(req2)).toBe(true);
            expect(checkRateLimit(req2)).toBe(false);
        });

        it('should bypass rate limiting when disabled', () => {
            const transport = new HttpTransport({
                port: 3000,
                enableRateLimit: false
            });

            const checkRateLimit = (transport as unknown as {
                checkRateLimit: (req: IncomingMessage) => boolean
            }).checkRateLimit.bind(transport);

            const req = createMockRequest();

            // Should allow unlimited requests
            for (let i = 0; i < 1000; i++) {
                expect(checkRateLimit(req)).toBe(true);
            }
        });

        it('should reset rate limit after window expires', () => {
            vi.useFakeTimers();

            const transport = new HttpTransport({
                port: 3000,
                enableRateLimit: true,
                rateLimitMaxRequests: 2,
                rateLimitWindowMs: 60000
            });

            const checkRateLimit = (transport as unknown as {
                checkRateLimit: (req: IncomingMessage) => boolean
            }).checkRateLimit.bind(transport);

            const req = createMockRequest();

            // Use up limit
            expect(checkRateLimit(req)).toBe(true);
            expect(checkRateLimit(req)).toBe(true);
            expect(checkRateLimit(req)).toBe(false);

            // Advance past window
            vi.advanceTimersByTime(61000);

            // Should have new limit
            expect(checkRateLimit(req)).toBe(true);

            vi.useRealTimers();
        });
    });

    describe('Security Headers', () => {
        it('should set X-Content-Type-Options header', () => {
            const transport = new HttpTransport({ port: 3000 });
            const res = createMockResponse();

            const setSecurityHeaders = (transport as unknown as {
                setSecurityHeaders: (res: ServerResponse) => void
            }).setSecurityHeaders.bind(transport);

            setSecurityHeaders(res);

            expect(res._headers['x-content-type-options']).toBe('nosniff');
        });

        it('should set X-Frame-Options header to DENY', () => {
            const transport = new HttpTransport({ port: 3000 });
            const res = createMockResponse();

            const setSecurityHeaders = (transport as unknown as {
                setSecurityHeaders: (res: ServerResponse) => void
            }).setSecurityHeaders.bind(transport);

            setSecurityHeaders(res);

            expect(res._headers['x-frame-options']).toBe('DENY');
        });

        it('should set X-XSS-Protection header', () => {
            const transport = new HttpTransport({ port: 3000 });
            const res = createMockResponse();

            const setSecurityHeaders = (transport as unknown as {
                setSecurityHeaders: (res: ServerResponse) => void
            }).setSecurityHeaders.bind(transport);

            setSecurityHeaders(res);

            expect(res._headers['x-xss-protection']).toBe('1; mode=block');
        });

        it('should set Cache-Control to prevent caching', () => {
            const transport = new HttpTransport({ port: 3000 });
            const res = createMockResponse();

            const setSecurityHeaders = (transport as unknown as {
                setSecurityHeaders: (res: ServerResponse) => void
            }).setSecurityHeaders.bind(transport);

            setSecurityHeaders(res);

            expect(res._headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
        });

        it('should set Content-Security-Policy', () => {
            const transport = new HttpTransport({ port: 3000 });
            const res = createMockResponse();

            const setSecurityHeaders = (transport as unknown as {
                setSecurityHeaders: (res: ServerResponse) => void
            }).setSecurityHeaders.bind(transport);

            setSecurityHeaders(res);

            expect(res._headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
        });
    });

    describe('HSTS Support', () => {
        it('should not set HSTS header by default', () => {
            const transport = new HttpTransport({ port: 3000 });
            const res = createMockResponse();

            const setSecurityHeaders = (transport as unknown as {
                setSecurityHeaders: (res: ServerResponse) => void
            }).setSecurityHeaders.bind(transport);

            setSecurityHeaders(res);

            expect(res._headers['strict-transport-security']).toBeUndefined();
        });

        it('should set HSTS header when enabled', () => {
            const transport = new HttpTransport({
                port: 3000,
                enableHSTS: true
            });
            const res = createMockResponse();

            const setSecurityHeaders = (transport as unknown as {
                setSecurityHeaders: (res: ServerResponse) => void
            }).setSecurityHeaders.bind(transport);

            setSecurityHeaders(res);

            expect(res._headers['strict-transport-security']).toContain('max-age=');
            expect(res._headers['strict-transport-security']).toContain('includeSubDomains');
        });

        it('should use custom HSTS max-age', () => {
            const transport = new HttpTransport({
                port: 3000,
                enableHSTS: true,
                hstsMaxAge: 86400 // 1 day
            });
            const res = createMockResponse();

            const setSecurityHeaders = (transport as unknown as {
                setSecurityHeaders: (res: ServerResponse) => void
            }).setSecurityHeaders.bind(transport);

            setSecurityHeaders(res);

            expect(res._headers['strict-transport-security']).toBe('max-age=86400; includeSubDomains');
        });
    });

    describe('CORS Headers', () => {
        it('should not set CORS headers for non-configured origins', () => {
            const transport = new HttpTransport({
                port: 3000,
                corsOrigins: ['https://allowed.example.com']
            });
            const req = createMockRequest({
                headers: { origin: 'https://malicious.example.com' }
            });
            const res = createMockResponse();

            const setCorsHeaders = (transport as unknown as {
                setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void
            }).setCorsHeaders.bind(transport);

            setCorsHeaders(req, res);

            expect(res._headers['access-control-allow-origin']).toBeUndefined();
        });

        it('should set CORS headers for configured origins', () => {
            const transport = new HttpTransport({
                port: 3000,
                corsOrigins: ['https://allowed.example.com']
            });
            const req = createMockRequest({
                headers: { origin: 'https://allowed.example.com' }
            });
            const res = createMockResponse();

            const setCorsHeaders = (transport as unknown as {
                setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void
            }).setCorsHeaders.bind(transport);

            setCorsHeaders(req, res);

            expect(res._headers['access-control-allow-origin']).toBe('https://allowed.example.com');
            expect(res._headers['access-control-allow-methods']).toContain('GET');
            expect(res._headers['access-control-allow-methods']).toContain('POST');
        });

        it('should set Vary header for correct caching', () => {
            const transport = new HttpTransport({
                port: 3000,
                corsOrigins: ['https://example.com']
            });
            const req = createMockRequest({
                headers: { origin: 'https://example.com' }
            });
            const res = createMockResponse();

            const setCorsHeaders = (transport as unknown as {
                setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void
            }).setCorsHeaders.bind(transport);

            setCorsHeaders(req, res);

            expect(res._headers['vary']).toBe('Origin');
        });

        it('should expose Mcp-Session-Id header', () => {
            const transport = new HttpTransport({
                port: 3000,
                corsOrigins: ['https://example.com']
            });
            const req = createMockRequest({
                headers: { origin: 'https://example.com' }
            });
            const res = createMockResponse();

            const setCorsHeaders = (transport as unknown as {
                setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void
            }).setCorsHeaders.bind(transport);

            setCorsHeaders(req, res);

            expect(res._headers['access-control-expose-headers']).toContain('Mcp-Session-Id');
        });

        it('should not set credentials header by default', () => {
            const transport = new HttpTransport({
                port: 3000,
                corsOrigins: ['https://example.com']
            });
            const req = createMockRequest({
                headers: { origin: 'https://example.com' }
            });
            const res = createMockResponse();

            const setCorsHeaders = (transport as unknown as {
                setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void
            }).setCorsHeaders.bind(transport);

            setCorsHeaders(req, res);

            expect(res._headers['access-control-allow-credentials']).toBeUndefined();
        });

        it('should set credentials header when configured', () => {
            const transport = new HttpTransport({
                port: 3000,
                corsOrigins: ['https://example.com'],
                corsAllowCredentials: true
            });
            const req = createMockRequest({
                headers: { origin: 'https://example.com' }
            });
            const res = createMockResponse();

            const setCorsHeaders = (transport as unknown as {
                setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void
            }).setCorsHeaders.bind(transport);

            setCorsHeaders(req, res);

            expect(res._headers['access-control-allow-credentials']).toBe('true');
        });

        it('should allow MCP-specific headers', () => {
            const transport = new HttpTransport({
                port: 3000,
                corsOrigins: ['https://example.com']
            });
            const req = createMockRequest({
                headers: { origin: 'https://example.com' }
            });
            const res = createMockResponse();

            const setCorsHeaders = (transport as unknown as {
                setCorsHeaders: (req: IncomingMessage, res: ServerResponse) => void
            }).setCorsHeaders.bind(transport);

            setCorsHeaders(req, res);

            const allowedHeaders = res._headers['access-control-allow-headers'];
            expect(allowedHeaders).toContain('Mcp-Session-Id');
            expect(allowedHeaders).toContain('Mcp-Protocol-Version');
            expect(allowedHeaders).toContain('Authorization');
        });
    });

    describe('Public Path Matching', () => {
        it('should identify exact public paths', () => {
            const transport = new HttpTransport({
                port: 3000,
                publicPaths: ['/health', '/status']
            });

            const isPublicPath = (transport as unknown as {
                isPublicPath: (pathname: string) => boolean
            }).isPublicPath.bind(transport);

            expect(isPublicPath('/health')).toBe(true);
            expect(isPublicPath('/status')).toBe(true);
            expect(isPublicPath('/protected')).toBe(false);
        });

        it('should match wildcard public paths', () => {
            const transport = new HttpTransport({
                port: 3000,
                publicPaths: ['/.well-known/*']
            });

            const isPublicPath = (transport as unknown as {
                isPublicPath: (pathname: string) => boolean
            }).isPublicPath.bind(transport);

            expect(isPublicPath('/.well-known/oauth-protected-resource')).toBe(true);
            expect(isPublicPath('/.well-known/openid-configuration')).toBe(true);
            expect(isPublicPath('/api/protected')).toBe(false);
        });

        it('should use default public paths', () => {
            const transport = new HttpTransport({ port: 3000 });

            const isPublicPath = (transport as unknown as {
                isPublicPath: (pathname: string) => boolean
            }).isPublicPath.bind(transport);

            // Default public paths include /health and /.well-known/*
            expect(isPublicPath('/health')).toBe(true);
            expect(isPublicPath('/.well-known/oauth-protected-resource')).toBe(true);
        });
    });
});
