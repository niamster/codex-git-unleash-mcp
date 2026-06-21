# Config Restart Response Design

## Context

`config_bootstrap` and `config_upsert_repo` reload configuration from disk on each subsequent runtime tool call. Their responses and tool descriptions nevertheless state that the MCP server must restart, which contradicts the runtime behavior and existing README documentation.

## Decision

Remove `restartRequired` from both config tool responses. Update both tool descriptions to state that runtime tools load the new configuration on their next call.

Removing the field avoids preserving a misleading concept in the response contract. Callers should treat successful completion as sufficient and may invoke runtime tools immediately afterward.

## Scope

- Update the `config_bootstrap` response in `src/server.ts`.
- Update the `config_upsert_repo` response in `src/server.ts`.
- Correct both tools' registered descriptions.
- Add server tests that exercise both handlers and verify that their parsed responses omit `restartRequired`.
- Add description assertions that agree with automatic runtime reload behavior.

The existing README already documents automatic reload and requires no change.

## Testing

Regression tests will invoke the registered config handlers with temporary config paths, parse their text responses, and assert that `restartRequired` is absent while the remaining response fields retain their current values. Tests will also verify that both tool descriptions state that changes apply on the next tool call.

The regression tests will be added and observed failing before the production change. The complete test suite, typecheck, and build will run after implementation.

## Compatibility

Removing a response field changes the response shape for callers that explicitly consume `restartRequired`. This is intentional: the field communicates an invalid requirement, and removing it prevents callers from treating restart behavior as part of the supported contract. Existing response fields remain unchanged.
