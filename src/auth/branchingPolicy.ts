import { BranchingPolicyViolationError } from "../errors.js";
import type { RepoPolicy, WorkflowMode } from "../types/config.js";

export function requireWorkflowMode(
  repo: RepoPolicy,
  toolName: string,
  allowedModes: WorkflowMode[],
): void {
  const allowedWorkflowModes = repo.allowedWorkflowModes ?? (repo.workflowMode ? [repo.workflowMode] : undefined);

  if (!allowedWorkflowModes?.some((mode) => allowedModes.includes(mode))) {
    throw new BranchingPolicyViolationError(toolName, repo.worktreePath, repo.workflowMode, repo.allowedWorkflowModes);
  }
}
