import { runCommand } from "./run.js";

export function gitStatusArgs(): string[] {
  return ["status", "--short", "--branch"];
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
