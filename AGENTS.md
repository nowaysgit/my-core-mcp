# AGENTS.md

## Runtime и команды

- Использовать Bun как runtime, package manager и script runner: `bun`, `bun run` и `bunx`; не использовать npm, yarn или pnpm.
- Проверять CLI командой `bun run check`.
- Не выводить значения токенов и других секретов в логи, комментарии, артефакты, снимки prompt, скриншоты или CI output.

## Общий Tracker workflow

- Для нетривиальной работы использовать очередь `OPERACIONKA`. Контекст выбирать по каноническому Git root/remote; ZAVOD не является автоматическим вторичным проектом. Подтвержденные проекты: [ZAVOD](https://tracker.yandex.ru/pages/projects/5), [OnlyPost](https://tracker.yandex.ru/pages/projects/7), [KOLOKOL](https://tracker.yandex.ru/pages/projects/6), [Razobrano](https://tracker.yandex.ru/pages/projects/8), [nozhnitsy](https://tracker.yandex.ru/pages/projects/12), [hatimaki-cloud](https://tracker.yandex.ru/pages/projects/13).
- Перед `issue_create` обязателен `user_get_current`; запрос содержит явный числовой type из каталога OPERACIONKA (`5/refactoring`, `4/improvement`, `9/incident`, `11/release`, `10/serviceRequest`, `15/changes`, `1/bug`, `16/documents`, `19/applicant`), нативный `fields.project.primary`, `assignee = String(uid)` и proxy-only `zavod_repo_root` с точным абсолютным Git top-level. Proxy проверяет root/origin и удаляет служебное поле upstream; через `issue_get` до реализации подтвердить exact type/project и текущего пользователя в `created_by`/начальном `assignee`.
- Полный набор статусов: `backlog`, `inProgress`, `testing`, `rc`, `closed`, `onHold`, `blockedGoal`, `cancelled`. Переход разрешён из любого статуса в любой доступный; цифры workflow — рекомендуемый порядок, не transition id. Перед переходом вызвать `issue_get_transitions`, выбрать по `to.key` и проверить через `issue_get`. Резолюций у типов нет: закрывать переходом в `closed` без fields, не через `issue_close`.
- Фактическое время от заранее записанного старта округлить вверх до минуты, добавить через `issue_add_worklog` и повторить в итоговом комментарии и ответе.

## Локальный credential vault агента

- Для общих и project-specific credentials использовать глобальный skill `credential-vault`; Git хранит только refs, policies и фиксированные consumer profiles, а значения — нативный secret store текущего пользователя ОС.
- Политики возможностей: `agent-readable` разрешает raw `read`, `put --stdin`, remove и fixed `run`; `agent-managed` — put/remove/run без raw read; `agent-usable` — только masked configure/status и fixed run; `manual-only` — только masked configure/status без agent-run использования.
- Значение из чата, Tracker, лога, shell argument или tracked-файла считать раскрытым: не повторять и не переносить в vault, а потребовать ротацию. Добавлять новое значение через masked prompt либо через `put --ref <ref> --stdin` из доверенного защищенного локального источника; значение никогда не передавать аргументом.
- Перед операцией выполнять `doctor` и `status`. Raw `read` допустим только для явно `agent-readable` и осознанно выводит значение на границу tool/model; когда агенту не нужно видеть значение, использовать fixed `run --profile <id>`.
- Runnable profile запускать только из корня чистого репозитория на объявленной ветке при совпадении `HEAD` с `origin/<branch>`; каталог фиксирует exact command, remote и env-to-ref mapping. Запрещены dump/bulk export, arbitrary-command passthrough и вывод окружения со значениями.
- Repo-local manifest не может расширить shared/production policy или доступ другого проекта. Production-код, Docker, CI и deployed services не зависят от `$CODEX_HOME`; для них используются secrets целевой платформы.

## Тестовая отправка почты через Яндекс 360

- Любая проверка реальной доставки email использует корпоративную Яндекс 360 Почту: SMTP `smtp.yandex.ru`, порт `465`, `secure=true` (implicit TLS), логин и адрес отправителя `support@onlypost.ru`. Отображаемое имя отправителя остаётся продуктовым.
- Для SMTP использовать только пароль приложения Яндекс Почты. Обычный пароль аккаунта, сторонние SMTP-провайдеры и другие токены не использовать.
- Для новых установок пароль приложения объявлен как `av://shared/development/yandex360-mail/app-password`; передавать его можно только будущим reviewed fixed profile credential-vault. Пока real smoke runner отсутствует, не отображать значение вручную в process env. Существующие `$CODEX_HOME/mcp/yandex-*.json` остаются managed shards; значение не сохранять в `.env`, `.env.example`, tracked fixtures, командах, CI logs, task comments или ответах.
- Реальный smoke является opt-in и отправляет письмо только с `support@onlypost.ru` на этот же адрес. Произвольные получатели, массовая отправка и запуск такого smoke в обычном unit/CI-контуре запрещены.
- Unit/integration тесты по умолчанию используют fake/console/file outbox и не обращаются во внешнюю сеть.
