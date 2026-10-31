# hh-autopilot

Локальный инструмент для поиска работы на hh: собирает вакансии под портрет
кандидата из `resume-site/data/resume.yaml`, считает объяснимую оценку
соответствия, готовит письмо и кладёт отклик в очередь ревью.

**Автоматическая отправка откликов выключена по умолчанию** и включается только
человеком на ограниченное время. Капча — остановка со статусом `needs_human`,
а не обход.

## Запуск

```powershell
pnpm install
Copy-Item .env.example .env   # один раз, локальные настройки
pnpm db:reset                 # схема базы одной командой
pnpm dev                      # http://127.0.0.1:3000
```

`pnpm db:reset` удаляет `data/hh-autopilot.db` и накатывает миграции заново.
База и `.env` в git не попадают.

### Если install падает на скачивании движков Prisma

`ECONNRESET` от `binaries.prisma.sh` при `--tls-max-v1.2` лечится: Node 26 по
умолчанию предлагает TLS 1.3 с гибридным post-quantum ключом, и не каждый край
CDN это принимает. Установка с явным потолком TLS проходит:

```powershell
$env:NODE_OPTIONS='--tls-max-v1.2'
pnpm install
```

Это ограничение машины и канала, а не проекта: в скрипты оно не зашито.

## Проверки

```powershell
pnpm verify   # eslint + prettier + typecheck + tests
pnpm build    # сборка Nitro
```

## Портрет кандидата

Портрет — подмножество `../resume-site/data/resume.yaml`: роль и опыт, навыки,
зарплата, форматы, `hh.portrait` и `hh.keywords`. Источник правды один — файл
резюме; в проекте живут только zod-схема нужных блоков и загрузчик, копии данных
нет. Путь по умолчанию — соседний пакет, `RESUME_PATH` в `.env` перекрывает его.

## Что где

| Что                                     | Путь                                         |
| --------------------------------------- | -------------------------------------------- |
| Схема базы и миграции                   | `prisma/schema.prisma`, `prisma/migrations/` |
| Статусы и union-типы                    | `shared/types/domain.ts`                     |
| Схема портрета из `resume.yaml`         | `shared/schema/portrait.ts`                  |
| Контракт портрета (`CandidatePortrait`) | `shared/types/portrait.ts`                   |
| Разбор YAML в портрет                   | `shared/utils/portrait.ts`                   |
| Загрузка портрета с путём из env        | `server/utils/portrait.ts` (`loadPortrait`)  |
| Клиент Prisma                           | `server/utils/db.ts`                         |
| Проверка связки «сервер → база»         | `server/api/health.get.ts`                   |
| Тесты схемы                             | `tests/db.spec.ts`                           |
| Тесты портрета                          | `tests/portrait.spec.ts`                     |
