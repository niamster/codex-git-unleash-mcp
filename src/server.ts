import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Config } from "./types/config.js";
import { requireAllowedBranch } from "./auth/branchAuth.js";
import { resolveAllowedRepo } from "./auth/repoAuth.js";
import { gitAdd } from "./tools/gitAdd.js";
import { gitBranchCreate } from "./tools/gitBranchCreate.js";
import { gitBranchSwitch } from "./tools/gitBranchSwitch.js";
import { gitCommit } from "./tools/gitCommit.js";
import { gitPush } from "./tools/gitPush.js";
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

  server.tool(
    "git_branch_create",
    "Create a new local branch from the configured upstream base branch for an allowlisted repository. This tool mutates repository state, requires the current branch to match configured full-match patterns, fetches the configured base first, and does not switch the working tree.",
    {
      repo_path: z.string().min(1),
      new_branch: z.string(),
    },
    async ({ repo_path, new_branch }) => {
      const repo = await resolveAllowedRepo(config, repo_path);
      await requireAllowedBranch(repo);
      const result = await gitBranchCreate(repo, new_branch);

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
    "git_branch_switch",
    "Switch to an existing local branch in an allowlisted repository. This tool mutates repository state, requires the worktree to be clean, only accepts an explicit local branch name, and does not create branches or allow detached checkouts.",
    {
      repo_path: z.string().min(1),
      branch: z.string(),
    },
    async ({ repo_path, branch }) => {
      const repo = await resolveAllowedRepo(config, repo_path);
      const result = await gitBranchSwitch(repo, branch);

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
    "git_push",
    "Push the current branch to the configured default remote for an allowlisted repository. This tool mutates repository state, requires the current branch to match configured full-match patterns, and does not allow arbitrary refspecs or force-like behavior.",
    {
      repo_path: z.string().min(1),
    },
    async ({ repo_path }) => {
      const repo = await resolveAllowedRepo(config, repo_path);
      const branch = await requireAllowedBranch(repo);
      const result = await gitPush(repo, branch);

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
