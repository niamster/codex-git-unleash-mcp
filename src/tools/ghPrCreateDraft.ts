import {
  DraftPrsDisabledError,
  EmptyPullRequestTitleError,
  PullRequestBaseBranchError,
  PullRequestUrlParseError,
} from "../errors.js";
import { createDraftPullRequest } from "../exec/gh.js";
import type { RepoPolicy } from "../types/config.js";

export type GhPrCreateDraftResult = {
  url: string;
  base: string;
  head: string;
};

export async function ghPrCreateDraft(
  repo: RepoPolicy,
  headBranch: string,
  input: { title?: string; body?: string; base?: string; fill?: boolean },
): Promise<GhPrCreateDraftResult> {
  if (!repo.allowDraftPrs) {
    throw new DraftPrsDisabledError(repo.canonicalPath);
  }

  const fill = input.fill ?? false;
  const title = input.title?.trim();
  if (!fill && !title) {
    throw new EmptyPullRequestTitleError();
  }

  const requestedBase = input.base?.trim();
  const configuredBase = repo.defaultPrBase;
  const base = resolveBaseBranch(repo.canonicalPath, configuredBase, requestedBase);
  const url = await createDraftPullRequest(repo.canonicalPath, {
    base,
    fill,
    title,
    body: input.body,
  });

  if (!looksLikeUrl(url)) {
    throw new PullRequestUrlParseError(url);
  }

  return {
    url,
    base,
    head: headBranch,
  };
}

function resolveBaseBranch(
  repoPath: string,
  configuredBase: string | undefined,
  requestedBase: string | undefined,
): string {
  if (configuredBase && requestedBase && configuredBase !== requestedBase) {
    throw new PullRequestBaseBranchError(
      `pull request base '${requestedBase}' does not match configured default base '${configuredBase}' for repository '${repoPath}'`,
    );
  }

  if (configuredBase) {
    return configuredBase;
  }

  if (!requestedBase) {
    throw new PullRequestBaseBranchError(
      `pull request base must be provided when repository '${repoPath}' does not define a default PR base branch`,
    );
  }

  return requestedBase;
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
