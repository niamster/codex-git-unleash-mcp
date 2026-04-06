import { runCommand } from "./run.js";

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

export function gitSwitchBranchArgs(branch: string): string[] {
  return ["checkout", branch];
}

export async function getGitTopLevel(cwd: string): Promise<string> {
  const result = await runCommand({
    cwd,
    command: "git",
    argv: ["rev-parse", "--show-toplevel"],
  });

  return result.stdout.trim();
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

export async function getHeadCommit(cwd: string): Promise<{ oid: string; summary: string }> {
  const result = await runCommand({
    cwd,
    command: "git",
    argv: ["log", "-1", "--format=%H%n%s"],
  });

  const [oid = "", summary = ""] = result.stdout.trimEnd().split("\n");
  return { oid, summary };
}
