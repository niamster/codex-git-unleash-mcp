import fs from "node:fs/promises";
import { runCommand } from "./run.js";
import path from "node:path";

export function gitStatusArgs(): string[] {
  return ["status", "--short", "--branch"];
}

export function gitAddArgs(paths: string[]): string[] {
  return ["add", "--", ...paths];
}

export function gitCommitArgs(message: string): string[] {
  return ["commit", "-m", message];
}

export function gitPushArgs(remote: string, branch: string): string[] {
  return ["push", remote, `HEAD:refs/heads/${branch}`];
}

export function gitFetchBranchArgs(remote: string, branch: string): string[] {
  return ["fetch", remote, branch];
}

export function gitCreateBranchArgs(newBranch: string, startPoint: string): string[] {
  return ["branch", newBranch, startPoint];
}

export function gitWorktreeAddArgs(worktreePath: string, newBranch: string, startPoint: string): string[] {
  return ["worktree", "add", "-b", newBranch, worktreePath, startPoint];
}

export function gitSwitchBranchArgs(branch: string): string[] {
  return ["checkout", branch];
}

export function gitRemoteGetUrlArgs(remote: string): string[] {
  return ["remote", "get-url", remote];
}

export function gitBranchRemoteArgs(branch: string): string[] {
  return ["config", "--get", `branch.${branch}.remote`];
}

export function gitRemoteHeadArgs(remote: string): string[] {
  return ["ls-remote", "--symref", remote, "HEAD"];
}

export function gitRevParseVerifyArgs(spec: string): string[] {
  return ["rev-parse", "--verify", spec];
}

export async function getGitTopLevel(cwd: string): Promise<string> {
  const result = await runCommand({
    cwd,
    command: "git",
    argv: ["rev-parse", "--show-toplevel"],
  });

  return result.stdout.trim();
}

export async function getGitCommonDir(cwd: string): Promise<string> {
  const result = await runCommand({
    cwd,
    command: "git",
    argv: ["rev-parse", "--git-common-dir"],
  });

  return await resolveGitPath(cwd, result.stdout.trim());
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  const result = await runCommand({
    cwd,
    command: "git",
    argv: ["branch", "--show-current"],
  });

  return result.stdout.trim();
}

export async function getStatus(cwd: string): Promise<string> {
  const result = await runCommand({
    cwd,
    command: "git",
    argv: gitStatusArgs(),
  });

  return result.stdout;
}

export async function addPaths(cwd: string, paths: string[]): Promise<void> {
  await runCommand({
    cwd,
    command: "git",
    argv: gitAddArgs(paths),
  });
}

export async function hasStagedChanges(cwd: string): Promise<boolean> {
  const result = await runCommand({
    cwd,
    command: "git",
    argv: ["diff", "--cached", "--name-only"],
  });

  return result.stdout.trim().length > 0;
}

export async function createCommit(cwd: string, message: string): Promise<void> {
  await runCommand({
    cwd,
    command: "git",
    argv: gitCommitArgs(message),
  });
}

export async function pushBranch(cwd: string, remote: string, branch: string): Promise<void> {
  await runCommand({
    cwd,
    command: "git",
    argv: gitPushArgs(remote, branch),
  });
}

export async function fetchBranch(cwd: string, remote: string, branch: string): Promise<void> {
  await runCommand({
    cwd,
    command: "git",
    argv: gitFetchBranchArgs(remote, branch),
  });
}

export async function createBranch(cwd: string, newBranch: string, startPoint: string): Promise<void> {
  await runCommand({
    cwd,
    command: "git",
    argv: gitCreateBranchArgs(newBranch, startPoint),
  });
}

export async function addWorktree(
  cwd: string,
  worktreePath: string,
  newBranch: string,
  startPoint: string,
): Promise<void> {
  await runCommand({
    cwd,
    command: "git",
    argv: gitWorktreeAddArgs(worktreePath, newBranch, startPoint),
  });
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await runCommand({
      cwd,
      command: "git",
      argv: ["rev-parse", "--verify", `refs/heads/${branch}`],
    });
    return true;
  } catch {
    return false;
  }
}

export async function switchBranch(cwd: string, branch: string): Promise<void> {
  await runCommand({
    cwd,
    command: "git",
    argv: gitSwitchBranchArgs(branch),
  });
}

export async function remoteExists(cwd: string, remote: string): Promise<boolean> {
  try {
    await runCommand({
      cwd,
      command: "git",
      argv: gitRemoteGetUrlArgs(remote),
    });
    return true;
  } catch {
    return false;
  }
}

export async function getBranchRemote(cwd: string, branch: string): Promise<string | null> {
  try {
    const result = await runCommand({
      cwd,
      command: "git",
      argv: gitBranchRemoteArgs(branch),
    });
    const remote = result.stdout.trim();
    return remote || null;
  } catch {
    return null;
  }
}

export async function getRemoteHeadBranch(cwd: string, remote: string): Promise<string | null> {
  try {
    const result = await runCommand({
      cwd,
      command: "git",
      argv: gitRemoteHeadArgs(remote),
    });
    const headLine = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("ref: "));
    if (!headLine) {
      return null;
    }

    const match = /^ref:\s+refs\/heads\/(.+)\s+HEAD$/.exec(headLine);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function getHeadCommit(cwd: string): Promise<{ oid: string; summary: string }> {
  const result = await runCommand({
    cwd,
    command: "git",
    argv: ["log", "-1", "--format=%H%n%s"],
  });

  const [oid = "", summary = ""] = result.stdout.trimEnd().split("\n");
  return { oid, summary };
}

export async function getVerifiedObjectId(cwd: string, spec: string): Promise<string> {
  const result = await runCommand({
    cwd,
    command: "git",
    argv: gitRevParseVerifyArgs(spec),
  });

  return result.stdout.trim();
}

export async function hasWorkingTreeChanges(cwd: string, repoRelativePath: string): Promise<boolean> {
  try {
    await runCommand({
      cwd,
      command: "git",
      argv: ["diff", "--quiet", "--", repoRelativePath],
    });
    return false;
  } catch (error) {
    if (error instanceof Error && "exitCode" in error && error.exitCode === 1) {
      return true;
    }

    throw error;
  }
}

async function resolveGitPath(cwd: string, gitPath: string): Promise<string> {
  return await fs.realpath(path.resolve(cwd, gitPath));
}
