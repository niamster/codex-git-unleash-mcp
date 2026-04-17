import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { bootstrapConfig, loadOptionalConfig, upsertRepoConfig } from "./config.js";
import { ConfigError, RepoNotAllowedError } from "./errors.js";
import { requireAllowedBranch } from "./auth/branchAuth.js";
import { requireTrustedRepoPolicy } from "./auth/repoPolicyTrust.js";
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
import { gitWorktreeAdd } from "./tools/gitWorktreeAdd.js";

const workflowModeSchema = z.enum(["worktree", "feature_branch", "current_branch"]);

const configPolicyFields = {
  allowed_branch_patterns: z.array(z.string().min(1)).min(1).optional(),
  feature_branch_pattern: z.string().min(1).optional(),
  git_worktree_base_path: z.string().min(1).optional(),
  default_remote: z.string().min(1).optional(),
  allow_draft_prs: z.boolean().optional(),
  workflow_mode: workflowModeSchema.optional(),
};

const CLOSED_WORLD_READ_ONLY_TOOL: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const CLOSED_WORLD_ADDITIVE_MUTATION_TOOL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

const CLOSED_WORLD_POTENTIALLY_DESTRUCTIVE_MUTATION_TOOL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};

export function getRegisteredToolNames(): string[] {
  return [
    "config_bootstrap",
    "config_upsert_repo",
    "git_repo_policy",
    "git_status",
    "git_add",
    "git_commit",
    "git_branch_create_and_switch",
    "git_branch_switch",
    "git_fetch",
    "git_worktree_add",
    "git_push",
    "gh_pr_create_draft",
  ];
}

export async function loadRuntimeConfig(configPath: string) {
  const config = await loadOptionalConfig(configPath);
  if (!config) {
    throw new ConfigError(
      `config file '${configPath}' does not exist; call 'config_bootstrap' to create it or 'config_upsert_repo' to create it with a repository entry`,
    );
  }

  return config;
}

export function createServer(configPath: string): McpServer {
  const server = new McpServer({
    name: "codex-git-unleash-mcp",
    version: "0.1.0",
  });

  server.tool(
    "config_bootstrap",
    "Create the initial MCP config file when it does not yet exist. This tool writes a minimal valid YAML config and does not apply changes to the current server process; restart the MCP server after use.",
    configPolicyFields,
    CLOSED_WORLD_ADDITIVE_MUTATION_TOOL,
    async (input) => {
      const nextConfig = await bootstrapConfig(configPath, input);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                configPath,
                repositories: nextConfig.repositories.length,
                restartRequired: true,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "config_upsert_repo",
    "Add or update one repository entry in the MCP config file. This tool validates the resulting YAML against the existing schema and does not hot-reload the current server process; restart the MCP server after use.",
    {
      repo_path: z.string().min(1),
      ...configPolicyFields,
    },
    CLOSED_WORLD_POTENTIALLY_DESTRUCTIVE_MUTATION_TOOL,
    async (input) => {
      const result = await upsertRepoConfig(configPath, input);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                configPath,
                action: result.action,
                repo: result.repo,
                restartRequired: true,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "git_repo_policy",
    "Return the configured policy for an authorized repository. This tool is read-only and exposes the branch patterns and related repository defaults that other tools enforce.",
    {
      repo_path: z.string().min(1),
    },
    CLOSED_WORLD_READ_ONLY_TOOL,
    async ({ repo_path }) => {
      const repo = await resolveRuntimeRepo(configPath, repo_path, { requireTrustedRepoPolicy: false });
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
    "Show git status for an authorized repository. This tool is read-only, returns the current branch and worktree summary, and does not require branch authorization.",
    {
      repo_path: z.string().min(1),
    },
    CLOSED_WORLD_READ_ONLY_TOOL,
    async ({ repo_path }) => {
      const repo = await resolveRuntimeRepo(configPath, repo_path, { requireTrustedRepoPolicy: false });
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
    "Stage a constrained list of repository-relative paths in an authorized repository. This tool mutates repository state, requires the current branch to match configured full-match patterns, and rejects absolute or repository-escaping paths.",
    {
      repo_path: z.string().min(1),
      paths: z.array(z.string().min(1)).min(1),
    },
    CLOSED_WORLD_ADDITIVE_MUTATION_TOOL,
    async ({ repo_path, paths }) => {
      const repo = await resolveRuntimeRepo(configPath, repo_path);
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
    "Create a normal commit in an authorized repository. This tool mutates repository state, requires the current branch to match configured full-match patterns, rejects empty commit messages, and rejects empty commits.",
    {
      repo_path: z.string().min(1),
      message: z.string(),
    },
    CLOSED_WORLD_ADDITIVE_MUTATION_TOOL,
    async ({ repo_path, message }) => {
      const repo = await resolveRuntimeRepo(configPath, repo_path);
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
    "Create a new local branch from an explicit or detected upstream base branch for an authorized repository, then switch to it. This tool requires a clean worktree, resolves the remote at runtime, fetches the chosen base branch first, and does not accept arbitrary source refs or detached targets.",
    {
      repo_path: z.string().min(1),
      new_branch: z.string(),
      branch: z.string().min(1).optional(),
    },
    CLOSED_WORLD_POTENTIALLY_DESTRUCTIVE_MUTATION_TOOL,
    async ({ repo_path, new_branch, branch }) => {
      const repo = await resolveRuntimeRepo(configPath, repo_path);
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
    "Switch to an existing local branch in an authorized repository. This tool mutates repository state, requires the worktree to be clean, requires the target branch name to match configured allowed patterns, is only allowed when workflow_mode is unset or feature_branch, only accepts an explicit local branch name, and does not create branches or allow detached checkouts.",
    {
      repo_path: z.string().min(1),
      branch: z.string(),
    },
    CLOSED_WORLD_POTENTIALLY_DESTRUCTIVE_MUTATION_TOOL,
    async ({ repo_path, branch }) => {
      const repo = await resolveRuntimeRepo(configPath, repo_path);
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
    "Fetch a plain branch name from the detected remote for an authorized repository. This tool refreshes remote-tracking refs, accepts an explicit branch when provided, otherwise detects the repository base branch at runtime, and does not allow arbitrary fetch arguments or refspecs.",
    {
      repo_path: z.string().min(1),
      branch: z.string().optional(),
    },
    CLOSED_WORLD_POTENTIALLY_DESTRUCTIVE_MUTATION_TOOL,
    async ({ repo_path, branch }) => {
      const repo = await resolveRuntimeRepo(configPath, repo_path);
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
    "git_worktree_add",
    "Create a linked worktree at an explicit absolute path for a new local branch in an authorized repository. This tool mutates repository state, validates the requested branch name against configured full-match patterns, fetches the chosen base branch first, and enforces the configured worktree base path when one exists.",
    {
      repo_path: z.string().min(1),
      path: z.string().min(1),
      new_branch: z.string(),
      branch: z.string().min(1).optional(),
    },
    CLOSED_WORLD_ADDITIVE_MUTATION_TOOL,
    async ({ repo_path, path, new_branch, branch }) => {
      const repo = await resolveRuntimeRepo(configPath, repo_path);
      const result = await gitWorktreeAdd(repo, { path, newBranch: new_branch, branch });

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
    "Push the current branch to the detected remote for an authorized repository. This tool mutates repository state, requires the current branch to match configured full-match patterns, and does not allow arbitrary refspecs, force-like behavior, or pushing unrelated branches.",
    {
      repo_path: z.string().min(1),
    },
    CLOSED_WORLD_POTENTIALLY_DESTRUCTIVE_MUTATION_TOOL,
    async ({ repo_path }) => {
      const repo = await resolveRuntimeRepo(configPath, repo_path);
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
    "Create a draft pull request for the current branch in an authorized repository. This tool mutates repository state via GitHub, requires the current branch to match configured full-match patterns, is draft-only, requires a non-empty title, and uses either an explicit base or a runtime-detected default branch.",
    {
      repo_path: z.string().min(1),
      title: z.string(),
      body: z.string(),
      base: z.string().min(1).optional(),
    },
    CLOSED_WORLD_ADDITIVE_MUTATION_TOOL,
    async ({ repo_path, title, body, base }) => {
      const repo = await resolveRuntimeRepo(configPath, repo_path);
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

async function resolveRuntimeRepo(
  configPath: string,
  repoPath: string,
  options: { requireTrustedRepoPolicy?: boolean } = {},
) {
  const config = await loadOptionalConfig(configPath);
  let repo;

  if (config) {
    repo = await resolveAllowedRepo(config, repoPath);
  } else {
    try {
      repo = await resolveAllowedRepo({ repositories: [] }, repoPath);
    } catch (error) {
      if (error instanceof RepoNotAllowedError) {
        throw new ConfigError(
          `config file '${configPath}' does not exist; call 'config_bootstrap' to create it or 'config_upsert_repo' to create it with a repository entry`,
        );
      }

      throw error;
    }
  }

  if (options.requireTrustedRepoPolicy ?? true) {
    await requireTrustedRepoPolicy(repo);
  }
  return repo;
}
