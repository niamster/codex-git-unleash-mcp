import { describe, expect, it } from "vitest";

import { fullMatch } from "../src/auth/branchAuth.js";

describe("fullMatch", () => {
  it("matches a full branch name", () => {
    expect(fullMatch(/^feature\/[a-z0-9._-]+$/, "feature/test-1")).toBe(true);
  });

  it("does not match only a substring", () => {
    expect(fullMatch(/feature\/[a-z0-9._-]+/, "x/feature/test-1")).toBe(false);
  });

  it("resets cached global regex state between calls", () => {
    const pattern = /feature\/[a-z0-9._-]+/g;

    expect(fullMatch(pattern, "feature/test-1")).toBe(true);
    expect(fullMatch(pattern, "feature/test-1")).toBe(true);
  });
});
