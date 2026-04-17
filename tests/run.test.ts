import { describe, expect, it } from "vitest";

import { augmentExecutablePath, createSpawnEnv, resolvePathEnvKey } from "../src/exec/run.js";

describe("resolvePathEnvKey", () => {
  it("reuses an existing case-variant path key", () => {
    expect(resolvePathEnvKey({ Path: "/usr/bin" })).toBe("Path");
  });

  it("defaults to PATH when no path-like key exists", () => {
    expect(resolvePathEnvKey({ HOME: "/tmp/home" })).toBe("PATH");
  });
});

describe("augmentExecutablePath", () => {
  it("appends common Homebrew locations on macOS", () => {
    expect(augmentExecutablePath("/usr/bin:/bin", "darwin")).toBe(
      "/usr/bin:/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/sbin",
    );
  });

  it("does not duplicate entries that are already present", () => {
    expect(augmentExecutablePath("/opt/homebrew/bin:/usr/bin:/opt/homebrew/bin", "darwin")).toBe(
      "/opt/homebrew/bin:/usr/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/bin:/usr/sbin:/sbin",
    );
  });

  it("provides a usable default PATH when one is missing", () => {
    expect(augmentExecutablePath(undefined, "linux")).toBe(
      "/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin",
    );
  });
});

describe("createSpawnEnv", () => {
  it("preserves the original env object shape while augmenting PATH", () => {
    expect(createSpawnEnv({ HOME: "/tmp/home", PATH: "/usr/bin:/bin" }, "linux")).toEqual({
      HOME: "/tmp/home",
      PATH: "/usr/bin:/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/sbin",
    });
  });

  it("augments case-variant path keys without adding PATH twice", () => {
    expect(createSpawnEnv({ Path: "/usr/bin:/bin" }, "linux")).toEqual({
      Path: "/usr/bin:/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/sbin",
    });
  });
});
