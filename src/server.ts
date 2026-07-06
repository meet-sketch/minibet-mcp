import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDepositTools } from './tools/deposits/index';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'minibet-analytics',
    version: '1.0.0',
  });

  registerDepositTools(server);

  return server;
}
