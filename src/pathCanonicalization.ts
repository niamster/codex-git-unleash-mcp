import fs from "node:fs/promises";
import path from "node:path";

export async function canonicalizeProspectivePath(
  inputPath: string,
  createUnresolvedPathError: (inputPath: string) => Error,
): Promise<string> {
  const parts: string[] = [];
  let currentPath = path.resolve(inputPath);

  while (true) {
    try {
      const canonicalBase = await fs.realpath(currentPath);
      return path.join(canonicalBase, ...parts.reverse());
    } catch {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        throw createUnresolvedPathError(inputPath);
      }

      parts.push(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
}
