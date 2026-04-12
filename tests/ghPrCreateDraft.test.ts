import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BaseBranchResolutionError,
  DraftPrsDisabledError,
  EmptyPullRequestTitleError,
  PullRequestUrlParseError,
} from "../src/errors.js";
import type { RepoPolicy } from "../src/types/config.js";
import { ghPrCreateDraft } from "../src/tools/ghPrCreateDraft.js";

const { createDraftPullRequest } = vi.hoisted(() => ({
  createDraftPullRequest: vi.fn(),
}));
const { resolveRepoBaseBranch, resolveRepoRemote } = vi.hoisted(() => ({
  resolveRepoRemote: vi.fn(),
  resolveRepoBaseBranch: vi.fn(),
}));

vi.mock("../src/exec/gh.js", () => ({
  createDraftPullRequest,
  ghPrCreateDraftArgs: vi.fn(),
}));
vi.mock("../src/tools/runtimeDefaults.js", () => ({
  resolveRepoRemote,
  resolveRepoBaseBranch,
}));

const repo: RepoPolicy = {
  path: "/tmp/repo",
  canonicalPath: "/tmp/repo",
  worktreePath: "/tmp/repo",
  allowedBranchPatterns: [/^user\/.*$/],
  allowDraftPrs: true,
  policySource: "global",
};

afterEach(() => {
  createDraftPullRequest.mockReset();
  resolveRepoRemote.mockReset();
  resolveRepoBaseBranch.mockReset();
});

describe("ghPrCreateDraft", () => {
  it("creates a draft PR using the detected base by default", async () => {
    createDraftPullRequest.mockResolvedValue("https://github.com/example/repo/pull/123");
    resolveRepoRemote.mockResolvedValue("origin");
    resolveRepoBaseBranch.mockResolvedValue("main");

    const result = await ghPrCreateDraft(repo, "user/gh-pr-create-draft-v2", {
      title: "Add draft PR tool",
      body: "Implements gh_pr_create_draft",
    });

    expect(createDraftPullRequest).toHaveBeenCalledWith("/tmp/repo", {
      base: "main",
      title: "Add draft PR tool",
      body: "Implements gh_pr_create_draft",
    });
    expect(result).toEqual({
      url: "https://github.com/example/repo/pull/123",
      base: "main",
      head: "user/gh-pr-create-draft-v2",
    });
  });

  it("allows an explicit base without runtime base detection", async () => {
    createDraftPullRequest.mockResolvedValue("https://github.com/example/repo/pull/124");
    resolveRepoRemote.mockResolvedValue("origin");

    const result = await ghPrCreateDraft(repo, "user/gh-pr-create-draft-v2", {
      title: "Add draft PR tool",
      body: "",
      base: "main",
    });

    expect(result.base).toBe("main");
    expect(resolveRepoBaseBranch).not.toHaveBeenCalled();
    expect(createDraftPullRequest).toHaveBeenCalledWith("/tmp/repo", {
      base: "main",
      title: "Add draft PR tool",
      body: "",
    });
  });

  it("rejects disabled draft PRs", async () => {
    await expect(
      ghPrCreateDraft(
        {
          ...repo,
          allowDraftPrs: false,
        },
        "user/gh-pr-create-draft-v2",
        { title: "Add draft PR tool", body: "" },
      ),
    ).rejects.toBeInstanceOf(DraftPrsDisabledError);
  });

  it("rejects empty titles", async () => {
    await expect(
      ghPrCreateDraft(repo, "user/gh-pr-create-draft-v2", {
        title: "   ",
        body: "",
      }),
    ).rejects.toBeInstanceOf(EmptyPullRequestTitleError);
  });

  it("surfaces runtime base-detection failures", async () => {
    resolveRepoRemote.mockResolvedValue("origin");
    resolveRepoBaseBranch.mockRejectedValue(new BaseBranchResolutionError("/tmp/repo", "origin"));

    await expect(
      ghPrCreateDraft(repo, "user/gh-pr-create-draft-v2", {
        title: "Add draft PR tool",
        body: "",
      }),
    ).rejects.toBeInstanceOf(BaseBranchResolutionError);
  });

  it("rejects gh output that is not a PR URL", async () => {
    createDraftPullRequest.mockResolvedValue("created pull request");
    resolveRepoRemote.mockResolvedValue("origin");
    resolveRepoBaseBranch.mockResolvedValue("main");

    await expect(
      ghPrCreateDraft(repo, "user/gh-pr-create-draft-v2", {
        title: "Add draft PR tool",
        body: "",
      }),
    ).rejects.toBeInstanceOf(PullRequestUrlParseError);
  });
});
