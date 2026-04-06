import path from "node:path";

import { PathValidationError } from "../errors.js";

export function validateRepoRelativePaths(repoRoot: string, inputPaths: string[]): string[] {
  if (inputPaths.length === 0) {
    throw new PathValidationError("at least one path is required");
  }

  return inputPaths.map((inputPath) => validateRepoRelativePath(repoRoot, inputPath));
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
