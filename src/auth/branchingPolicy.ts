import { BranchingPolicyViolationError } from "../errors.js";
import type { BranchingPolicy, RepoPolicy } from "../types/config.js";

export function requireBranchingPolicy(
  repo: RepoPolicy,
  toolName: string,
  allowedPolicies: BranchingPolicy[],
): void {
  if (!repo.branchingPolicies || repo.branchingPolicies.length === 0) {
    return;
  }

  if (!repo.branchingPolicies.some((policy) => allowedPolicies.includes(policy))) {
    throw new BranchingPolicyViolationError(toolName, repo.worktreePath, repo.branchingPolicies);
  }
}
