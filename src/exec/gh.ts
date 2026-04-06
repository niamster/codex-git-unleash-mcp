import { runCommand } from "./run.js";

export function ghPrCreateDraftArgs(args: {
  base: string;
  fill?: boolean;
  title?: string;
  body?: string;
}): string[] {
  const argv = ["pr", "create", "--draft", "--base", args.base];

  if (args.fill) {
    argv.push("--fill");
  }

  if (args.title !== undefined) {
    argv.push("--title", args.title);
  }

  if (args.body !== undefined) {
    argv.push("--body", args.body);
  }

  return argv;
}

export async function createDraftPullRequest(
  cwd: string,
  args: { base: string; fill?: boolean; title?: string; body?: string },
): Promise<string> {
  const result = await runCommand({
    cwd,
    command: "gh",
    argv: ghPrCreateDraftArgs(args),
  });

  return result.stdout.trim();
}
