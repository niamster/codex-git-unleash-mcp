import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DraftPrsDisabledError,
  EmptyPullRequestTitleError,
  PullRequestBaseBranchError,
  PullRequestUrlParseError,
} from "../src/errors.js";
import type { RepoPolicy } from "../src/types/config.js";
import { ghPrCreateDraft } from "../src/tools/ghPrCreateDraft.js";

const { createDraftPullRequest } = vi.hoisted(() => ({
  createDraftPullRequest: vi.fn(),
}));

vi.mock("../src/exec/gh.js", () => ({
  createDraftPullRequest,
  ghPrCreateDraftArgs: vi.fn(),
}));

const repo: RepoPolicy = {
  path: "/tmp/repo",
  canonicalPath: "/tmp/repo",
  allowedBranchPatterns: [/^dm\/.*$/],
  defaultRemote: "origin",
  defaultPrBase: "main",
  allowDraftPrs: true,
};

afterEach(() => {
  createDraftPullRequest.mockReset();
});

describe("ghPrCreateDraft", () => {
  it("creates a draft PR using the configured default base", async () => {
    createDraftPullRequest.mockResolvedValue("https://github.com/example/repo/pull/123");

    const result = await ghPrCreateDraft(repo, "dm/gh-pr-create-draft-v2", {
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
      head: "dm/gh-pr-create-draft-v2",
    });
  });

  it("allows an explicit base when no configured default exists", async () => {
    createDraftPullRequest.mockResolvedValue("https://github.com/example/repo/pull/124");

    const result = await ghPrCreateDraft(
      {
        ...repo,
        defaultPrBase: undefined,
      },
      "dm/gh-pr-create-draft-v2",
      {
        title: "Add draft PR tool",
        body: "",
        base: "main",
      },
    );

    expect(result.base).toBe("main");
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
        "dm/gh-pr-create-draft-v2",
        { title: "Add draft PR tool", body: "" },
      ),
    ).rejects.toBeInstanceOf(DraftPrsDisabledError);
  });

  it("rejects empty titles", async () => {
    await expect(
      ghPrCreateDraft(repo, "dm/gh-pr-create-draft-v2", {
        title: "   ",
        body: "",
      }),
    ).rejects.toBeInstanceOf(EmptyPullRequestTitleError);
  });

  it("rejects explicit bases that conflict with configuration", async () => {
    await expect(
      ghPrCreateDraft(repo, "dm/gh-pr-create-draft-v2", {
        title: "Add draft PR tool",
        body: "",
        base: "release",
      }),
    ).rejects.toBeInstanceOf(PullRequestBaseBranchError);
  });

  it("rejects omitted bases when no configured default exists", async () => {
    await expect(
      ghPrCreateDraft(
        {
          ...repo,
          defaultPrBase: undefined,
        },
        "dm/gh-pr-create-draft-v2",
        {
          title: "Add draft PR tool",
          body: "",
        },
      ),
    ).rejects.toBeInstanceOf(PullRequestBaseBranchError);
  });

  it("rejects gh output that is not a PR URL", async () => {
    createDraftPullRequest.mockResolvedValue("created pull request");

    await expect(
      ghPrCreateDraft(repo, "dm/gh-pr-create-draft-v2", {
        title: "Add draft PR tool",
        body: "",
      }),
    ).rejects.toBeInstanceOf(PullRequestUrlParseError);
  });
});
