# my-core MCP local access

Standalone Bun CLI for connecting local projects and runner containers to remote my-core MCP tools at `https://app.my-core.ru`.

The CLI is intentionally project-agnostic:

- Local development uses one machine-wide auth file: `~/.my-core/local-mcp.json`.
- Runner/container execution uses the container environment: `MY_CORE_RUNNER_TOKEN`, `MCP_API_KEY`, or `MY_CORE_MCP_TOKEN`.
- MCP client config never embeds the bearer token. It only points to the env var that contains it.
- The script is self-contained and does not import code from any project repository.

## Add to a project

Use this repository as a submodule so a checkout of `vpn`, `kolokol`, or any other project can bring the tool with it:

```bash
git submodule add git@github.com:nowaysgit/my-core-mcp.git tools/my-core-mcp
git submodule update --init --recursive tools/my-core-mcp
```

On a fresh machine after cloning a project:

```bash
git submodule update --init --recursive
```

## Local login

```bash
bun run tools/my-core-mcp/local-mcp.ts login --server https://app.my-core.ru
```

The command prints an authorization URL. Open it in a browser, sign in to my-core, and approve the code. The token is saved to:

```text
~/.my-core/local-mcp.json
```

Do not commit this file.

## Export env for an MCP client

Bash:

```bash
eval "$(bun run tools/my-core-mcp/local-mcp.ts env --shell bash)"
```

PowerShell:

```powershell
Invoke-Expression (bun run tools/my-core-mcp/local-mcp.ts env --shell powershell)
```

Print MCP server config:

```bash
bun run tools/my-core-mcp/local-mcp.ts config
```

## Runner/container mode

Do not run `login` in runner containers. Provide env instead:

```text
MY_CORE_BACKEND_URL or MY_CORE_MCP_BASE_URL
MY_CORE_AGENT_ID or MY_CORE_MCP_AGENT_ID
MY_CORE_RUNNER_TOKEN or MCP_API_KEY or MY_CORE_MCP_TOKEN
```

Then:

```bash
bun run tools/my-core-mcp/local-mcp.ts config
```

## Security rules

- Use only Bun: `bun` / `bunx`.
- Do not use `/v1/auth/login` for system operations.
- Do not print token values in logs, task comments, artifacts, prompt snapshots, screenshots, or CI output.
- Do not add project-local auth files or overrides. Local auth belongs to `~/.my-core/local-mcp.json`; runner auth belongs to the runner env.
- Do not copy this CLI into each project. Update this repository and move consuming projects to the new submodule commit.
