import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadOptionalConfig } from "./config.js";
import { createServer } from "./server.js";

function getConfigPath(argv: string[]): string {
  const configPath = argv[2] ?? process.env.GIT_UNLEASH_MCP_CONFIG;
  if (!configPath) {
    throw new Error("expected config path as argv[2] or GIT_UNLEASH_MCP_CONFIG");
  }

  return configPath;
}

async function main(): Promise<void> {
  const configPath = getConfigPath(process.argv);
  const config = await loadOptionalConfig(configPath);
  const server = createServer(configPath, config);
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
