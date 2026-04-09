import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { ConfigError } from "./errors.js";
import type { BranchingPolicy, Config, RepoPolicy } from "./types/config.js";

const branchingPolicySchema = z.enum(["worktree", "branch", "current_branch"]);

const policyDefaultsSchema = z.object({
  allowed_branch_patterns: z.array(z.string().min(1)).nonempty().optional(),
  git_worktree_base_path: z.string().min(1).optional(),
  default_remote: z.string().min(1).optional(),
  allow_draft_prs: z.boolean().optional(),
  branching_policy: branchingPolicySchema.optional(),
});

const repoPolicySchema = policyDefaultsSchema.extend({
  path: z.string().min(1),
});

const configSchema = z.object({
  defaults: policyDefaultsSchema.optional(),
  always_allowed_branch_patterns: z.array(z.string().min(1)).nonempty().optional(),
  repositories: z.array(repoPolicySchema),
});

export async function loadConfig(configPath: string): Promise<Config> {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = parseYaml(raw);
  const config = configSchema.parse(parsed);

  const repositories: RepoPolicy[] = [];
  const seenPaths = new Set<string>();

  for (const repo of config.repositories) {
    const expandedPath = expandHomeDir(repo.path);

    if (!path.isAbsolute(expandedPath)) {
      throw new ConfigError(`repository path '${repo.path}' must be absolute or start with '~/'`);
    }

    const canonicalPath = await fs.realpath(expandedPath);
    if (seenPaths.has(canonicalPath)) {
      throw new ConfigError(`duplicate configured repository path '${canonicalPath}'`);
    }

    const gitWorktreeBasePath = await resolveGitWorktreeBasePath(
      repo.git_worktree_base_path ?? config.defaults?.git_worktree_base_path,
    );

    const repoPatternSources = repo.allowed_branch_patterns ?? config.defaults?.allowed_branch_patterns ?? [];
    const globalPatternSources = config.always_allowed_branch_patterns ?? [];
    const patternSources = [...repoPatternSources, ...globalPatternSources];

    if (patternSources.length === 0) {
      throw new ConfigError(
        `repository '${repo.path}' must define allowed_branch_patterns directly, inherit them from top-level defaults, or rely on always_allowed_branch_patterns`,
      );
    }

    const allowedBranchPatterns = compileBranchPatterns(patternSources, repo.path);

    repositories.push({
      path: expandedPath,
      canonicalPath,
      worktreePath: canonicalPath,
      allowedBranchPatterns,
      gitWorktreeBasePath,
      defaultRemote: repo.default_remote ?? config.defaults?.default_remote,
      allowDraftPrs: repo.allow_draft_prs ?? config.defaults?.allow_draft_prs ?? true,
      branchingPolicy: resolveBranchingPolicy(repo.branching_policy, config.defaults?.branching_policy),
    });

    seenPaths.add(canonicalPath);
  }

  return { repositories };
}

function resolveBranchingPolicy(
  repoPolicy: BranchingPolicy | undefined,
  defaultPolicy: BranchingPolicy | undefined,
): BranchingPolicy | undefined {
  return repoPolicy ?? defaultPolicy;
}

function expandHomeDir(inputPath: string): string {
  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

async function resolveGitWorktreeBasePath(inputPath: string | undefined): Promise<string | undefined> {
  if (!inputPath) {
    return undefined;
  }

  const expandedPath = expandHomeDir(inputPath);
  if (!path.isAbsolute(expandedPath)) {
    throw new ConfigError(`git_worktree_base_path '${inputPath}' must be absolute or start with '~/'`);
  }

  return await canonicalizeProspectivePath(expandedPath);
}

async function canonicalizeProspectivePath(inputPath: string): Promise<string> {
  const parts: string[] = [];
  let currentPath = path.resolve(inputPath);

  while (true) {
    try {
      const canonicalBase = await fs.realpath(currentPath);
      return path.join(canonicalBase, ...parts.reverse());
    } catch {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        throw new ConfigError(`path '${inputPath}' could not be resolved`);
      }

      parts.push(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
}

function compileBranchPatterns(patterns: string[], repoPath: string): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      throw new ConfigError(
        `invalid branch regex '${pattern}' for repository '${repoPath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
}
