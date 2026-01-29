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

- **SQLite** с LibSQL client (`@libsql/client`)
- **Drizzle ORM** v0.29.3 для type-safe работы с БД
- **Migrations:** 4 миграции в `/drizzle/`
- **Storage:** `file:./data/fitbet.db` с персистентным volume

### Реализованные таблицы (11):
1. **challenges** — челлендж с настройками (длительность, ставка, пороги)
2. **participants** — участники (роль, статус, трек Cut/Bulk)
3. **goals** — цели (целевые метрики weight/waist)
4. **checkins** — чек-ины (вес, талия, 4 фото)
5. **checkin_windows** — 48-часовые окна для сдачи чек-инов
6. **checkin_recommendations** — результаты LLM-анализа прогресса
7. **commitment_templates** — шаблоны обязательств (процессы)
8. **participant_commitments** — выбранные участниками commitments
9. **payments** — статусы оплаты
10. **bankholder_elections** — выборы Bank Holder
11. **bankholder_votes** — голоса участников

## Media Storage

- **Telegram file_id** — для фото используем нативное хранение Telegram
- Метаданные в SQLite

## LLM Integration

**Провайдер:** OpenRouter API (vendor-agnostic LLM router)
**Модель:** `google/gemini-3-flash-preview` (multimodal с vision)

### Используется для:

1. **Валидация целей** — проверка реалистичности по срокам и метрикам
   - Оценка: `realistic` / `too_aggressive` / `too_easy`
   - Формулы безопасности: 0.5-1 кг/неделю для Cut, 0.25-0.5 кг/неделю для Bulk
   - Timeout: 30 секунд

2. **Рекомендации по целям** — персонализированные советы по корректировке
   - Советы по весу и талии на основе BMI/WHtR
   - Мотивирующие рекомендации
   - Timeout: 30 секунд

3. **Анализ чек-инов** (multimodal vision analysis):
   - Визуальная оценка прогресса по 4 фото (анфас, профили, спина)
   - Сравнение со стартовыми фото
   - Оценка композиции тела и видимых изменений
   - Рекомендации по питанию (конкретные и адаптивные)
   - Рекомендации по тренировкам
   - Мотивационные сообщения
   - Предупреждения о здоровье (warning flags)
   - Timeout: 45 секунд
   - Фото передаются в base64 format

**Fallback:** Автоматическое принятие цели при отсутствии API ключа
**Error handling:** Graceful degradation без retry logic (быстрый fail)

## Monitoring & Operations

- **Sentry** (`@sentry/bun`) — мониторинг ошибок в production
- **Cron** — планировщик для автоматизации:
  - Открытие окон чек-инов (каждые 14 дней)
  - Напоминания за 12 часов до закрытия окна
  - Закрытие окон и учёт пропусков
  - Расчёт финалов при завершении челленджей
- **Hourly jobs** — запускаются каждый час для проверки событий

## DevOps

- **Docker** — контейнеризация приложения
- **GitHub Actions** — CI/CD pipeline (typecheck → build → docker)
- **Bun runtime** — основной, с fallback на Node.js (tsx)

## Hosting

Собственный VPS на котором поднят Coolify