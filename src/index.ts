import 'dotenv/config';

if (!process.env.ORGANIZATION_ID) {
  console.error('[mcp-server] Fatal: ORGANIZATION_ID environment variable is not set.');
  process.exit(1);
}

const transport = process.env.TRANSPORT ?? 'http';

async function main(): Promise<void> {
  if (transport === 'stdio') {
    const { startStdio } = await import('./transports/stdio');
    await startStdio();
  } else {
    const { startHttp } = await import('./transports/http');
    await startHttp();
  }
}

main().catch((err) => {
  console.error('[mcp-server] Fatal error:', err);
  process.exit(1);
});
