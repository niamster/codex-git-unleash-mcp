import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
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

async function makeExecutable(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, { mode: 0o755 });
}

describe("scripts/run-mcp.sh", () => {
  it("accepts inline key:: SSH signing keys when ssh-agent exposes the same public key", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-unleash-run-mcp-"));
    const binDir = path.join(tempDir, "bin");
    const configPath = path.join(tempDir, "config.yaml");
    const sshSocketPath = path.join(tempDir, "agent.sock");
    const tsxPath = path.join(process.cwd(), "node_modules/.bin/tsx");
    const tsxExisted = await fs
      .access(tsxPath)
      .then(() => true)
      .catch(() => false);
    const inlineKey = "key::ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBinlinekeyvalue test@example";
    const agentKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBinlinekeyvalue different-comment";

    await fs.mkdir(binDir);
    await fs.writeFile(configPath, "repositories: []\n");
    await makeExecutable(
      path.join(binDir, "git"),
      `#!/usr/bin/env bash
if [[ "$1" == "config" && "$2" == "--get" && "$3" == "user.signingkey" ]]; then
  printf '%s\n' '${inlineKey}'
  exit 0
fi
exit 1
`,
    );
    await makeExecutable(
      path.join(binDir, "ssh-add"),
      `#!/usr/bin/env bash
if [[ "$1" == "-L" ]]; then
  printf '%s\n' '${agentKey}'
  exit 0
fi
exit 1
`,
    );
    await makeExecutable(
      path.join(binDir, "tsx"),
      `#!/usr/bin/env bash
exit 0
`,
    );
    await makeExecutable(
      tsxPath,
      `#!/usr/bin/env bash
exit 0
`,
    );
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(sshSocketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });

    try {
      expect(() =>
        execFileSync("bash", ["scripts/run-mcp.sh", configPath], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PATH: `${binDir}:${process.env.PATH ?? ""}`,
            SSH_AUTH_SOCK: sshSocketPath,
          },
          stdio: "pipe",
        }),
      ).not.toThrow();
    } finally {
      server.close();
      if (!tsxExisted) {
        await fs.rm(tsxPath, { force: true });
      }
    }
  });
});
