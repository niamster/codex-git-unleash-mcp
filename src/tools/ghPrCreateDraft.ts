import { DraftPrsDisabledError, EmptyPullRequestTitleError, PullRequestUrlParseError } from "../errors.js";
import { createDraftPullRequest } from "../exec/gh.js";
import type { RepoPolicy } from "../types/config.js";
import { resolveRepoBaseBranch, resolveRepoRemote } from "./runtimeDefaults.js";

export type GhPrCreateDraftResult = {
  url: string;
  base: string;
  head: string;
};

export async function ghPrCreateDraft(
  repo: RepoPolicy,
  headBranch: string,
  input: { title: string; body: string; base?: string },
): Promise<GhPrCreateDraftResult> {
  if (!repo.allowDraftPrs) {
    throw new DraftPrsDisabledError(repo.canonicalPath);
  }

  const title = input.title.trim();
  if (!title) {
    throw new EmptyPullRequestTitleError();
  }

  const requestedBase = input.base?.trim();
  const base = requestedBase || (await resolveRepoBaseBranch(repo, await resolveRepoRemote(repo)));
  const url = await createDraftPullRequest(repo.canonicalPath, {
    base,
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

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
