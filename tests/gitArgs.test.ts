import { describe, expect, it } from "vitest";

import { gitAddArgs, gitCommitArgs } from "../src/exec/git.js";

describe("git argument builders", () => {
  it("builds constrained git add arguments", () => {
    expect(gitAddArgs(["src/index.ts", "README.md"])).toEqual([
      "add",
      "--",
      "src/index.ts",
      "README.md",
    ]);
  });

  it("builds constrained git commit arguments", () => {
    expect(gitCommitArgs("test message")).toEqual(["commit", "-m", "test message"]);
  });
});
