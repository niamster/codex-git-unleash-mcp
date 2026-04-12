import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { ConfigError } from "./errors.js";
import type { BranchingPolicy, Config, RepoPolicy } from "./types/config.js";

const branchingPolicySchema = z.enum(["worktree", "feature_branch", "current_branch"]);
const branchingPoliciesSchema = z.array(branchingPolicySchema).nonempty();

const policyDefaultsSchema = z.object({
  allowed_branch_patterns: z.array(z.string().min(1)).nonempty().optional(),
  feature_branch_pattern: z.string().min(1).optional(),
  git_worktree_base_path: z.string().min(1).optional(),
  default_remote: z.string().min(1).optional(),
  allow_draft_prs: z.boolean().optional(),
  branching_policies: branchingPoliciesSchema.optional(),
});

const repoPolicySchema = policyDefaultsSchema.extend({
  path: z.string().min(1),
});

const configSchema = z.object({
  defaults: policyDefaultsSchema.optional(),
  always_allowed_branch_patterns: z.array(z.string().min(1)).nonempty().optional(),
  repositories: z.array(repoPolicySchema),
});

export type EditablePolicyDefaults = z.infer<typeof policyDefaultsSchema>;
export type EditableRepoPolicy = z.infer<typeof repoPolicySchema>;
export type EditableConfig = z.infer<typeof configSchema>;

export type BootstrapConfigInput = EditablePolicyDefaults & {
  always_allowed_branch_patterns?: string[];
};

export type UpsertRepoConfigInput = {
  repo_path: string;
} & EditablePolicyDefaults;

export async function loadConfig(configPath: string): Promise<Config> {
  const raw = await fs.readFile(configPath, "utf8");
  const config = parseConfig(raw);
  return await normalizeConfig(config);
}

export async function loadOptionalConfig(configPath: string): Promise<Config | undefined> {
  try {
    return await loadConfig(configPath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function bootstrapConfig(configPath: string, input: BootstrapConfigInput): Promise<EditableConfig> {
  if (await configFileExists(configPath)) {
    throw new ConfigError(`config file '${configPath}' already exists`);
  }

  const config = sanitizeEditableConfig({
    defaults: toOptionalPolicyDefaults(input),
    always_allowed_branch_patterns: input.always_allowed_branch_patterns,
    repositories: [],
  });

  await normalizeConfig(config);
  await writeConfig(configPath, config);

  return config;
}

export async function upsertRepoConfig(configPath: string, input: UpsertRepoConfigInput): Promise<{
  action: "created" | "updated";
  repo: EditableRepoPolicy;
}> {
  const config = (await readEditableConfig(configPath)) ?? { repositories: [] };
  const nextConfig = sanitizeEditableConfig(config);
  const nextRepo = sanitizeEditableRepo({
    path: input.repo_path,
    ...toOptionalPolicyDefaults(input),
  });
  const nextRepoCanonicalPath = await resolveConfiguredRepoCanonicalPath(nextRepo.path);

  let action: "created" | "updated" = "created";
  let updatedRepo = nextRepo;
  const existingRepoIndex = await findRepoIndexByCanonicalPath(nextConfig.repositories, nextRepoCanonicalPath);

  if (existingRepoIndex >= 0) {
    action = "updated";
    const existingRepo = nextConfig.repositories[existingRepoIndex]!;
    updatedRepo = {
      ...existingRepo,
      ...nextRepo,
      path: existingRepo.path,
    };
    nextConfig.repositories[existingRepoIndex] = sanitizeEditableRepo(updatedRepo);
  } else {
    nextConfig.repositories.push(nextRepo);
  }

  await normalizeConfig(nextConfig);
  await writeConfig(configPath, nextConfig);

  return {
    action,
    repo: updatedRepo,
  };
}

function parseConfig(raw: string): EditableConfig {
  const parsed = parseYaml(raw);
  return configSchema.parse(parsed);
}

async function normalizeConfig(config: EditableConfig): Promise<Config> {
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
      featureBranchPattern: resolveFeatureBranchPattern(
        repo.feature_branch_pattern ?? config.defaults?.feature_branch_pattern,
      ),
      gitWorktreeBasePath,
      defaultRemote: repo.default_remote ?? config.defaults?.default_remote,
      allowDraftPrs: repo.allow_draft_prs ?? config.defaults?.allow_draft_prs ?? true,
      branchingPolicies: resolveBranchingPolicies(repo.branching_policies, config.defaults?.branching_policies),
    });

    seenPaths.add(canonicalPath);
  }

  return { repositories };
}

async function readEditableConfig(configPath: string): Promise<EditableConfig | undefined> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return parseConfig(raw);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function writeConfig(configPath: string, config: EditableConfig): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${stringifyYaml(config).trimEnd()}\n`, "utf8");
}

function sanitizeEditableConfig(input: Partial<EditableConfig>): EditableConfig {
  return {
    ...(input.defaults ? { defaults: sanitizePolicyDefaults(input.defaults) } : {}),
    ...(input.always_allowed_branch_patterns ? { always_allowed_branch_patterns: input.always_allowed_branch_patterns } : {}),
    repositories: (input.repositories ?? []).map((repo) => sanitizeEditableRepo(repo)),
  };
}

function sanitizeEditableRepo(input: EditableRepoPolicy): EditableRepoPolicy {
  return {
    path: input.path,
    ...toOptionalPolicyDefaults(input),
  };
}

function sanitizePolicyDefaults(input: EditablePolicyDefaults): EditablePolicyDefaults {
  return {
    ...toOptionalPolicyDefaults(input),
  };
}

function toOptionalPolicyDefaults(input: Partial<EditablePolicyDefaults>): EditablePolicyDefaults {
  return {
    ...(input.allowed_branch_patterns ? { allowed_branch_patterns: input.allowed_branch_patterns } : {}),
    ...(input.feature_branch_pattern ? { feature_branch_pattern: input.feature_branch_pattern } : {}),
    ...(input.git_worktree_base_path ? { git_worktree_base_path: input.git_worktree_base_path } : {}),
    ...(input.default_remote ? { default_remote: input.default_remote } : {}),
    ...(input.allow_draft_prs !== undefined ? { allow_draft_prs: input.allow_draft_prs } : {}),
    ...(input.branching_policies ? { branching_policies: input.branching_policies } : {}),
  };
}

function resolveBranchingPolicies(
  repoPolicies: BranchingPolicy[] | undefined,
  defaultPolicies: BranchingPolicy[] | undefined,
): BranchingPolicy[] | undefined {
  return repoPolicies ?? defaultPolicies;
}

function resolveFeatureBranchPattern(pattern: string | undefined): string | undefined {
  if (!pattern?.includes("<user>")) {
    return pattern;
  }

  return pattern.replaceAll("<user>", resolveRuntimeUsername());
}

function resolveRuntimeUsername(): string {
  const envUsername = firstNonEmptyValue(process.env.USER, process.env.USERNAME);
  if (envUsername) {
    return envUsername;
  }

  try {
    const systemUsername = firstNonEmptyValue(os.userInfo().username);
    if (systemUsername) {
      return systemUsername;
    }
  } catch {
    // Ignore lookup failures and fall through to a config error below.
  }

  throw new ConfigError("feature_branch_pattern uses '<user>' but no runtime username could be determined");
}

function firstNonEmptyValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
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

async function resolveConfiguredRepoCanonicalPath(repoPath: string): Promise<string> {
  const expandedPath = expandHomeDir(repoPath);
  if (!path.isAbsolute(expandedPath)) {
    throw new ConfigError(`repository path '${repoPath}' must be absolute or start with '~/'`);
  }

  try {
    return await fs.realpath(expandedPath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new ConfigError(`repository path '${repoPath}' could not be resolved`);
    }

    throw error;
  }
}

async function findRepoIndexByCanonicalPath(repositories: EditableRepoPolicy[], canonicalPath: string): Promise<number> {
  for (const [index, repo] of repositories.entries()) {
    const repoCanonicalPath = await resolveConfiguredRepoCanonicalPath(repo.path);
    if (repoCanonicalPath === canonicalPath) {
      return index;
    }
  }

  return -1;
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

async function configFileExists(configPath: string): Promise<boolean> {
  try {
    await fs.access(configPath);
    return true;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
