import fs from "node:fs/promises";
import path from "node:path";

import { loadRepoLocalPolicy } from "../config.js";
import { ConfigError, RepoNotAllowedError } from "../errors.js";
import { getGitCommonDir, getGitTopLevel } from "../exec/git.js";
import type { Config, RepoPolicy } from "../types/config.js";

export async function resolveAllowedRepo(config: Config, repoPath: string): Promise<RepoPolicy> {
  const absolutePath = path.resolve(repoPath);
  const resolvedRepo = await resolveRequestedRepo(absolutePath);
  if (!resolvedRepo) {
    throw new RepoNotAllowedError(absolutePath);
  }

  const repo = await findMatchingRepo(config, resolvedRepo.commonDir);
  const repoLocalPolicy = await loadRepoLocalPolicy(resolvedRepo.topLevel, repo);
  if (repoLocalPolicy) {
    return {
      ...repoLocalPolicy,
      worktreePath: resolvedRepo.topLevel,
    };
  }

  if (repo) {
    if (repo.allowedBranchPatterns.length === 0) {
      throw new ConfigError(
        `repository '${repo.path}' must define allowed_branch_patterns directly or inherit them from top-level defaults`,
      );
    }

    return {
      ...repo,
      worktreePath: resolvedRepo.topLevel,
    };
  }

  throw new RepoNotAllowedError(absolutePath);
}

async function findMatchingRepo(config: Config, commonDir: string): Promise<RepoPolicy | undefined> {
  for (const candidate of config.repositories) {
    if ((await getGitCommonDir(candidate.canonicalPath)) === commonDir) {
      return candidate;
    }
  }

  return undefined;
}

async function resolveRequestedRepo(
  absolutePath: string,
): Promise<{ topLevel: string; commonDir: string } | null> {
  try {
    const canonicalPath = await fs.realpath(absolutePath);
    return {
      topLevel: await fs.realpath(await getGitTopLevel(canonicalPath)),
      commonDir: await getGitCommonDir(canonicalPath),
    };
  } catch {
    return null;
  }
}
