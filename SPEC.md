Agent MCP server to proxy some GIT and GH CLI/API commands to bypass Codex permissions checks.

Notably, I would like to avod Codex asking for permissions when calling `git add`, `git commit`, `git push`, etc.
The MCP server should protect from dangerous commands like `git commit --amend` or `git push --force`.

MCP server should be configurable:
 - list of allowed repositories
 - each allowed repository must define a list of patterns (regex) of allowed branches

See also https://developers.openai.com/codex/agent-approvals-security#protected-paths-in-writable-roots