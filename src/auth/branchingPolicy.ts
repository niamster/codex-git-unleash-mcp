import { BranchingPolicyViolationError } from "../errors.js";
import type { BranchingPolicy, RepoPolicy } from "../types/config.js";

export function requireBranchingPolicy(
  repo: RepoPolicy,
  toolName: string,
  allowedPolicies: BranchingPolicy[],
): void {
  if (!repo.branchingPolicy) {
    return;
  }

  if (!allowedPolicies.includes(repo.branchingPolicy)) {
    throw new BranchingPolicyViolationError(toolName, repo.worktreePath, repo.branchingPolicy);
  }
}
