# TrueNorth 🧭

**Find your direction. Discover what truly matters.**

TrueNorth is a browser-based tool that helps you discover your core values through simple pairwise comparisons. No sign-ups, no tracking—just you and your choices.

## How It Works

You're presented with two values. Pick the one that resonates more. Repeat.

Behind the scenes, TrueNorth uses a tournament-style algorithm to sort your priorities. The more you play, the more accurate your ranking becomes.

## Features

- **Quick Pick Bonus** ⚡ — Decisions made in under 3 seconds get extra weight. Trust your gut.
- **Transitive Logic** 🤖 — If you pick Adventure > Safety and Safety > Comfort, we already know Adventure > Comfort. No need to ask twice.
- **Conflict Log** 📝 — Hard choices (>10s) are logged so you can reflect on them later.
- **Progress Tracking** 📊 — See your "Self-Knowledge" percentage grow as the algorithm converges.
- **Bottom 3 Highlight** — See what you're deprioritizing, not just what you're chasing.

## Tech

Pure vanilla HTML/CSS/JS. No frameworks, no build step. Just open `index.html` in a browser.

Data is stored in `localStorage`—it never leaves your machine.

## Roadmap

- [ ] **Glicko-Lite Algorithm** — Replace point accumulation with a proper rating system for more consistent results
- [ ] **Manual Reordering** — Drag-and-drop to override the algorithm when it gets it wrong
- [ ] **Export Results** — Save your Top 10 as an image or PDF

## Why "TrueNorth"?

Because knowing your values is like having a compass. When life gets noisy, they point the way.

---

*Built with curiosity by Ben Haslett + Winston 🤖*
