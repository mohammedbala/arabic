# Darija Libya — Libyan Arabic training system

A full-stack app for learning **Libyan Arabic** (the default; Modern Standard Arabic is optional).
It has user accounts, a GitHub-style progress profile, and a study system built on memory research,
aimed at conversational fluency in a few weeks.

- **1,662 vocabulary cards** across 36 topics, each with Libyan Arabic script, transliteration,
  English, the MSA equivalent, a Libyan example sentence, and notes (verb conjugations, plurals,
  loanword origins).
- **A 6-week fluency path** (2 weeks to a year, set per user) with 17 grammar lessons, each ending in a retrieval quiz.
- **Fenni the fennec fox 🦊**, a mascot who cheers you on in Libyan Arabic, comforts you after
  mistakes, celebrates streaks and achievements, shares memory tips, and dozes off if you leave
  reviews waiting. Click him for a phrase with audio, or turn him off in settings.
- **Spaced repetition** with the FSRS memory model, learning steps, and recognition → production cards.
- **Accounts and progress tracking:** contribution heatmap, streaks, achievements, activity feed,
  public profiles at `/u/<username>`, follows, and a weekly leaderboard.

## Quick start

```bash
npm install
npm start            # http://localhost:3000
npm test             # unit + API tests
```

Requires Node ≥ 22.13. It uses the built-in `node:sqlite`, so there are no native modules to compile.

| env var          | default         | purpose                                  |
|------------------|-----------------|------------------------------------------|
| `PORT`           | `3000`          | HTTP port                                |
| `DB_FILE`        | `data/app.db`   | SQLite database path                     |
| `SECURE_COOKIES` | unset           | set to `1` when served over HTTPS        |

## How the learning works

| Principle | Implementation |
|---|---|
| Spacing effect / forgetting curve | FSRS-4.5 stability/difficulty model (`server/srs.js`). Reviews are scheduled for a target retention (default 90%, adjustable). |
| Testing effect (active recall) | Every card asks you to recall before revealing. You can type an answer, which is checked with fuzzy matching. New words get a multiple-choice check right after they are introduced. |
| Frequency first (Zipf/Pareto) | Words are ranked by frequency tier. The plan aims to introduce the **1,000 most frequent words by your target date** (≈24/day over 6 weeks). The rest follow at 10/day. |
| Generation effect | Once a word graduates in recognition (Arabic → English), a production card (English → Arabic) unlocks for it. |
| Interleaving | Topics are interleaved round-robin within each frequency tier (`scripts/build-vocab.js`). |
| Dual coding & context | Audio (browser speech synthesis), transliteration, and an example sentence on every card. |
| Short-term consolidation | Learning steps of 1 and 10 minutes. Learning cards return within the same session (20-minute learn-ahead window). |
| Habit formation | A daily XP goal, streaks, a contribution graph, achievements, and a feed of followed learners. |

## Project layout

```
server/
  index.js        entry point
  app.js          Express routes (auth, study, lessons, drills, profiles, social)
  srs.js          FSRS scheduler
  study.js        queues, grading, XP, streaks, stats, achievements
  curriculum.js   6-week path, grammar lessons, daily-quota planner
  auth.js         scrypt password hashing, hashed session tokens, rate limiting
  db.js           SQLite schema
  vocab.js        deck loader
public/           single-page frontend (vanilla JS, no build step)
data/vocab/       source vocabulary (part*.json) + SPEC.md
data/vocab.json   built deck (npm run build:vocab)
test/             node:test suites
```

### Editing the vocabulary

Add or modify entries in `data/vocab/part*.json` following `data/vocab/SPEC.md`, then run
`npm run build:vocab`. The build validates entries, removes duplicates, assigns ranks, and **keeps
word ids stable** so existing users' progress is preserved.

> The vocabulary was written to the spec without a native-speaker review. Some entries are marked
> in their notes as pan-Maghrebi or uncertain. Corrections from Libyan speakers are welcome.

## Security notes

- Passwords are hashed with scrypt. Session tokens are random and only their SHA-256 hash is stored.
  Cookies are httpOnly and `SameSite=Lax`.
- Write requests must be JSON (`415` otherwise), which blocks cross-site form CSRF.
- Login and signup are rate-limited per IP. Changing your password signs out all other sessions.
- Private profiles are hidden from other users and from the leaderboard.
