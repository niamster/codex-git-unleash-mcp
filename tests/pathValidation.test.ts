import path from "node:path";

import { describe, expect, it } from "vitest";

import { PathValidationError } from "../src/errors.js";
import { validateRepoRelativePaths } from "../src/auth/pathValidation.js";

describe("validateRepoRelativePaths", () => {
  it("accepts plain repository-relative paths", () => {
    expect(validateRepoRelativePaths("/repo", ["src/index.ts", "README.md"])).toEqual([
      path.normalize("src/index.ts"),
      "README.md",
    ]);
  });

  it("rejects absolute paths", () => {
    expect(() => validateRepoRelativePaths("/repo", ["/etc/passwd"])).toThrowError(PathValidationError);
  });

  it("rejects traversal outside the repository", () => {
    expect(() => validateRepoRelativePaths("/repo", ["../secret"])).toThrowError(PathValidationError);
  });
});
