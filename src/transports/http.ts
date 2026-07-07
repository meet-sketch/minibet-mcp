import 'dotenv/config';
import http from 'http';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../server';

const PORT = parseInt(process.env.PORT ?? '3100', 10);

// WorkOS AuthKit OAuth config.
// AUTHKIT_DOMAIN  e.g. https://abc123.authkit.app
// MCP_SERVER_URL  e.g. https://minibet-mcp.onrender.com/mcp
// Normalise AuthKit domain — add https:// if the user omitted it
const rawAuthkitDomain = process.env.AUTHKIT_DOMAIN;
const AUTHKIT_DOMAIN   = rawAuthkitDomain
  ? rawAuthkitDomain.startsWith('http') ? rawAuthkitDomain : `https://${rawAuthkitDomain}`
  : undefined;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
const OAUTH_ENABLED  = Boolean(AUTHKIT_DOMAIN && MCP_SERVER_URL);

let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
if (OAUTH_ENABLED) {
  JWKS = createRemoteJWKSet(new URL(`${AUTHKIT_DOMAIN}/oauth2/jwks`));
}

// ---------------------------------------------------------------------------
// Auth check — verifies WorkOS JWT on every /mcp request.
// If AUTHKIT_DOMAIN + MCP_SERVER_URL are not set, the endpoint is open.
// Returns true if allowed, false + already-written 401 if not.
// ---------------------------------------------------------------------------
async function checkAuth(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  if (!OAUTH_ENABLED || !JWKS) return true;

  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const resourceMetadataUrl = `${MCP_SERVER_URL?.replace(/\/mcp$/, '')}/.well-known/oauth-protected-resource`;

  const wwwAuthenticate = [
    'Bearer error="unauthorized"',
    'error_description="Authorization needed"',
    `resource_metadata="${resourceMetadataUrl}"`,
  ].join(', ');

  if (!token) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': wwwAuthenticate,
    });
    res.end(JSON.stringify({ error: 'No token provided.' }));
    return false;
  }

  try {
    await jwtVerify(token, JWKS, {
      issuer:   AUTHKIT_DOMAIN,
      audience: MCP_SERVER_URL,
    });
    return true;
  } catch {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': wwwAuthenticate,
    });
    res.end(JSON.stringify({ error: 'Invalid bearer token.' }));
    return false;
  }
}

export async function startHttp(): Promise<void> {
  const httpServer = http.createServer(async (req, res) => {

    // ------------------------------------------------------------------
    // GET /health — always public, no auth
    // ------------------------------------------------------------------
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', transport: 'http' }));
      return;
    }

    // ------------------------------------------------------------------
    // GET /.well-known/oauth-protected-resource
    // Tells MCP clients where to get a token (points to AuthKit).
    // Only served when OAuth is enabled.
    // ------------------------------------------------------------------
    if (OAUTH_ENABLED && req.method === 'GET' && req.url === '/.well-known/oauth-protected-resource') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        resource:                  MCP_SERVER_URL,
        authorization_servers:     [AUTHKIT_DOMAIN],
        bearer_methods_supported:  ['header'],
      }));
      return;
    }

    // ------------------------------------------------------------------
    // GET /.well-known/oauth-authorization-server
    // Backwards-compat proxy for older MCP clients that look here instead
    // of at the AuthKit domain directly.
    // Only served when OAuth is enabled.
    // ------------------------------------------------------------------
    if (OAUTH_ENABLED && req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
      try {
        const upstream = await fetch(`${AUTHKIT_DOMAIN}/.well-known/oauth-authorization-server`);
        const metadata = await upstream.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metadata));
      } catch {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch authorization server metadata.' }));
      }
      return;
    }

    // ------------------------------------------------------------------
    // /mcp — the actual MCP endpoint (existing logic, unchanged)
    // ------------------------------------------------------------------
    if (req.url === '/mcp') {
      const allowed = await checkAuth(req, res);
      if (!allowed) return;

      const server    = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res);

      res.on('close', () => {
        transport.close();
        server.close();
      });
      return;
    }

    // ------------------------------------------------------------------
    // 404 fallthrough
    // ------------------------------------------------------------------
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.listen(PORT, () => {
    console.error(`[mcp-server] HTTP transport listening on port ${PORT}`);
    if (OAUTH_ENABLED) {
      console.error(`[mcp-server] OAuth enabled — AuthKit: ${AUTHKIT_DOMAIN}`);
    } else {
      console.error(`[mcp-server] Auth: none (open) — set AUTHKIT_DOMAIN + MCP_SERVER_URL to enable OAuth`);
    }
  });
}
