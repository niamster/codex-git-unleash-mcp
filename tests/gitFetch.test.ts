import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PathValidationError } from "../src/errors.js";
import { getCurrentBranch } from "../src/exec/git.js";
import { runCommand } from "../src/exec/run.js";
import { gitAdd } from "../src/tools/gitAdd.js";
import { gitCommit } from "../src/tools/gitCommit.js";
import { gitFetch } from "../src/tools/gitFetch.js";
import { gitPush } from "../src/tools/gitPush.js";
import { createTempBareGitRepo, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("gitFetch", () => {
  it("fetches main when no branch is provided", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    const updaterDir = await fs.mkdtemp(path.join(path.dirname(repoDir), "git-mcp-updater-"));
    tempPaths.push(repoDir, remoteDir, updaterDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "add readme");
    await gitPush(repo, "main");
    await runCommand({ cwd: remoteDir, command: "git", argv: ["symbolic-ref", "HEAD", "refs/heads/main"] });

    await runCommand({ cwd: updaterDir, command: "git", argv: ["clone", remoteDir, "."] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["config", "user.name", "Codex Test"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["config", "user.email", "codex@example.com"] });
    await fs.writeFile(path.join(updaterDir, "CHANGELOG.md"), "update\n", "utf8");
    await runCommand({ cwd: updaterDir, command: "git", argv: ["add", "CHANGELOG.md"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["commit", "-m", "remote update"] });
    await runCommand({ cwd: updaterDir, command: "git", argv: ["push", "origin", "HEAD:refs/heads/main"] });

    const result = await gitFetch(repo, {});
    const remoteMain = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["rev-parse", "--verify", "refs/remotes/origin/main"],
    });
    const remoteMainCommit = await runCommand({
      cwd: updaterDir,
      command: "git",
      argv: ["rev-parse", "--verify", "HEAD"],
    });

    expect(result).toEqual({ remote: "origin", branch: "main" });
    expect(remoteMain.stdout.trim()).toBe(remoteMainCommit.stdout.trim());
  });

  it("fetches an explicit branch from the resolved remote", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    tempPaths.push(repoDir, remoteDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
    await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
    await gitAdd(repo, ["README.md"]);
    await gitCommit(repo, "add readme");
    await gitPush(repo, "main");
    await runCommand({ cwd: remoteDir, command: "git", argv: ["symbolic-ref", "HEAD", "refs/heads/main"] });

    await runCommand({ cwd: repoDir, command: "git", argv: ["checkout", "-b", "release"] });
    await expect(getCurrentBranch(repoDir)).resolves.toBe("release");
    await fs.writeFile(path.join(repoDir, "RELEASE.md"), "release\n", "utf8");
    await gitAdd(repo, ["RELEASE.md"]);
    await gitCommit(repo, "add release notes");
    await gitPush(repo, "release");
    await runCommand({ cwd: repoDir, command: "git", argv: ["checkout", "main"] });

    const result = await gitFetch(repo, { branch: "release" });
    const remoteRelease = await runCommand({
      cwd: repoDir,
      command: "git",
      argv: ["rev-parse", "--verify", "refs/remotes/origin/release"],
    });

    expect(result).toEqual({ remote: "origin", branch: "release" });
    expect(remoteRelease.stdout.trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  it("rejects non-plain branch names", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    const remoteDir = await createTempBareGitRepo();
    tempPaths.push(repoDir, remoteDir);

    await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });

    await expect(gitFetch(repo, { branch: "refs/heads/main" })).rejects.toBeInstanceOf(PathValidationError);
    await expect(gitFetch(repo, { branch: "main --tags" })).rejects.toBeInstanceOf(PathValidationError);
  });
});
