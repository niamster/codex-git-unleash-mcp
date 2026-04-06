import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("loadConfig", () => {
  it("loads config and applies defaults", async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-repo-"));
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}.yaml`);
    tempPaths.push(repoDir, configPath);

    await fs.writeFile(
      configPath,
      `repositories:\n  - path: ${repoDir}\n    allowed_branch_patterns:\n      - "^feature/.+$"\n`,
      "utf8",
    );

    const config = await loadConfig(configPath);
    const canonicalRepoDir = await fs.realpath(repoDir);

    expect(config.repositories).toHaveLength(1);
    expect(config.repositories[0]?.canonicalPath).toBe(canonicalRepoDir);
    expect(config.repositories[0]?.defaultRemote).toBe("origin");
    expect(config.repositories[0]?.allowDraftPrs).toBe(true);
  });

  it("expands home-directory paths", async () => {
    const fakeHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-home-"));
    const repoDir = path.join(fakeHomeDir, "projects", "git-mcp-home-repo");
    const configPath = path.join(os.tmpdir(), `git-mcp-config-${Date.now()}-home.yaml`);
    tempPaths.push(fakeHomeDir, configPath);

    await fs.mkdir(repoDir, { recursive: true });

    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(fakeHomeDir);
    try {
      await fs.writeFile(
        configPath,
        `repositories:\n  - path: ~/projects/git-mcp-home-repo\n    allowed_branch_patterns:\n      - "^main$"\n`,
        "utf8",
      );

      const config = await loadConfig(configPath);
      const canonicalRepoDir = await fs.realpath(repoDir);

      expect(config.repositories[0]?.path).toBe(repoDir);
      expect(config.repositories[0]?.canonicalPath).toBe(canonicalRepoDir);
    } finally {
      homedirSpy.mockRestore();
    }
  });
});
