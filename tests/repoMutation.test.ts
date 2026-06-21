import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BranchChangedDuringMutationError } from "../src/errors.js";
import { getCurrentBranch, switchBranch } from "../src/exec/git.js";
import { runCommand } from "../src/exec/run.js";
import { withAllowedBranchMutation, withRepoMutationLock } from "../src/auth/repoMutation.js";
import { createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("withAllowedBranchMutation", () => {
  it("fails when the current branch changes before the mutation completes", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await runCommand({ cwd: repoDir, command: "git", argv: ["add", "README.md"] });
    await runCommand({ cwd: repoDir, command: "git", argv: ["commit", "-m", "initial"] });
    await runCommand({ cwd: repoDir, command: "git", argv: ["branch", "feature/other"] });

    await expect(
      withAllowedBranchMutation(repo, async () => {
        await switchBranch(repo.worktreePath, "feature/other");
        return { changed: true };
      }),
    ).rejects.toEqual(new BranchChangedDuringMutationError("main", "feature/other", repo.worktreePath));
  });
});

describe("withRepoMutationLock", () => {
  it("serializes mutations that target the same worktree", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const first = withRepoMutationLock(repo, async () => {
      events.push("first:start");
      markFirstStarted();
      await firstBlocked;
      events.push("first:end");
    });

    const second = withRepoMutationLock(repo, async () => {
      events.push("second:start");
      events.push(`second:branch:${await getCurrentBranch(repo.worktreePath)}`);
    });

    await firstStarted;
    expect(events).toEqual(["first:start"]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(["first:start", "first:end", "second:start", "second:branch:main"]);
  });
});
