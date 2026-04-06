import { spawn } from "node:child_process";

import { CommandExecutionError } from "../errors.js";

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function runCommand(args: {
  cwd: string;
  command: string;
  argv: string[];
}): Promise<RunResult> {
  const { cwd, command, argv } = args;

  return await new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, argv, {
      cwd,
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
