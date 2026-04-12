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

export class RepoLocalPolicyNotTrustedError extends Error {
  constructor(repoPath: string, configPath: string, reason: string) {
    super(`repo-local policy '${configPath}' for repository '${repoPath}' is not trusted: ${reason}`);
    this.name = "RepoLocalPolicyNotTrustedError";
  }
}

export class BranchNotAllowedError extends Error {
  constructor(branch: string, repoPath: string) {
    super(
      `branch '${branch}' does not match allowed patterns for repository '${repoPath}'; call 'git_repo_policy' to inspect the allowed branch patterns for this repository`,
    );
    this.name = "BranchNotAllowedError";
  }
}

export class BranchNameNotAllowedError extends Error {
  constructor(branch: string, repoPath: string) {
    super(
      `requested branch '${branch}' does not match allowed patterns for repository '${repoPath}'; call 'git_repo_policy' to inspect the allowed branch patterns for this repository`,
    );
    this.name = "BranchNameNotAllowedError";
  }
}

export class BranchingPolicyViolationError extends Error {
  constructor(toolName: string, repoPath: string, actualPolicies: string[]) {
    super(
      `tool '${toolName}' is not allowed for repository '${repoPath}' under branching_policies [${actualPolicies.join(", ")}]; call 'git_repo_policy' and use one of the configured setup flows`,
    );
    this.name = "BranchingPolicyViolationError";
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

export class RemoteResolutionError extends Error {
  constructor(repoPath: string) {
    super(`could not determine a remote for repository '${repoPath}'`);
    this.name = "RemoteResolutionError";
  }
}

export class BaseBranchResolutionError extends Error {
  constructor(repoPath: string, remote: string) {
    super(`could not determine a base branch for repository '${repoPath}' and remote '${remote}'`);
    this.name = "BaseBranchResolutionError";
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

export class DraftPrsDisabledError extends Error {
  constructor(repoPath: string) {
    super(`draft PR creation is disabled for repository '${repoPath}'`);
    this.name = "DraftPrsDisabledError";
  }
}

export class EmptyPullRequestTitleError extends Error {
  constructor() {
    super("pull request title must be non-empty");
    this.name = "EmptyPullRequestTitleError";
  }
}

export class PullRequestUrlParseError extends Error {
  constructor(output: string) {
    super(`could not parse pull request URL from gh output: ${output.trim() || "empty output"}`);
    this.name = "PullRequestUrlParseError";
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
