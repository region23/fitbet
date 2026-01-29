# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FitBet is a Telegram-native fitness betting platform where friend groups make financial bets on fitness improvements. Users create challenges with transparent rules (weight/waist metrics + discipline tracking), bi-weekly check-ins with photos, and automated winner calculation.

**Status:** Pre-MVP planning phase. Product documentation exists but no application code has been written yet.

## Tech Stack

- **Runtime:** Bun.sh
- **Language:** TypeScript
- **Bot Framework:** grammY (Telegram bot framework)
  - Session Plugin for state management
  - Conversations Plugin for multi-step dialogs (uses replay engine)
- **Database:** SQLite with Drizzle ORM
- **Media Storage:** Telegram file_id (native)
- **Hosting:** VPS with Coolify

## Expected Commands (once implemented)

```bash
bun install          # Install dependencies
bun run dev          # Local development
bun run build        # Bundle for production
bun test             # Run tests
```

## Architecture

### Core Entities

- **Challenge** — Competition settings (duration, stake, discipline threshold, skip policy)
- **Participant** — User with role, status, track (Cut/Bulk)
- **Goal** — Target metrics with LLM-validated realism
- **CheckIn** — Bi-weekly submission (weight, waist, 4 photos: front, left, right, back)
- **Commitment** — Process commitments selected by participant
- **Payment** — Bank Holder manual verification
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
