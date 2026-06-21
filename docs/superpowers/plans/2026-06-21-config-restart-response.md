# Config Restart Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the misleading `restartRequired` field from config tool responses and describe the automatic next-call reload behavior accurately.

**Architecture:** Keep config persistence and runtime loading unchanged. Lock the public MCP contract down through handler-level tests, then make the minimal response and metadata changes in `createServer`.

**Tech Stack:** TypeScript, Model Context Protocol SDK, Vitest

---

## File Structure

- Modify `tests/server.test.ts`: exercise the registered config handlers and descriptions as the public server contract.
- Modify `src/server.ts`: remove the obsolete response fields and correct the registered tool descriptions.

### Task 1: Add Failing Config Tool Contract Tests

**Files:**
- Modify: `tests/server.test.ts`

- [ ] **Step 1: Add response and description regression tests**

Add these tests inside the existing `describe("createServer", ...)` block:

```ts
  it("omits restartRequired from config tool responses", async () => {
    const configPath = path.join(os.tmpdir(), `git-mcp-config-tools-${Date.now()}.yaml`);
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-mcp-config-tools-repo-"));
    tempPaths.push(configPath, repoDir);

    const server = createServer(configPath) as unknown as {
      _registeredTools: Record<
        string,
        {
          handler: (input: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
        }
      >;
    };

    const bootstrapResult = await server._registeredTools.config_bootstrap!.handler({});
    expect(JSON.parse(bootstrapResult.content[0]!.text!)).toEqual({
      configPath,
      repositories: 0,
    });

    const upsertResult = await server._registeredTools.config_upsert_repo!.handler({ repo_path: repoDir });
    expect(JSON.parse(upsertResult.content[0]!.text!)).toEqual({
      configPath,
      action: "created",
      repo: { path: repoDir },
    });
  });

  it("describes automatic config reload behavior", () => {
    const server = createServer("/tmp/config.yaml") as unknown as {
      _registeredTools: Record<string, { description?: string }>;
    };

    expect(server._registeredTools.config_bootstrap?.description).toContain(
      "runtime tools load the new configuration on their next call",
    );
    expect(server._registeredTools.config_upsert_repo?.description).toContain(
      "runtime tools load the new configuration on their next call",
    );
  });
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/server.test.ts`

Expected: FAIL because both responses still contain `restartRequired: true` and both descriptions still require a restart.

- [ ] **Step 3: Commit the failing regression tests**

Stage `tests/server.test.ts` with `git_unleash.git_add`, then commit through `git_unleash.git_commit` using:

```text
git-unleash: cover config tool reload contract

npm test -- tests/server.test.ts
FAIL: responses include restartRequired and descriptions require restart

The tests are red because the restart flag refuses to leave quietly.

Co-Authored-By: Codex <noreply@openai.com>
```

### Task 2: Correct Config Tool Responses and Descriptions

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Update the bootstrap description and response**

Change the `config_bootstrap` description to:

```ts
"Create the initial MCP config file when it does not yet exist. This tool writes a minimal valid YAML config; runtime tools load the new configuration on their next call."
```

Remove this property from its JSON response:

```ts
restartRequired: true,
```

- [ ] **Step 2: Update the upsert description and response**

Change the `config_upsert_repo` description to:

```ts
"Add or update one repository entry in the MCP config file. This tool validates the resulting YAML against the existing schema; runtime tools load the new configuration on their next call."
```

Remove this property from its JSON response:

```ts
restartRequired: true,
```

- [ ] **Step 3: Run the focused tests and verify GREEN**

Run: `npm test -- tests/server.test.ts`

Expected: PASS for all tests in `tests/server.test.ts`.

- [ ] **Step 4: Run complete verification**

Run these commands independently:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all test files pass, typecheck exits successfully, and the build exits successfully.

- [ ] **Step 5: Commit the implementation**

Stage `src/server.ts` with `git_unleash.git_add`, then commit through `git_unleash.git_commit` using:

```text
git-unleash: remove config restart requirement

npm test
npm run typecheck
npm run build

No restart was harmed in the removal of this flag.

Co-Authored-By: Codex <noreply@openai.com>
```

### Task 3: Publish the Fix

**Files:**
- Read: `.github/PULL_REQUEST_TEMPLATE.md` or `.github/pull_request_template.md`, if present

- [ ] **Step 1: Confirm the worktree is clean and inspect the commit sequence**

Use `git_unleash.git_status` and verify the commits are ordered as design, failing regression tests, then implementation.

- [ ] **Step 2: Push the feature branch**

Use `git_unleash.git_push` for `dm/issue-51-restart-required`.

- [ ] **Step 3: Create a draft pull request**

Use `git_unleash.gh_pr_create_draft`. Follow the repository PR template if one exists, explain why the misleading field is removed, include verification results, describe the response-shape compatibility impact, and include `Closes #51`.
