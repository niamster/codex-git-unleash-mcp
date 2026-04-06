import { describe, expect, it } from "vitest";

import { ghPrCreateDraftArgs } from "../src/exec/gh.js";

describe("gh argument builders", () => {
  it("builds constrained gh draft PR arguments", () => {
    expect(ghPrCreateDraftArgs("main", "Add feature", "Body")).toEqual([
      "pr",
      "create",
      "--draft",
      "--base",
      "main",
      "--title",
      "Add feature",
      "--body",
      "Body",
    ]);
  });
});
