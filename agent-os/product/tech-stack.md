# Tech Stack

## Runtime

- **Bun.sh** — JavaScript runtime, bundler, package manager
- **TypeScript** — статическая типизация

## Telegram Bot Framework

**Рекомендация: [grammY](https://grammy.dev/)**

grammY — современный TypeScript-first фреймворк для Telegram ботов с отличной поддержкой FSM через плагины.

### Почему grammY:
- Нативная поддержка TypeScript с отличной типизацией
- Активно поддерживается (в отличие от Telegraf, который исторически имел проблемы с типами)
- Работает с Bun без дополнительной настройки

### Ключевые плагины:

1. **[Conversations Plugin](https://grammy.dev/plugins/conversations)** — для многошаговых диалогов
   - Использует replay engine вместо традиционного FSM
   - Код выглядит как последовательный, но работает через replay
   - Поддержка параллельных conversations в одном чате
   - Таймауты для предотвращения зависших состояний

2. **[Session Plugin](https://grammy.dev/plugins/session)** — для хранения состояния
   - Данные per-chat или per-user
   - Lazy sessions для оптимизации
   - Множество storage adapters

### Альтернативы (рассмотрены):
- **Telegraf** — популярен, но исторически слабая типизация
- **GramIO** — новый, работает с Bun, но менее зрелый

## Database

- **SQLite** — встроенная база данных
- **Drizzle ORM** (рекомендация) или **better-sqlite3** для работы с SQLite в Bun

### Структура данных (концептуально):
- `Challenge` — челлендж с настройками
- `Participant` — участник (роль, статус, трек)
- `Goal` — цель (тип, целевые метрики)
- `Checkin` — чек-ин (дата, метрики, медиа)
- `Commitment` — выбранные обязательства
- `Payment` — статус оплаты

## Media Storage

- **Telegram file_id** — для фото используем нативное хранение Telegram
- Метаданные в SQLite

## LLM Integration

- Для валидации целей (реалистичность по срокам)
- Для нормализации текстовых целей в метрики

## Hosting

Собственный VPS на котором поднят Coolify