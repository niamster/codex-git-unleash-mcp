import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Config } from "./types/config.js";
import { requireAllowedBranch } from "./auth/branchAuth.js";
import { resolveAllowedRepo } from "./auth/repoAuth.js";
import { gitAdd } from "./tools/gitAdd.js";
import { gitCommit } from "./tools/gitCommit.js";
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

  server.tool(
    "git_add",
    "Stage a constrained list of repository-relative paths in an allowlisted repository. This tool mutates repository state and requires the current branch to match configured full-match patterns.",
    {
      repo_path: z.string().min(1),
      paths: z.array(z.string().min(1)).min(1),
    },
    async ({ repo_path, paths }) => {
      const repo = await resolveAllowedRepo(config, repo_path);
      await requireAllowedBranch(repo);
      const result = await gitAdd(repo, paths);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "git_commit",
    "Create a normal commit in an allowlisted repository. This tool mutates repository state, requires the current branch to match configured full-match patterns, and rejects empty commits.",
    {
      repo_path: z.string().min(1),
      message: z.string(),
    },
    async ({ repo_path, message }) => {
      const repo = await resolveAllowedRepo(config, repo_path);
      await requireAllowedBranch(repo);
      const result = await gitCommit(repo, message);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  return server;
}
