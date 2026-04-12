import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { requireTrustedRepoPolicy } from "../src/auth/repoPolicyTrust.js";
import { resolveAllowedRepo } from "../src/auth/repoAuth.js";
import { RepoLocalPolicyNotTrustedError } from "../src/errors.js";
import { runCommand } from "../src/exec/run.js";
import { configureTestGitRepo, createTempBareGitRepo, createTempGitRepo } from "./helpers.js";

const tempPaths: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("requireTrustedRepoPolicy", () => {
  it("accepts a repo-local policy that matches the trusted base branch", async () => {
    const repo = await setupRepoWithTrustedRepoLocalPolicy();
    await expect(requireTrustedRepoPolicy(repo)).resolves.toBeUndefined();
  });

  it("rejects unstaged repo-local policy changes", async () => {
    const repo = await setupRepoWithTrustedRepoLocalPolicy();
    await fs.appendFile(repo.repoLocalConfigPath!, "\nallow_draft_prs: false\n", "utf8");

    await expect(requireTrustedRepoPolicy(repo)).rejects.toBeInstanceOf(RepoLocalPolicyNotTrustedError);
  });

  it("rejects staged repo-local policy changes that diverge from the trusted base branch", async () => {
    const repo = await setupRepoWithTrustedRepoLocalPolicy();
    await fs.appendFile(repo.repoLocalConfigPath!, "\nallow_draft_prs: false\n", "utf8");
    await runCommand({
      cwd: repo.worktreePath,
      command: "git",
      argv: ["add", "--", repo.repoLocalConfigRelativePath!],
    });

    await expect(requireTrustedRepoPolicy(repo)).rejects.toBeInstanceOf(RepoLocalPolicyNotTrustedError);
  });
});

async function setupRepoWithTrustedRepoLocalPolicy() {
  const { repoDir } = await createTempGitRepo();
  const remoteDir = await createTempBareGitRepo();
  tempPaths.push(repoDir, remoteDir);
  vi.stubEnv("USER", "codex");
  vi.stubEnv("USERNAME", "");

  const policyPath = path.join(repoDir, ".git-unleash.yaml");
  await fs.writeFile(
    policyPath,
    [
      "allowed_branch_patterns:",
      '  - "^main$"',
      'feature_branch_pattern: "<user>/<feature-name>"',
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(path.join(repoDir, "README.md"), "hello\n", "utf8");
  await runCommand({ cwd: repoDir, command: "git", argv: ["add", "README.md", ".git-unleash.yaml"] });
  await runCommand({ cwd: repoDir, command: "git", argv: ["commit", "-m", "init"] });
  await runCommand({ cwd: repoDir, command: "git", argv: ["remote", "add", "origin", remoteDir] });
  await runCommand({ cwd: repoDir, command: "git", argv: ["push", "origin", "HEAD:refs/heads/main"] });
  await runCommand({ cwd: remoteDir, command: "git", argv: ["symbolic-ref", "HEAD", "refs/heads/main"] });

  const updaterDir = `${repoDir}-updater`;
  await runCommand({ cwd: path.dirname(updaterDir), command: "git", argv: ["clone", remoteDir, updaterDir] });
  await configureTestGitRepo(updaterDir);
  tempPaths.push(updaterDir);

  return await resolveAllowedRepo({ repositories: [] }, repoDir);
}
