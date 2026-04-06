import { describe, expect, it } from "vitest";

import { ghPrCreateDraftArgs } from "../src/exec/gh.js";

describe("gh argument builders", () => {
  it("builds constrained gh draft PR arguments", () => {
    expect(ghPrCreateDraftArgs({ base: "main", title: "Add feature", body: "Body" })).toEqual([
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

  it("builds constrained gh draft PR arguments with fill", () => {
    expect(ghPrCreateDraftArgs({ base: "main", fill: true })).toEqual([
      "pr",
      "create",
      "--draft",
      "--base",
      "main",
      "--fill",
    ]);
  });
});
