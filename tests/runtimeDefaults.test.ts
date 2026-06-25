import { afterEach, describe, expect, it, vi } from "vitest";

import { BaseBranchResolutionError } from "../src/errors.js";
import type { RepoPolicy } from "../src/types/config.js";
import { resolveRepoBaseBranch } from "../src/tools/runtimeDefaults.js";

const {
  getLocalRemoteHeadBranch,
  getRemoteHeadBranch,
} = vi.hoisted(() => ({
  getLocalRemoteHeadBranch: vi.fn(),
  getRemoteHeadBranch: vi.fn(),
}));

const { getRepoDefaultBranch } = vi.hoisted(() => ({
  getRepoDefaultBranch: vi.fn(),
}));

vi.mock("../src/exec/git.js", async () => {
  const actual = await vi.importActual<typeof import("../src/exec/git.js")>("../src/exec/git.js");
  return {
    ...actual,
    getLocalRemoteHeadBranch,
    getRemoteHeadBranch,
  };
});

vi.mock("../src/exec/gh.js", () => ({
  getRepoDefaultBranch,
}));

const repo: RepoPolicy = {
  path: "/tmp/repo",
  canonicalPath: "/tmp/repo",
  worktreePath: "/tmp/repo",
  allowedBranchPatterns: [/^dm\/.*$/],
  allowDraftPrs: true,
  policySource: "global",
};

afterEach(() => {
  vi.restoreAllMocks();
  getLocalRemoteHeadBranch.mockReset();
  getRemoteHeadBranch.mockReset();
  getRepoDefaultBranch.mockReset();
});

describe("resolveRepoBaseBranch", () => {
  it("prefers the local remote-tracking HEAD when requested", async () => {
    getLocalRemoteHeadBranch.mockResolvedValue("main");

    await expect(resolveRepoBaseBranch(repo, "origin", { preferLocal: true })).resolves.toBe("main");

    expect(getLocalRemoteHeadBranch).toHaveBeenCalledWith("/tmp/repo", "origin");
    expect(getRemoteHeadBranch).not.toHaveBeenCalled();
    expect(getRepoDefaultBranch).not.toHaveBeenCalled();
  });

  it("falls back to remote HEAD and then GitHub default branch when the local ref is unavailable", async () => {
    getLocalRemoteHeadBranch.mockResolvedValue(null);
    getRemoteHeadBranch.mockResolvedValue(null);
    getRepoDefaultBranch.mockResolvedValue("trunk");

    await expect(resolveRepoBaseBranch(repo, "origin", { preferLocal: true })).resolves.toBe("trunk");

    expect(getLocalRemoteHeadBranch).toHaveBeenCalledWith("/tmp/repo", "origin");
    expect(getRemoteHeadBranch).toHaveBeenCalledWith("/tmp/repo", "origin");
    expect(getRepoDefaultBranch).toHaveBeenCalledWith("/tmp/repo");
  });

  it("raises the existing resolution error when no local or remote default branch can be determined", async () => {
    getLocalRemoteHeadBranch.mockResolvedValue(null);
    getRemoteHeadBranch.mockResolvedValue(null);
    getRepoDefaultBranch.mockResolvedValue(null);

    await expect(resolveRepoBaseBranch(repo, "origin", { preferLocal: true })).rejects.toBeInstanceOf(
      BaseBranchResolutionError,
    );
  });
});
