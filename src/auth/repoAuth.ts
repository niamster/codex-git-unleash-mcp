import fs from "node:fs/promises";
import path from "node:path";

import { RepoNotAllowedError } from "../errors.js";
import { getGitTopLevel } from "../exec/git.js";
import type { Config, RepoPolicy } from "../types/config.js";

export async function resolveAllowedRepo(config: Config, repoPath: string): Promise<RepoPolicy> {
  const absolutePath = path.resolve(repoPath);
  const canonicalPath = await fs.realpath(absolutePath);

  const repo = config.repositories.find((candidate) => candidate.canonicalPath === canonicalPath);
  if (!repo) {
    throw new RepoNotAllowedError(absolutePath);
  }

  const topLevel = await fs.realpath(await getGitTopLevel(repo.canonicalPath));
  if (topLevel !== repo.canonicalPath) {
    throw new RepoNotAllowedError(absolutePath);
  }

  return repo;
}
