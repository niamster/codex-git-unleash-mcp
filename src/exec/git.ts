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

export async function getHeadCommit(cwd: string): Promise<{ oid: string; summary: string }> {
  const result = await runCommand({
    cwd,
    command: "git",
    argv: ["log", "-1", "--format=%H%n%s"],
  });

  const [oid = "", summary = ""] = result.stdout.trimEnd().split("\n");
  return { oid, summary };
}
