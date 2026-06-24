import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalizeProspectivePath } from "../src/pathCanonicalization.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("canonicalizeProspectivePath", () => {
  it("resolves the existing parent and preserves the prospective path suffix", async () => {
    const parentPath = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-canonical-parent-"));
    const linkContainerPath = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-canonical-link-"));
    const linkedParentPath = path.join(linkContainerPath, "parent-link");
    await fs.symlink(parentPath, linkedParentPath);
    tempPaths.push(parentPath, linkContainerPath);

    await expect(
      canonicalizeProspectivePath(path.join(linkedParentPath, "missing", "child"), (inputPath) => {
        return new Error(`unresolved ${inputPath}`);
      }),
    ).resolves.toBe(path.join(await fs.realpath(parentPath), "missing", "child"));
  });
});
