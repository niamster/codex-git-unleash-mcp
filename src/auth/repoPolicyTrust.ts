import { RepoLocalPolicyNotTrustedError } from "../errors.js";
import { fetchBranch, getVerifiedObjectId, hasWorkingTreeChanges } from "../exec/git.js";
import type { RepoPolicy } from "../types/config.js";
import { resolveRepoBaseBranch, resolveRepoRemote } from "../tools/runtimeDefaults.js";

export async function requireTrustedRepoPolicy(repo: RepoPolicy): Promise<void> {
  if (repo.policySource !== "repo_local") {
    return;
  }

  const configPath = repo.repoLocalConfigPath;
  const relativeConfigPath = repo.repoLocalConfigRelativePath;
  if (!configPath || !relativeConfigPath) {
    throw new RepoLocalPolicyNotTrustedError(
      repo.worktreePath,
      configPath ?? "<unknown>",
      "repo-local policy metadata is missing",
    );
  }

  const remote = await resolveRepoRemote(repo, { allowConfiguredDefaultRemote: false });
  const base = await resolveRepoBaseBranch(repo, remote);

  await fetchBranch(repo.worktreePath, remote, base);

  const baseSpec = `refs/remotes/${remote}/${base}:${relativeConfigPath}`;
  const indexSpec = `:${relativeConfigPath}`;

  const [baseOid, indexOid] = await Promise.all([
    getTrustedPolicyObjectId(repo.worktreePath, baseSpec, repo, configPath, `it is missing from ${remote}/${base}`),
    getTrustedPolicyObjectId(repo.worktreePath, indexSpec, repo, configPath, "it is missing from the index"),
  ]);

  if (baseOid !== indexOid) {
    throw new RepoLocalPolicyNotTrustedError(
      repo.worktreePath,
      configPath,
      `the staged repo-local policy differs from the trusted base branch '${remote}/${base}'`,
    );
  }

  if (await hasWorkingTreeChanges(repo.worktreePath, relativeConfigPath)) {
    throw new RepoLocalPolicyNotTrustedError(
      repo.worktreePath,
      configPath,
      "the working tree copy differs from the staged repo-local policy",
    );
  }
}

async function getTrustedPolicyObjectId(
  cwd: string,
  spec: string,
  repo: RepoPolicy,
  configPath: string,
  reason: string,
): Promise<string> {
  try {
    return await getVerifiedObjectId(cwd, spec);
  } catch {
    throw new RepoLocalPolicyNotTrustedError(repo.worktreePath, configPath, reason);
  }
}
