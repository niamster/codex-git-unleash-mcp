import { spawn } from "node:child_process";
import path from "node:path";

import { CommandExecutionError } from "../errors.js";

const DEFAULT_POSIX_PATH_SEGMENTS = ["/usr/local/bin", "/usr/local/sbin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
const DEFAULT_MACOS_PATH_SEGMENTS = ["/opt/homebrew/bin", "/opt/homebrew/sbin", ...DEFAULT_POSIX_PATH_SEGMENTS];

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export function resolvePathEnvKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

export function augmentExecutablePath(currentPath: string | undefined, platform = process.platform): string {
  const defaultSegments = platform === "darwin" ? DEFAULT_MACOS_PATH_SEGMENTS : DEFAULT_POSIX_PATH_SEGMENTS;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const segment of (currentPath ?? "").split(path.delimiter)) {
    const trimmed = segment.trim();
    if (trimmed === "" || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  for (const segment of defaultSegments) {
    if (seen.has(segment)) {
      continue;
    }

    seen.add(segment);
    result.push(segment);
  }

  return result.join(path.delimiter);
}

export function createSpawnEnv(env: NodeJS.ProcessEnv = process.env, platform = process.platform): NodeJS.ProcessEnv {
  const pathKey = resolvePathEnvKey(env);
  return {
    ...env,
    [pathKey]: augmentExecutablePath(env[pathKey], platform),
  };
}

export async function runCommand(args: {
  cwd: string;
  command: string;
  argv: string[];
  env?: NodeJS.ProcessEnv;
}): Promise<RunResult> {
  const { cwd, command, argv, env } = args;

  return await new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, argv, {
      cwd,
      env: createSpawnEnv(env),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve({ stdout, stderr, exitCode: 0 });
        return;
      }

      reject(
        new CommandExecutionError({
          command,
          args: argv,
          exitCode: exitCode ?? -1,
          stderr,
        }),
      );
    });
  });
}
