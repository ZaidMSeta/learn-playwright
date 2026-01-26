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
