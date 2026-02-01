# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FitBet is a Telegram-native fitness betting platform where friend groups make financial bets on fitness improvements. Users create challenges with transparent rules (weight/waist metrics + discipline tracking), bi-weekly check-ins with photos, and automated winner calculation.

**Status:** MVP implementation complete. Full-featured bot with LLM-powered goal validation, multimodal check-in analysis, and automated challenge management.

## Tech Stack

- **Runtime:** Bun.sh (with Node.js fallback via tsx)
- **Language:** TypeScript (ES2022 target, strict mode)
- **Bot Framework:** grammY (Telegram bot framework)
  - Session Plugin for state management
  - Conversations Plugin for multi-step dialogs (uses replay engine)
- **Database:** SQLite with Drizzle ORM v0.29.3 (11 tables, 4 migrations)
- **LLM Integration:** OpenRouter API
  - Model: `google/gemini-3-flash-preview` (multimodal vision)
  - Goal validation, recommendations, and check-in analysis
- **Monitoring:** Sentry for error tracking
- **Automation:** Cron scheduler (hourly jobs for check-in windows, reminders, finals)
- **Media Storage:** Telegram file_id (native)
- **DevOps:** Docker, GitHub Actions CI/CD
- **Hosting:** VPS with Coolify

## Development Commands

```bash
bun install          # Install dependencies
bun run dev          # Local development with watch mode
bun run dev:node     # Node.js fallback with tsx
bun run build        # Bundle for production
bun run start        # Run production build
bun run typecheck    # TypeScript type checking
bun test             # Run tests
bun run db:generate  # Generate Drizzle migrations
bun run db:push      # Push schema changes to DB
bun run db:studio    # Open Drizzle Studio
```

## Environment Variables (Testing & Ops)

- `ADMIN_TELEGRAM_ID` — Telegram user ID that can run `/clear_db` in private chat.
  - `/clear_db` полностью очищает БД и пересоздаёт шаблоны commitments (для тестов).
- `CHECKIN_PERIOD_DAYS` — период между чек-инами в днях (по умолчанию 14).
- `CHECKIN_PERIOD_MINUTES` — период между чек-инами в минутах. Если > 0, имеет приоритет над `CHECKIN_PERIOD_DAYS`.
  - При `CHECKIN_PERIOD_MINUTES < 60` scheduler запускается каждую минуту для тестов.
- `CHALLENGE_DURATION_UNIT` — единица длительности челленджа: `months` (default), `days`, `minutes`.
  - Значение `durationMonths` в БД трактуется как количество этих единиц.
  - Для LLM/метрик длительность конвертируется в месяцы (дни/30, минуты/43200).

## Architecture

### Core Entities

- **Challenge** — Competition settings (duration, stake, discipline threshold, skip policy)
- **Participant** — User with role, status, track (Cut/Bulk)
- **Goal** — Target metrics with LLM-validated realism
- **CheckIn** — Bi-weekly submission (weight, waist, 4 photos: front, left, right, back)
- **CheckInWindow** — 48-hour submission windows with automated scheduling
- **CheckInRecommendation** — LLM-generated progress analysis with multimodal vision
- **Commitment** — Process commitments selected by participant (templates + participant_commitments)
- **Payment** — Bank Holder manual verification
- **BankHolderElection** — Democratic voting system for Bank Holder selection
- **BankHolderVote** — Individual votes in Bank Holder election
- **MetricsService** — BMI/WHtR-based goal recommendations calculator

### Key Flows

1. `/create` → Challenge setup in group chat
2. "Join" button → Private onboarding (track, metrics, photos, goal, commitments)
3. Payment marking → Bank Holder confirmation
4. Bi-weekly check-ins → 48-hour windows with reminders
5. Final calculation → Winners by formula (goal achievement + discipline)

## Agent OS Workflow

This project uses Agent OS commands for structured development:

- `/plan-product` — Create/update mission, roadmap, tech-stack docs
- `/shape-spec` — Gather context and create spec folder before implementing features (run in plan mode)
- `/discover-standards` — Find relevant coding standards
- `/inject-standards` — Apply standards to current work

### Spec Folder Structure

When implementing features, create specs in `agent-os/specs/{YYYY-MM-DD-HHMM-feature-slug}/`:
- `plan.md` — Implementation plan
- `shape.md` — Shaping decisions and context
- `standards.md` — Applied standards
- `references.md` — Similar code references
- `visuals/` — Mockups if any

## Product Documentation

- `agent-os/product/mission.md` — Problem, target users, solution
- `agent-os/product/roadmap.md` — MVP and post-launch features
- `agent-os/product/tech-stack.md` — Technology choices and rationale

## Language

Product documentation is in Russian. Code and technical documentation should be in English.
