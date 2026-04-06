import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Config } from "./types/config.js";
import { resolveAllowedRepo } from "./auth/repoAuth.js";
import { getGitStatus } from "./tools/gitStatus.js";

export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: "git-github-approval-mcp",
    version: "0.1.0",
  });

  server.tool(
    "git_status",
    "Show git status for an allowlisted repository. This tool is read-only and does not require branch authorization.",
    {
      repo_path: z.string().min(1),
    },
    async ({ repo_path }) => {
      const repo = await resolveAllowedRepo(config, repo_path);
      const status = await getGitStatus(repo);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    },
  );

  return server;
}
