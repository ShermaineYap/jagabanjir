# JagaBanjir

Watch the river by your parents' house. JagaBanjir follows the JPS river gauge nearest a home and sends the family a short, checked flood message in Bahasa Melayu, 中文, தமிழ் or English, ready to forward on WhatsApp or read aloud.

Built for the Code for Change hackathon (November 2026).

## Why

Malaysia measures about 1,300 river gauges every 15 minutes, but the reading rarely reaches the person who can act on it: often a son or daughter in another city. Official alerts go to phones inside the flood area. JagaBanjir is for the family member who is somewhere else.

## What it does differently

- **Checks every sensor before trusting it.** On 25 Nov 2026, 20:02, only 651 of 1,306 JPS water-level gauges had a reading recent and plausible enough to act on, and 37 still showed an alarm colour on stale or faulty data. JagaBanjir labels each gauge Live, Late, Stale, Broken or Suspect, and says "can't tell" rather than "normal" when nothing can be trusted.
- **One house, one family, their language.** Fixed, reviewed templates with three things to do at each level. Every number in a message is checked against the JPS reading; a message that fails is not sent.
- **Quiet by design.** A rise is sent at once; a repeat within 12 hours is not; going down, only the all-clear is sent, after an hour. At tidal river mouths, alert and warning within the usual daily high tide are treated as routine. Danger is always sent.
- **Uses the live feed.** The open-data API at `api.data.gov.my/flood-warning` was frozen at 23 Feb 2024 when checked; JagaBanjir reads JPS Public InfoBanjir directly.

## Measured

Backtest of the rules on JPS's own 7-day records, 735 gauges, 18–25 Nov 2026 (`data/study/backtest-20261125.md`):

- 53 gauges reached danger. From first alert to danger: median 1.5 h (35 rises); from warning: 0.9 h.
- Messages per gauge per week: 2.9 if you message every level change, 1.8 with JagaBanjir's rules (−38%). The median gauge sent none; no danger message was held back.
- Our level matched JPS's own label on 617 of 619 live gauges; both differences sit exactly on a threshold line, where we take the cautious side.

## How it works

```
every 15 min  GitHub Actions ──► /api/tick (public, runs at most once per 10 min)
                                   │ fetch JPS live feed (1,306 gauges)
                                   │ store snapshot (Neon Postgres)
                                   │ for each watched house:
                                   │   JPS 7-day record → trust, level, rate, tide check
                                   │   decideNotify → compose → verify numbers
                                   └─► Telegram message to the family
```

| Piece | File |
|---|---|
| JPS feed, 7-day history, thresholds | `src/lib/jps.ts`, `collector/thresholds.py`, `collector/history.py` |
| Trust, levels, rate, tide, when to notify | `src/lib/assess.ts` |
| Messages in 4 languages + number check | `src/lib/messages.ts` |
| Tick and alerts | `src/lib/tick.ts`, `src/app/api/tick/route.ts` |
| Telegram bot | `src/app/api/telegram/route.ts` |
| Pages | `src/app/` (home and setup, `/w/[id]`, `/sensors`, `/replay`, `/about`) |
| Tests (run on the real 25 Nov feed) | `tests/engine.test.ts` |
| Census and backtest | `scripts/census.ts`, `scripts/study.ts`, `data/study/` |

## Run it

```bash
npm install
npm test          # 60 unit tests
npm run dev       # http://localhost:3000, uses in-memory storage
```

Without `DATABASE_URL` the app keeps everything in memory, which is fine for local use.

### Deploy (Vercel)

1. Import this repo into Vercel. `vercel.json` pins the Singapore region.
2. Add Neon Postgres (free plan) from the Vercel Marketplace and connect it to the project; it sets `DATABASE_URL`. The app creates its one table on first use.
3. Optional, for alerts: create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN`. That is all: the bot's username is read from Telegram, and the webhook is registered automatically on the first tick (or open `/api/telegram` once).
4. In GitHub: Settings → Secrets and variables → Actions → Variables, add `SITE_URL` = `https://<your-site>`. The `tick` workflow then refreshes every 15 minutes.

## Rebuild the data

```bash
python3 collector/thresholds.py src/data/thresholds.json        # thresholds from JPS state tables
python3 collector/history.py <live-feed.json> data/hist         # 7-day records, 1 request/second
npx tsx scripts/census.ts <live-feed.json> <ISO time>
npx tsx scripts/study.ts data/hist <live-feed.json>
npx tsx scripts/make-replay.ts <history.json> <live-feed.json> <stationId> <fromISO> <toISO>
```

## Limits

- Not an official warning. Follow NADMA, Bomba, APM and police instructions; in an emergency call 999.
- A gauge measures one river at one spot. Flash floods from drains and local downpours can happen while it reads normal.
- "Time to danger" is a straight line through the last hour; in the backtest it was within ±30% of the real time in 43.5% of 646 predictions (usually early), so it is shown as a rough guide only.
- About 410 gauges have no thresholds in JPS's tables or records; for those the app uses JPS's own label and says so.
- Chinese and Tamil messages need review by more native speakers.
- JPS data is scraped from public pages at a polite rate; if JPS changes its site, the collector needs updating.

## Data and credits

River levels and thresholds: Jabatan Pengairan dan Saliran (JPS), [Public InfoBanjir](https://publicinfobanjir.water.gov.my/). Map and search: © OpenStreetMap contributors, Nominatim. Fonts: Atkinson Hyperlegible (Braille Institute), Barlow Condensed.

## Licence

MIT, see `LICENSE`.
