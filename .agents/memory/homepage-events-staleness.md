---
name: Homepage event content goes stale
description: The hero events carousel on the homepage is hardcoded with fixed dates and must be refreshed manually as events pass
---

**Rule:** The homepage hero carousel (`FESTIVAL_EVENTS` in the home page) hardcodes named events with fixed date strings — these go stale and must be pruned/replaced periodically. By contrast, the events listing page pulls from an evergreen recurring-events dataset that self-filters upcoming dates and needs no maintenance.

**Why:** July 2026: five of six carousel entries (World Cup, Glastonbury, Wimbledon, Afronation, Tomorrowland) had already ended, plus a whole hardcoded World Cup campaign section sat on the homepage after the tournament finished. The user had to explicitly ask for cleanup.

**How to apply:** During any homepage or seasonal review, check the carousel entries' dates against the current date. Use only reliably-dated events (month-level precision is fine, e.g. "October 2026"); prefer recurring annual events (Oktoberfest, Notting Hill Carnival, Canton Fair, Art Basel Miami, Dubai Shopping Festival, F1 races). Seasonal campaign sections (like the removed World Cup one) should get an end-date note or be built with a date-gated render.
