import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { ConfigError } from "./errors.js";
import type { Config, RepoPolicy } from "./types/config.js";

const repoPolicySchema = z.object({
  path: z.string().min(1),
  allowed_branch_patterns: z.array(z.string().min(1)),
  default_remote: z.string().min(1).optional(),
  allow_draft_prs: z.boolean().optional(),
});

const configSchema = z.object({
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

    const allowedBranchPatterns = repo.allowed_branch_patterns.map((pattern) => {
      try {
        return new RegExp(pattern);
      } catch (error) {
        throw new ConfigError(
          `invalid branch regex '${pattern}' for repository '${repo.path}': ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });

    repositories.push({
      path: expandedPath,
      canonicalPath,
      worktreePath: canonicalPath,
      allowedBranchPatterns,
      defaultRemote: repo.default_remote,
      allowDraftPrs: repo.allow_draft_prs ?? true,
    });

    seenPaths.add(canonicalPath);
  }

  return { repositories };
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
