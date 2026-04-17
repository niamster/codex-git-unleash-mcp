import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { ConfigError } from "./errors.js";
import type { Config, RepoPolicy, RepoPolicyOverrides, WorkflowMode } from "./types/config.js";

export const REPO_LOCAL_CONFIG_FILENAME = ".git-unleash.yaml";

const workflowModeSchema = z.enum(["worktree", "feature_branch", "current_branch"]);

const policyDefaultsSchema = z.object({
  allowed_branch_patterns: z.array(z.string().min(1)).nonempty().optional(),
  feature_branch_pattern: z.string().min(1).optional(),
  git_worktree_base_path: z.string().min(1).optional(),
  default_remote: z.string().min(1).optional(),
  allow_draft_prs: z.boolean().optional(),
  workflow_mode: workflowModeSchema.optional(),
});

const repoPolicySchema = policyDefaultsSchema.extend({
  path: z.string().min(1),
});

const repoLocalPolicySchema = z.object({
  allowed_branch_patterns: z.array(z.string().min(1)).nonempty(),
  feature_branch_pattern: z.string().min(1).optional(),
  git_worktree_base_path: z.string().min(1).optional(),
  default_remote: z.string().min(1).optional(),
  allow_draft_prs: z.boolean().optional(),
  workflow_mode: workflowModeSchema.optional(),
});

const configSchema = z.object({
  defaults: policyDefaultsSchema.optional(),
  repositories: z.array(repoPolicySchema),
});

export type EditablePolicyDefaults = z.infer<typeof policyDefaultsSchema>;
export type EditableRepoPolicy = z.infer<typeof repoPolicySchema>;
export type EditableConfig = z.infer<typeof configSchema>;

export type BootstrapConfigInput = EditablePolicyDefaults;

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

export async function loadRepoLocalPolicy(
  repoRoot: string,
  globalRepoPolicy?: RepoPolicy,
): Promise<RepoPolicy | undefined> {
  const canonicalRepoRoot = await fs.realpath(repoRoot);
  const configPath = path.join(canonicalRepoRoot, REPO_LOCAL_CONFIG_FILENAME);

  try {
    const stats = await fs.lstat(configPath);
    if (stats.isSymbolicLink()) {
      throw new ConfigError(`repo-local config '${configPath}' must not be a symbolic link`);
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }

  const raw = await fs.readFile(configPath, "utf8");

  let parsed: z.infer<typeof repoLocalPolicySchema>;
  try {
    parsed = repoLocalPolicySchema.parse(parseYaml(raw));
  } catch (error) {
    throw new ConfigError(
      `repo-local config '${configPath}' is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (parsed.default_remote !== undefined) {
    throw new ConfigError(`repo-local config '${configPath}' must not set default_remote`);
  }

  const repoLocalPolicy: RepoPolicy = {
    path: canonicalRepoRoot,
    canonicalPath: canonicalRepoRoot,
    worktreePath: canonicalRepoRoot,
    allowedBranchPatterns: compileBranchPatterns(parsed.allowed_branch_patterns, canonicalRepoRoot),
    featureBranchPattern: resolveFeatureBranchPattern(parsed.feature_branch_pattern),
    gitWorktreeBasePath: await resolveGitWorktreeBasePath(parsed.git_worktree_base_path, { repoRoot: canonicalRepoRoot }),
    allowDraftPrs: parsed.allow_draft_prs ?? true,
    workflowMode: parsed.workflow_mode,
    policySource: "repo_local",
    repoLocalConfigPath: configPath,
    repoLocalConfigRelativePath: REPO_LOCAL_CONFIG_FILENAME,
    repoOverridesApplied: false,
  };

  if (!globalRepoPolicy?.repoOverrides) {
    return repoLocalPolicy;
  }

  return applyRepoOverrides(repoLocalPolicy, globalRepoPolicy.repoOverrides);
}

export async function bootstrapConfig(configPath: string, input: BootstrapConfigInput): Promise<EditableConfig> {
  if (await configFileExists(configPath)) {
    throw new ConfigError(`config file '${configPath}' already exists`);
  }

  const config = sanitizeEditableConfig({
    defaults: toOptionalPolicyDefaults(input),
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

    const explicitFeatureBranchPattern =
      repo.feature_branch_pattern === undefined ? undefined : resolveFeatureBranchPattern(repo.feature_branch_pattern);
    const defaultFeatureBranchPattern = resolveFeatureBranchPattern(config.defaults?.feature_branch_pattern);

    const explicitGitWorktreeBasePath =
      repo.git_worktree_base_path === undefined ? undefined : await resolveGitWorktreeBasePath(repo.git_worktree_base_path);
    const defaultGitWorktreeBasePath =
      config.defaults?.git_worktree_base_path === undefined
        ? undefined
        : await resolveGitWorktreeBasePath(config.defaults.git_worktree_base_path);
    const gitWorktreeBasePath = explicitGitWorktreeBasePath ?? defaultGitWorktreeBasePath;

    const patternSources = repo.allowed_branch_patterns ?? config.defaults?.allowed_branch_patterns ?? [];

    if (patternSources.length === 0) {
      throw new ConfigError(
        `repository '${repo.path}' must define allowed_branch_patterns directly or inherit them from top-level defaults`,
      );
    }

    const allowedBranchPatterns = compileBranchPatterns(patternSources, repo.path);
    const workflowMode = repo.workflow_mode ?? config.defaults?.workflow_mode;
    const repoOverrides = buildRepoOverrides({
      allowedBranchPatterns:
        repo.allowed_branch_patterns === undefined ? undefined : compileBranchPatterns(repo.allowed_branch_patterns, repo.path),
      featureBranchPattern: explicitFeatureBranchPattern,
      gitWorktreeBasePath: explicitGitWorktreeBasePath,
      defaultRemote: repo.default_remote,
      allowDraftPrs: repo.allow_draft_prs,
      workflowMode: repo.workflow_mode,
    });

    repositories.push({
      path: expandedPath,
      canonicalPath,
      worktreePath: canonicalPath,
      allowedBranchPatterns,
      featureBranchPattern: explicitFeatureBranchPattern ?? defaultFeatureBranchPattern,
      gitWorktreeBasePath,
      defaultRemote: repo.default_remote ?? config.defaults?.default_remote,
      allowDraftPrs: repo.allow_draft_prs ?? config.defaults?.allow_draft_prs ?? true,
      workflowMode,
      policySource: "global",
      repoOverrides,
      repoOverridesApplied: repoOverrides !== undefined,
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
    ...(input.workflow_mode ? { workflow_mode: input.workflow_mode } : {}),
  };
}

function buildRepoOverrides(input: RepoPolicyOverrides): RepoPolicyOverrides | undefined {
  const overrides: RepoPolicyOverrides = {
    ...(input.allowedBranchPatterns !== undefined ? { allowedBranchPatterns: input.allowedBranchPatterns } : {}),
    ...(input.featureBranchPattern !== undefined ? { featureBranchPattern: input.featureBranchPattern } : {}),
    ...(input.gitWorktreeBasePath !== undefined ? { gitWorktreeBasePath: input.gitWorktreeBasePath } : {}),
    ...(input.defaultRemote !== undefined ? { defaultRemote: input.defaultRemote } : {}),
    ...(input.allowDraftPrs !== undefined ? { allowDraftPrs: input.allowDraftPrs } : {}),
    ...(input.workflowMode !== undefined ? { workflowMode: input.workflowMode } : {}),
  };

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function applyRepoOverrides(
  repoLocalPolicy: RepoPolicy,
  repoOverrides: RepoPolicyOverrides,
): RepoPolicy {
  return {
    ...repoLocalPolicy,
    ...(repoOverrides.allowedBranchPatterns !== undefined
      ? { allowedBranchPatterns: repoOverrides.allowedBranchPatterns }
      : {}),
    ...(repoOverrides.featureBranchPattern !== undefined ? { featureBranchPattern: repoOverrides.featureBranchPattern } : {}),
    ...(repoOverrides.gitWorktreeBasePath !== undefined ? { gitWorktreeBasePath: repoOverrides.gitWorktreeBasePath } : {}),
    ...(repoOverrides.defaultRemote !== undefined ? { defaultRemote: repoOverrides.defaultRemote } : {}),
    ...(repoOverrides.allowDraftPrs !== undefined ? { allowDraftPrs: repoOverrides.allowDraftPrs } : {}),
    ...(repoOverrides.workflowMode !== undefined ? { workflowMode: repoOverrides.workflowMode } : {}),
    repoOverridesApplied: true,
  };
}

function resolveFeatureBranchPattern(pattern: string | undefined): string | undefined {
  return resolveUserPlaceholder(pattern);
}

function resolveUserPlaceholder(
  value: string | undefined,
  options: { escapeForRegex?: boolean } = {},
): string | undefined {
  if (!value?.includes("<user>")) {
    return value;
  }

  const runtimeUsername = resolveRuntimeUsername();
  const replacement = options.escapeForRegex ? escapeRegexLiteral(runtimeUsername) : runtimeUsername;

  return value.replaceAll("<user>", replacement);
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  throw new ConfigError("config uses '<user>' but no runtime username could be determined");
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

async function resolveGitWorktreeBasePath(
  inputPath: string | undefined,
  options: { repoRoot?: string } = {},
): Promise<string | undefined> {
  if (!inputPath) {
    return undefined;
  }

  const expandedPath = expandHomeDir(inputPath);
  if (!path.isAbsolute(expandedPath)) {
    if (options.repoRoot) {
      return await canonicalizeProspectivePath(path.resolve(options.repoRoot, expandedPath));
    }

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
    const resolvedPattern = resolveUserPlaceholder(pattern, { escapeForRegex: true }) ?? pattern;

    validateSafeBranchPattern(resolvedPattern, repoPath);

    try {
      return new RegExp(resolvedPattern);
    } catch (error) {
      throw new ConfigError(
        `invalid branch regex '${resolvedPattern}' for repository '${repoPath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
}

function validateSafeBranchPattern(pattern: string, repoPath: string): void {
  const groups: Array<{ containsQuantifier: boolean }> = [];
  let inCharClass = false;

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;

    if (char === "\\") {
      const nextChar = pattern[index + 1];
      if (!inCharClass) {
        if (nextChar && /[1-9]/.test(nextChar)) {
          throw new ConfigError(
            `branch regex '${pattern}' for repository '${repoPath}' uses unsupported backreferences; keep allowed_branch_patterns simple`,
          );
        }

        if (nextChar === "k" && pattern[index + 2] === "<") {
          throw new ConfigError(
            `branch regex '${pattern}' for repository '${repoPath}' uses unsupported named backreferences; keep allowed_branch_patterns simple`,
          );
        }
      }

      index += 1;
      continue;
    }

    if (inCharClass) {
      if (char === "]") {
        inCharClass = false;
      }

      continue;
    }

    if (char === "[") {
      inCharClass = true;
      continue;
    }

    if (char === "(") {
      if (pattern[index + 1] === "?") {
        if (pattern[index + 2] !== ":") {
          throw new ConfigError(
            `branch regex '${pattern}' for repository '${repoPath}' uses unsupported advanced group syntax; keep allowed_branch_patterns simple`,
          );
        }

        index += 2;
      }

      groups.push({ containsQuantifier: false });
      continue;
    }

    if (char === ")") {
      const group = groups.pop();
      if (!group) {
        continue;
      }

      const quantifier = readRegexQuantifier(pattern, index + 1);
      if (quantifier && group.containsQuantifier) {
        throw new ConfigError(
          `branch regex '${pattern}' for repository '${repoPath}' uses nested quantifiers; keep allowed_branch_patterns simple`,
        );
      }

      const parentGroup = groups.at(-1);
      if (parentGroup && (group.containsQuantifier || Boolean(quantifier))) {
        parentGroup.containsQuantifier = true;
      }

      if (quantifier) {
        index = quantifier.end - 1;
      }

      continue;
    }

    const quantifier = readRegexQuantifier(pattern, index);
    if (quantifier) {
      const group = groups.at(-1);
      if (group) {
        group.containsQuantifier = true;
      }

      index = quantifier.end - 1;
    }
  }
}

function readRegexQuantifier(pattern: string, index: number): { end: number } | undefined {
  const char = pattern[index];
  if (!char) {
    return undefined;
  }

  if (char === "*" || char === "+" || char === "?") {
    return {
      end: pattern[index + 1] === "?" ? index + 2 : index + 1,
    };
  }

  if (char !== "{") {
    return undefined;
  }

  let cursor = index + 1;
  if (!isAsciiDigit(pattern[cursor])) {
    return undefined;
  }

  while (isAsciiDigit(pattern[cursor])) {
    cursor += 1;
  }

  if (pattern[cursor] === "}") {
    cursor += 1;
    return {
      end: pattern[cursor] === "?" ? cursor + 1 : cursor,
    };
  }

  if (pattern[cursor] !== ",") {
    return undefined;
  }

  cursor += 1;
  while (isAsciiDigit(pattern[cursor])) {
    cursor += 1;
  }

  if (pattern[cursor] !== "}") {
    return undefined;
  }

  cursor += 1;
  return {
    end: pattern[cursor] === "?" ? cursor + 1 : cursor,
  };
}

function isAsciiDigit(char: string | undefined): boolean {
  return Boolean(char && /[0-9]/.test(char));
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
