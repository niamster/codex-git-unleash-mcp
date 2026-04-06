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

export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathValidationError";
  }
}

export class EmptyCommitMessageError extends Error {
  constructor() {
    super("commit message must be non-empty");
    this.name = "EmptyCommitMessageError";
  }
}

export class EmptyCommitError extends Error {
  constructor(repoPath: string) {
    super(`repository '${repoPath}' has no staged changes to commit`);
    this.name = "EmptyCommitError";
  }
}

export class EmptyBranchNameError extends Error {
  constructor() {
    super("branch name must be non-empty");
    this.name = "EmptyBranchNameError";
  }
}

export class BranchAlreadyExistsError extends Error {
  constructor(branch: string, repoPath: string) {
    super(`branch '${branch}' already exists in repository '${repoPath}'`);
    this.name = "BranchAlreadyExistsError";
  }
}

export class MissingDefaultBaseBranchError extends Error {
  constructor(repoPath: string) {
    super(`repository '${repoPath}' does not define a default PR base branch`);
    this.name = "MissingDefaultBaseBranchError";
  }
}

export class DirtyWorktreeError extends Error {
  constructor(repoPath: string) {
    super(`repository '${repoPath}' has uncommitted changes`);
    this.name = "DirtyWorktreeError";
  }
}

export class BranchNotFoundError extends Error {
  constructor(branch: string, repoPath: string) {
    super(`branch '${branch}' does not exist in repository '${repoPath}'`);
    this.name = "BranchNotFoundError";
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
