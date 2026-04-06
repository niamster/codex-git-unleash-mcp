import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { gitAdd } from "../src/tools/gitAdd.js";
import { PathValidationError } from "../src/errors.js";
import { createTempGitRepo } from "./helpers.js";
import { runCommand } from "../src/exec/run.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => fs.rm(tempPath, { force: true, recursive: true })));
});

describe("gitAdd", () => {
  it("stages validated repository-relative paths", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);
    await fs.mkdir(path.join(repoDir, "src"), { recursive: true });
    await fs.writeFile(path.join(repoDir, "src", "index.ts"), "export {};\n", "utf8");

    const result = await gitAdd(repo, ["src/index.ts"]);
    const status = await runCommand({ cwd: repoDir, command: "git", argv: ["diff", "--cached", "--name-only"] });

    expect(result.addedPaths).toEqual([path.normalize("src/index.ts")]);
    expect(status.stdout.trim()).toBe("src/index.ts");
  });

  it("rejects paths that escape the repository", async () => {
    const { repoDir, repo } = await createTempGitRepo();
    tempPaths.push(repoDir);

    await expect(gitAdd(repo, ["../secret"])).rejects.toBeInstanceOf(PathValidationError);
  });
});
