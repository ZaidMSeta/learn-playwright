
# McMaster Room Schedule Scraper

A TypeScript + Playwright scraper that exports McMaster timetable schedule data and normalizes it into a structured dataset (building → room → schedule). Built to support a “find an empty room” / room-availability tool and to enable quick searching + analytics over room usage.

> **Note:** This project is intended for personal/educational use.

---

## What it does

- Logs into the timetable system (authenticated Playwright session)
- Iterates over a course list for a chosen term
- Downloads raw schedule payloads (e.g., per-course/section data)
- Parses and normalizes:
  - course + section identifiers
  - meeting days/times
  - location fields (building + room)
- Writes outputs in a machine-friendly format for downstream use (search, APIs, etc.)

---

## Tech stack

- **Node.js + TypeScript**
- **Playwright** (test runner + browser automation)
- XML/HTML parsing utilities (project-specific)
- A small test suite for key parsing/validation logic

Repository layout:
- `src/scrape/` – scraper + parsing + IO modules
- `tests/` – Playwright tests / validation tests

---

## Setup

### 1) Install dependencies
```bash
npm install
npx playwright install
```

### 2) Create an authenticated session (storage state)

This scraper uses Playwright **storage state** so you don’t log in every run.

Typical options:
- Run a dedicated login/auth test that saves `auth.storage.json`
- Or run Playwright codegen, log in once, then export storage state

Make sure you end up with a file like:
- `auth.storage.json`

> Never commit `auth.storage.json` if it contains sensitive cookies/tokens.

---

## Running the scraper

The scraper is implemented as Playwright tests (common for authenticated scraping + retries + timeouts).

Run:
```bash
npx playwright test
```

### Configuration knobs (common)

Inside the scraper test/config you’ll typically set:
- **TERM_ID** (e.g., Winter 2026)
- campus / session filters (if applicable)
- delay / pacing (to be gentle)
- output directory (e.g., `out/`)

---

## Output

This project is designed around a normalized hierarchy:

```text
buildings
  └── rooms
        └── schedules (meetings/time blocks + course metadata)
```

Typical output folders you may see:
- `out/xml/<TERM_ID>/...` (raw exports)
- `out/<normalized format>/...` (cleaned, structured data)
- run logs / summaries

---

## Safety / rate limiting

To reduce load and avoid flaky runs:
- adds small delays between requests
- retries around transient failures
- writes incremental outputs so partial runs still produce usable data

---

## Testing

Run tests:
```bash
npx playwright test
```

---

## Roadmap ideas

- Incremental updates (diff-based runs so you don’t re-scrape everything)
- Formal schema + versioned exports
- Faster search indexing (SQLite/FTS / Postgres / Meilisearch)
- Room availability API + small frontend

---

## Disclaimer

This tool automates browsing and data extraction. Use responsibly:
- respect access controls
- avoid scraping private data
- throttle requests
- do not share credentials

