import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Config } from "./types/config.js";
import { requireAllowedBranch } from "./auth/branchAuth.js";
import { resolveAllowedRepo } from "./auth/repoAuth.js";
import { gitAdd } from "./tools/gitAdd.js";
import { gitBranchCreateAndSwitch } from "./tools/gitBranchCreateAndSwitch.js";
import { gitBranchSwitch } from "./tools/gitBranchSwitch.js";
import { ghPrCreateDraft } from "./tools/ghPrCreateDraft.js";
import { gitCommit } from "./tools/gitCommit.js";
import { gitFetch } from "./tools/gitFetch.js";
import { gitPush } from "./tools/gitPush.js";
import { getGitRepoPolicy } from "./tools/gitRepoPolicy.js";
import { getGitStatus } from "./tools/gitStatus.js";

export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: "codex-git-unleash-mcp",
    version: "0.1.0",
  });

  server.tool(
    "git_repo_policy",
    "Return the configured policy for an allowlisted repository. This tool is read-only and exposes the branch patterns and related repository defaults that other tools enforce.",
    {
      repo_path: z.string().min(1),
    },
    async ({ repo_path }) => {
      const repo = await resolveAllowedRepo(config, repo_path);
      const result = getGitRepoPolicy(repo);

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
    "git_status",
    "Show git status for an allowlisted repository. This tool is read-only, returns the current branch and worktree summary, and does not require branch authorization.",
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
    "Stage a constrained list of repository-relative paths in an allowlisted repository. This tool mutates repository state, requires the current branch to match configured full-match patterns, and rejects absolute or repository-escaping paths.",
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
    "Create a normal commit in an allowlisted repository. This tool mutates repository state, requires the current branch to match configured full-match patterns, rejects empty commit messages, and rejects empty commits.",
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
    "git_branch_create_and_switch",
    "Create a new local branch from an explicit or detected upstream base branch for an allowlisted repository, then switch to it. This tool requires a clean worktree, resolves the remote at runtime, fetches the chosen base branch first, and does not accept arbitrary source refs or detached targets.",
    {
      repo_path: z.string().min(1),
      new_branch: z.string(),
      branch: z.string().min(1).optional(),
    },
    async ({ repo_path, new_branch, branch }) => {
      const repo = await resolveAllowedRepo(config, repo_path);
      const result = await gitBranchCreateAndSwitch(repo, { newBranch: new_branch, branch });

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
    "git_fetch",
    "Fetch a plain branch name from the detected remote for an allowlisted repository. This tool refreshes remote-tracking refs, defaults to 'main' when no branch is provided, and does not allow arbitrary fetch arguments or refspecs.",
    {
      repo_path: z.string().min(1),
      branch: z.string().optional(),
    },
    async ({ repo_path, branch }) => {
      const repo = await resolveAllowedRepo(config, repo_path);
      const result = await gitFetch(repo, { branch });

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
    "Push the current branch to the detected remote for an allowlisted repository. This tool mutates repository state, requires the current branch to match configured full-match patterns, and does not allow arbitrary refspecs, force-like behavior, or pushing unrelated branches.",
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

  server.tool(
    "gh_pr_create_draft",
    "Create a draft pull request for the current branch in an allowlisted repository. This tool mutates repository state via GitHub, requires the current branch to match configured full-match patterns, is draft-only, requires a non-empty title, and uses either an explicit base or a runtime-detected default branch.",
    {
      repo_path: z.string().min(1),
      title: z.string(),
      body: z.string(),
      base: z.string().min(1).optional(),
    },
    async ({ repo_path, title, body, base }) => {
      const repo = await resolveAllowedRepo(config, repo_path);
      const branch = await requireAllowedBranch(repo);
      const result = await ghPrCreateDraft(repo, branch, { title, body, base });

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
