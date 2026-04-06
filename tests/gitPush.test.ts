import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCommand } from "../src/exec/run.js";
import { gitAdd } from "../src/tools/gitAdd.js";
import { gitCommit } from "../src/tools/gitCommit.js";
import { gitPush } from "../src/tools/gitPush.js";
import { createTempBareGitRepo, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("gitPush", () => {
  it("pushes the current branch to the configured remote", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    tempPaths.push(repoDir, remoteDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "add readme");

    const branchResult = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["branch", "--show-current"],
    });
    const branch = branchResult.stdout.trim();

    const result = await gitPush(repo, branch);
    const remoteHead = await runCommand({
      cwd: remoteDir,
      command: "git",
      argv: ["rev-parse", "--verify", `refs/heads/${branch}`],
    });

    expect(result).toEqual({ remote: "origin", branch });
    expect(remoteHead.stdout.trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  it("uses a fixed push target for the configured remote and branch", async () => {
    expect((await import("../src/exec/git.js")).gitPushArgs("origin", "main")).toEqual([
      "push",
      "origin",
      "HEAD:refs/heads/main",
    ]);
  });
});
