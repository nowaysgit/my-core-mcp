# AGENTS.md

## Runtime и команды

- Использовать Bun как runtime, package manager и script runner: `bun`, `bun run` и `bunx`; не использовать npm, yarn или pnpm.
- Проверять CLI командой `bun run check`.
- Не выводить значения токенов и других секретов в логи, комментарии, артефакты, снимки prompt, скриншоты или CI output.

## Локальный credential vault агента

- Для общих и project-specific credentials агента использовать глобальный skill `credential-vault` и установленную runtime-копию в `$CODEX_HOME/skills/credential-vault`. В Git хранится только каталог ссылок, scopes, policies, env mappings и фиксированных consumer profiles; значения хранятся в нативном secret store текущего пользователя ОС.
- Канонические ссылки: `av://shared/<environment>/<service>/<credential>` для общей логической зависимости и `av://project/<repo>/<environment>/<service>/<credential>` для одного проекта. `shared` не означает один общий файл или автоматический доступ: каждый допущенный сотрудник устанавливает собственное значение локально.
- Любой секрет, присланный в чат, Tracker, лог, shell argument или tracked-файл, считать раскрытым: не повторять, не переносить из этого источника в vault и потребовать отзыв/ротацию. Новое значение принимать только через локальный masked prompt `credential-vault`.
- Агент сначала выполняет `doctor` и `status --profile <id>`, недостающее значение добавляет через `configure`/`put`, а использует только через `run --profile <id>`. Запрещены raw `get`, `dump`, `export`, вывод env со значениями и запуск произвольной команды с credentials.
- Runnable profile запускать только из корня чистого репозитория на объявленной ветке, когда `HEAD` совпадает с `origin/<branch>` без divergence; проверка remote/branch/worktree проходит до чтения credential. Сначала закоммитить и опубликовать reviewed consumer-код, затем запускать профиль.
- `manual-only` и break-glass credentials (root, общий admin, recovery, sudo password, root-ключи object storage) не передавать agent-run процессам. Для регулярной работы создавать персональный SSH-ключ, непривилегированного пользователя или узкий service token; production profiles добавлять только в доверенный каталог Zavod.
- Repo-local manifest не может самостоятельно расширять `shared`, `production`, `manual-only` или доступ другого проекта. Такое изменение сначала проходит через общий каталог Zavod и security review.
- Production-код, Docker, CI и deployed services не зависят от `$CODEX_HOME` или credential-vault агента: для них используются secrets конкретной платформы. Существующие `$CODEX_HOME/mcp/yandex-*.json` остаются узкими managed shards до миграции их consumers и не являются общим vault.

## Тестовая отправка почты через Яндекс 360

- Любая проверка реальной доставки email использует корпоративную Яндекс 360 Почту: SMTP `smtp.yandex.ru`, порт `465`, `secure=true` (implicit TLS), логин и адрес отправителя `support@onlypost.ru`. Отображаемое имя отправителя остаётся продуктовым.
- Для SMTP использовать только пароль приложения Яндекс Почты. Обычный пароль аккаунта, сторонние SMTP-провайдеры и другие токены не использовать.
- Для новых установок пароль приложения объявлен как `av://shared/development/yandex360-mail/app-password`; передавать его можно только будущим reviewed fixed profile credential-vault. Пока real smoke runner отсутствует, не отображать значение вручную в process env. Существующие `$CODEX_HOME/mcp/yandex-*.json` остаются managed shards; значение не сохранять в `.env`, `.env.example`, tracked fixtures, командах, CI logs, task comments или ответах.
- Реальный smoke является opt-in и отправляет письмо только с `support@onlypost.ru` на этот же адрес. Произвольные получатели, массовая отправка и запуск такого smoke в обычном unit/CI-контуре запрещены.
- Unit/integration тесты по умолчанию используют fake/console/file outbox и не обращаются во внешнюю сеть.
