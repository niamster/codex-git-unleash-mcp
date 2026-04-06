export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class RepoNotAllowedError extends Error {
  constructor(repoPath: string) {
    super(`repository '${repoPath}' is not allowlisted`);
    this.name = "RepoNotAllowedError";
  }
}

export class BranchNotAllowedError extends Error {
  constructor(branch: string, repoPath: string) {
    super(`branch '${branch}' does not match allowed patterns for repository '${repoPath}'`);
    this.name = "BranchNotAllowedError";
  }
}

export class DetachedHeadError extends Error {
  constructor(repoPath: string) {
    super(`repository '${repoPath}' is in detached HEAD state`);
    this.name = "DetachedHeadError";
  }
}

export class CommandExecutionError extends Error {
  public readonly command: string;
  public readonly args: string[];
  public readonly exitCode: number;
  public readonly stderr: string;

  constructor(input: { command: string; args: string[]; exitCode: number; stderr: string }) {
    super(`${input.command} exited with code ${input.exitCode}: ${input.stderr.trim() || "no stderr"}`);
    this.name = "CommandExecutionError";
    this.command = input.command;
    this.args = input.args;
    this.exitCode = input.exitCode;
    this.stderr = input.stderr;
  }
}
