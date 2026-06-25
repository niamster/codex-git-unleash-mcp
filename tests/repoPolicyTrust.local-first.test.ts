import { afterEach, describe, expect, it, vi } from "vitest";

import { RepoLocalPolicyNotTrustedError } from "../src/errors.js";
import type { RepoPolicy } from "../src/types/config.js";

const {
  fetchBranch,
  getVerifiedObjectId,
  hasWorkingTreeChanges,
} = vi.hoisted(() => ({
  fetchBranch: vi.fn(),
  getVerifiedObjectId: vi.fn(),
  hasWorkingTreeChanges: vi.fn(),
}));

const {
  resolveRepoBaseBranch,
  resolveRepoRemote,
} = vi.hoisted(() => ({
  resolveRepoBaseBranch: vi.fn(),
  resolveRepoRemote: vi.fn(),
}));

vi.mock("../src/exec/git.js", () => ({
  fetchBranch,
  getVerifiedObjectId,
  hasWorkingTreeChanges,
}));

vi.mock("../src/tools/runtimeDefaults.js", () => ({
  resolveRepoBaseBranch,
  resolveRepoRemote,
}));

const { requireTrustedRepoPolicy } = await import("../src/auth/repoPolicyTrust.js");

const repo: RepoPolicy = {
  path: "/tmp/repo",
  canonicalPath: "/tmp/repo",
  worktreePath: "/tmp/repo",
  allowedBranchPatterns: [/^dm\/.*$/],
  allowDraftPrs: true,
  policySource: "repo_local",
  repoLocalConfigPath: "/tmp/repo/.git-unleash.yaml",
  repoLocalConfigRelativePath: ".git-unleash.yaml",
};

afterEach(() => {
  vi.restoreAllMocks();
  fetchBranch.mockReset();
  getVerifiedObjectId.mockReset();
  hasWorkingTreeChanges.mockReset();
  resolveRepoBaseBranch.mockReset();
  resolveRepoRemote.mockReset();
});

describe("requireTrustedRepoPolicy local-first trust checks", () => {
  it("uses the local trusted base copy without fetching when it is already available", async () => {
    resolveRepoRemote.mockResolvedValue("origin");
    resolveRepoBaseBranch.mockResolvedValue("main");
    getVerifiedObjectId.mockResolvedValue("same-oid");
    hasWorkingTreeChanges.mockResolvedValue(false);

    await expect(requireTrustedRepoPolicy(repo)).resolves.toBeUndefined();

    expect(resolveRepoRemote).toHaveBeenCalledWith(repo, { allowConfiguredDefaultRemote: false });
    expect(resolveRepoBaseBranch).toHaveBeenCalledWith(repo, "origin", { preferLocal: true });
    expect(fetchBranch).not.toHaveBeenCalled();
    expect(getVerifiedObjectId).toHaveBeenNthCalledWith(
      1,
      "/tmp/repo",
      "refs/remotes/origin/main:.git-unleash.yaml",
    );
    expect(getVerifiedObjectId).toHaveBeenNthCalledWith(2, "/tmp/repo", ":.git-unleash.yaml");
  });

  it("fetches the trusted base branch only after a local remote-tracking miss", async () => {
    resolveRepoRemote.mockResolvedValue("origin");
    resolveRepoBaseBranch.mockResolvedValue("main");
    getVerifiedObjectId
      .mockRejectedValueOnce(new Error("missing local remote-tracking blob"))
      .mockResolvedValueOnce("same-oid")
      .mockResolvedValueOnce("same-oid");
    hasWorkingTreeChanges.mockResolvedValue(false);

    await expect(requireTrustedRepoPolicy(repo)).resolves.toBeUndefined();

    expect(fetchBranch).toHaveBeenCalledWith("/tmp/repo", "origin", "main");
    expect(getVerifiedObjectId).toHaveBeenNthCalledWith(
      1,
      "/tmp/repo",
      "refs/remotes/origin/main:.git-unleash.yaml",
    );
    expect(getVerifiedObjectId).toHaveBeenNthCalledWith(
      2,
      "/tmp/repo",
      "refs/remotes/origin/main:.git-unleash.yaml",
    );
    expect(getVerifiedObjectId).toHaveBeenNthCalledWith(3, "/tmp/repo", ":.git-unleash.yaml");
  });

  it("still fails closed when the trusted base copy is unavailable after fetch", async () => {
    resolveRepoRemote.mockResolvedValue("origin");
    resolveRepoBaseBranch.mockResolvedValue("main");
    getVerifiedObjectId.mockRejectedValue(new Error("still missing"));

    await expect(requireTrustedRepoPolicy(repo)).rejects.toBeInstanceOf(RepoLocalPolicyNotTrustedError);
    expect(fetchBranch).toHaveBeenCalledWith("/tmp/repo", "origin", "main");
  });
});
