import { BranchingPolicyViolationError } from "../errors.js";
import type { RepoPolicy, WorkflowMode } from "../types/config.js";

export function requireWorkflowMode(
  repo: RepoPolicy,
  toolName: string,
  allowedModes: WorkflowMode[],
): void {
  if (!repo.workflowMode) {
    return;
  }

  if (!allowedModes.includes(repo.workflowMode)) {
    throw new BranchingPolicyViolationError(toolName, repo.worktreePath, repo.workflowMode);
  }
}
