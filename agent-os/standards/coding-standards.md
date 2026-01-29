# Coding Standards

## Project Structure

```
src/
├── handlers/          # Command & callback handlers
│   ├── commands/      # Telegram command handlers (/start, /create, etc.)
│   └── callbacks/     # Inline button callback handlers
├── conversations/     # Multi-step grammY conversations (replay engine)
├── services/          # Business logic layer (13 services)
├── db/
│   ├── schema/        # Drizzle ORM models (11 tables)
│   └── index.ts       # Database client initialization
├── scheduler/         # Cron jobs (hourly execution)
├── types/             # TypeScript type definitions
├── config.ts          # Environment configuration
├── bot.ts             # Bot initialization and middleware
└── index.ts           # Application entry point
```

## Naming Conventions

- **Services**: `{entity}.service.ts` (lowercase with hyphens)
  - Example: `participant.service.ts`, `checkin.service.ts`
- **Handlers**: `{command}.ts` in `handlers/commands/`
  - Example: `start.ts`, `create.ts`
- **Conversations**: `{flow}.ts` (kebab-case)
  - Example: `challenge-setup.ts`, `onboarding.ts`, `checkin.ts`
- **Database schemas**: `{entity}.ts` in `db/schema/` (plural form preferred)
  - Example: `challenges.ts`, `participants.ts`
- **Types**: PascalCase for interfaces and types
  - Example: `BotContext`, `GoalValidationParams`

## TypeScript

- **Strict mode enabled**, Target: ES2022
- **Explicit return types** for all exported functions
- **Type definitions** in `/src/types/` for shared types
- **No implicit any** — all parameters and variables must be typed
- Prefer `interface` over `type` for object shapes
- Use `readonly` for immutable data structures where applicable

## grammY Patterns

### Conversations Plugin
- Use **Conversations Plugin** for multi-step dialogs (not FSM)
- Conversations use **replay engine** — code looks sequential but replays on each update
- Structure: `await ctx.reply()` → `await conversation.wait()` → process input
- **Session structure** defined in `/src/types/session.ts`
- Each conversation is a function: `async (conversation: MyConversation, ctx: MyContext) => {}`

### Context Type
- **BotContext** extends grammY's `Context`
- Includes session data and conversations plugin
- Always type handlers as `(ctx: BotContext) => Promise<void>`

### Error Handling
- Middleware in `bot.ts` catches all errors
- Errors logged to Sentry in production
- User-facing errors sent as messages, not thrown

## Database (Drizzle ORM)

### Schema Definition
- One table per file in `db/schema/`
- Export both schema and TypeScript type
  ```typescript
  export const challenges = sqliteTable("challenges", { ... });
  export type Challenge = typeof challenges.$inferSelect;
  export type NewChallenge = typeof challenges.$inferInsert;
  ```
- Re-export all schemas from `db/schema/index.ts`

### Migrations
- Generate: `bun run db:generate`
- Push to DB: `bun run db:push`
- **Never modify migration files manually**
- Store migrations in `/drizzle/` directory

### Queries
- Use Drizzle query builder for type safety
- Prefer `.select()` with explicit field lists over `.*`
- Use transactions for multi-table operations
- Handle database errors gracefully (try/catch with fallback)

## LLM Integration

### Timeouts
- Goal validation: **30 seconds**
- Goal recommendations: **30 seconds**
- Check-in analysis (vision): **45 seconds**

### Error Handling
- **No retry logic** — fail fast
- **Graceful degradation** when API unavailable
- Auto-approval fallback for goal validation
- Log errors but don't expose API details to users

### Multimodal (Vision)
- Photos sent as **base64-encoded** image URLs
- Format: `data:image/jpeg;base64,{base64String}`
- Detail level: `"low"` for cost optimization
- Maximum 8 images per request (4 current + 4 start photos)

### Response Parsing
- Structured prompts with **explicit format markers**
  - Example: `РЕЗУЛЬТАТ: [realistic|too_aggressive|too_easy]`
- Regex-based parsing with fallback defaults
- Never assume LLM response structure — always validate

## Services Layer

### Service Pattern
- Pure business logic, no direct bot context access
- Accept typed parameters, return typed results
- Example signature:
  ```typescript
  export const participantService = {
    async createParticipant(params: CreateParticipantParams): Promise<Participant> { ... }
  }
  ```

### Dependency Injection
- Services import `db` from `db/index`
- No circular dependencies between services
- Keep services focused on single entity/domain

## Error Handling & Logging

### Production Errors
- **Sentry** integration for uncaught errors
- Middleware catches and logs all bot errors
- User receives friendly error message, not stack trace

### Console Logging
- Development: verbose logging with `console.log`
- Production: errors only via Sentry
- No sensitive data (API keys, user PII) in logs

## Scheduler (Cron)

### Job Structure
- Hourly execution: `0 * * * *`
- Jobs defined in `/src/scheduler/`
- Each job is an async function
- Jobs handle their own error catching (don't crash the scheduler)

### Job Types
1. **Check-in window management** — open, remind, close windows
2. **Final calculation** — trigger when challenge ends
3. **Cleanup tasks** — remove stale sessions, etc.

## Code Style

### General Principles
- **Keep it simple** — avoid over-engineering
- **YAGNI** — don't add features you don't need yet
- **DRY** — but prefer duplication over wrong abstraction
- Use **async/await** over promises (`.then()`)
- Prefer **early returns** over nested conditionals

### Comments
- Code should be self-documenting
- Add comments only for:
  - Complex business logic
  - Non-obvious workarounds
  - Important architectural decisions
- Use JSDoc for exported functions with complex parameters

### Formatting
- 2 spaces for indentation
- Single quotes for strings (except when escaping needed)
- Trailing commas in multi-line objects/arrays
- Max line length: ~100 characters (soft limit)

## Testing

**Status:** Not yet implemented
**Future:** Plan to add unit tests for services, integration tests for conversations

---

**Last updated:** 2026-01-30
**Version:** MVP v0.1
