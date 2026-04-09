import fs from "node:fs/promises";
import path from "node:path";

import { PathValidationError } from "../errors.js";

export function validateRepoRelativePaths(repoRoot: string, inputPaths: string[]): string[] {
  if (inputPaths.length === 0) {
    throw new PathValidationError("at least one path is required");
  }

  return inputPaths.map((inputPath) => validateRepoRelativePath(repoRoot, inputPath));
}

export async function validateWorktreePath(inputPath: string): Promise<string> {
  if (!inputPath.trim()) {
    throw new PathValidationError("worktree path must be non-empty");
  }

  if (!path.isAbsolute(inputPath)) {
    throw new PathValidationError(`worktree path '${inputPath}' must be absolute`);
  }

  const resolvedPath = path.resolve(inputPath);
  const canonicalWorktreePath = await canonicalizeProspectivePath(resolvedPath);

  return canonicalWorktreePath;
}

export async function validateWorktreePathAgainstBasePath(
  inputPath: string,
  basePath: string | undefined,
): Promise<string> {
  const canonicalWorktreePath = await validateWorktreePath(inputPath);

  if (!basePath) {
    return canonicalWorktreePath;
  }

  const canonicalBasePath = await canonicalizeProspectivePath(path.resolve(basePath));
  const relativeToBase = path.relative(canonicalBasePath, canonicalWorktreePath);
  if (
    relativeToBase === ".." ||
    relativeToBase.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToBase)
  ) {
    throw new PathValidationError(
      `worktree path '${inputPath}' must be inside configured git_worktree_base_path '${basePath}'`,
    );
  }

  return canonicalWorktreePath;
}

function validateRepoRelativePath(repoRoot: string, inputPath: string): string {
  if (!inputPath.trim()) {
    throw new PathValidationError("path must be non-empty");
  }

  if (path.isAbsolute(inputPath)) {
    throw new PathValidationError(`absolute path '${inputPath}' is not allowed`);
  }

  const normalizedPath = path.normalize(inputPath);
  if (
    normalizedPath === ".." ||
    normalizedPath.startsWith(`..${path.sep}`) ||
    normalizedPath.includes(`${path.sep}..${path.sep}`) ||
    normalizedPath.endsWith(`${path.sep}..`)
  ) {
    throw new PathValidationError(`path '${inputPath}' escapes the repository root`);
  }

  const resolvedPath = path.resolve(repoRoot, normalizedPath);
  const relativeToRoot = path.relative(repoRoot, resolvedPath);
  if (
    relativeToRoot === ".." ||
    relativeToRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToRoot)
  ) {
    throw new PathValidationError(`path '${inputPath}' escapes the repository root`);
  }

  return relativeToRoot === "" ? "." : relativeToRoot;
}

async function canonicalizeProspectivePath(inputPath: string): Promise<string> {
  const parts: string[] = [];
  let currentPath = inputPath;

  while (true) {
    try {
      const canonicalBase = await fs.realpath(currentPath);
      return path.join(canonicalBase, ...parts.reverse());
    } catch {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        throw new PathValidationError(`worktree path '${inputPath}' could not be resolved`);
      }

      parts.push(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
}
