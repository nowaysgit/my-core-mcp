## Локальный доступ к удалённым my-core MCP tools

Удалённые MCP-инструменты my-core доступны локально через единый сайт:

`https://app.my-core.ru`

Этот проект использует общий MCP CLI из submodule:

`tools/my-core-mcp`

Если submodule не загружен, инициализируй его:

```bash
git submodule update --init --recursive tools/my-core-mcp
```

Авторизация одна на всю среду:

- локальная Windows-машина: один общий файл `~/.my-core/local-mcp.json` для всех проектов;
- runner/container: один общий набор env-переменных контейнера для всех managed projects.

Не создавай auth-файлы внутри репозитория проекта и не копируй `local-mcp.ts` в `scripts/`.

### Требования

- Использовать только Bun: `bun` / `bunx`
- Использовать CLI только из `tools/my-core-mcp/local-mcp.ts`
- Не добавлять `--config`, `--auth-file`, `MY_CORE_LOCAL_MCP_CONFIG` или другие project-local auth overrides

### Инициализация локально

```bash
bun run tools/my-core-mcp/local-mcp.ts login --server https://app.my-core.ru
```

Команда выведет URL вида:

```text
https://app.my-core.ru/mcp/authorize?code=...
```

Открой URL в браузере, войди обычным аккаунтом на сайте и подтверди код.

После подтверждения CLI сохранит локальный токен в:

```text
~/.my-core/local-mcp.json
```

Файл должен иметь права `0600`. Значение токена нельзя печатать в логи, task comments, artifacts, prompt snapshots, screenshots или CI output.

### Подключение MCP tools к локальному клиенту

Bash:

```bash
eval "$(bun run tools/my-core-mcp/local-mcp.ts env --shell bash)"
```

Windows PowerShell:

```powershell
Invoke-Expression (bun run tools/my-core-mcp/local-mcp.ts env --shell powershell)
```

Печать MCP config:

```bash
bun run tools/my-core-mcp/local-mcp.ts config
```

`config` печатает JSON с MCP servers:

- `database` — задачи, знания, проекты, вехи и связанные DB tools
- `system` — статус System Core и диагностические read tools
- `tools` — разрешённые runtime/dev tools
- `cicd` — разрешённые CI/CD tools

Секрет не встраивается в MCP config. Клиент должен передавать bearer через переменную окружения:

```text
MY_CORE_MCP_TOKEN
```

### Runner/container

В runner/container не выполнять `login` и не создавать `~/.my-core/local-mcp.json`. Использовать только env контейнера:

```text
MY_CORE_BACKEND_URL или MY_CORE_MCP_BASE_URL
MY_CORE_AGENT_ID или MY_CORE_MCP_AGENT_ID
MY_CORE_RUNNER_TOKEN или MCP_API_KEY или MY_CORE_MCP_TOKEN
```

### Повторная авторизация и проверка

```bash
bun run tools/my-core-mcp/local-mcp.ts status
bun run tools/my-core-mcp/local-mcp.ts login --server https://app.my-core.ru
```

### Отзыв доступа

Токен можно отозвать через сайт или API:

```http
DELETE /v1/local-mcp/tokens/:id
```

### Правила безопасности

- Не коммитить `~/.my-core/local-mcp.json`
- Не вставлять токен в `AGENTS.md`, `README`, CI variables dump, логи или screenshots
- Не использовать `/v1/auth/login` для системных операций
- Для локальных MCP tools использовать только device-code flow через `tools/my-core-mcp/local-mcp.ts login`
- Обновлять CLI через submodule commit `tools/my-core-mcp`, а не копировать файл между проектами
