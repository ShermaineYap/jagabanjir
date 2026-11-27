# JagaBanjir — watch the river by your parents' house

**Tagline (under 200 characters):** Pick your family's house. JagaBanjir checks the nearest JPS river gauge every 15 minutes and sends a plain flood message in their language: Malay, Chinese, Tamil or English.

## Inspiration

In the week I built this, more than 2,500 people in Selangor, Perak, Melaka and Negeri Sembilan were sleeping in flood relief centres. Behind many of them is a son or daughter in KL, Penang or overseas who found out from a forwarded WhatsApp message, after the water was already at the porch.

Malaysia measures its rivers well: about 1,300 JPS water-level gauges report every 15 minutes. Official alerts go to phones inside the flood area. The family member who is *not* there, and who often makes the decisions for elderly parents, gets nothing in time.

## What it does

1. **Find the house.** Search a town, taman or kampung, or tap the map.
2. **Choose the river gauges.** JagaBanjir lists the nearest JPS gauges, each with a trust label: Live, Late, Stale, Broken or Suspect.
3. **Name it and pick their language.** "Rumah Mak", "Ah Ma's house". Bahasa Melayu, 中文, தமிழ் or English.

You then get a page that always shows the river's level against its alert, warning and danger lines, and a message ready to forward on WhatsApp, read aloud, or receive on Telegram when the level changes.

Every message carries three things to do at that level, and the line "This is not an official warning."

## Impact

- **Who it helps:** adult children looking after elderly parents in flood-prone areas from somewhere else, and the parents, who get the message in their own language.
- **Why it matters now:** this month's floods displaced thousands in Selangor and Perak. In 2025, floods cost Malaysia RM636.9 million, RM183.8 million of it in homes (DOSM).
- **Time to act:** in my backtest of JPS's own 7-day records, rivers went from first alert to danger in a median of 1.5 hours. A message that reaches the right person in the first 15 minutes matters.
- **Replay:** on Sg. Langat at Bukit Changgang (Kuala Langat, Selangor), JagaBanjir's rules would have sent the evening alert 8 hours 15 minutes before the river reached danger level, five messages in total over 50 hours.

## Originality

- **It checks the sensors before it speaks.** On 25 Nov 2026 at 20:02, only 651 of 1,306 JPS water-level gauges (50%) had a reading recent and plausible enough to act on. 37 gauges still showed an alarm colour on the official map while their data was stale or faulty. JagaBanjir says "can't tell" instead of "normal" when nothing can be trusted.
- **It found that the open-data API is frozen.** All 561 water-level stations on `api.data.gov.my/flood-warning` had a last reading of 23 Feb 2024. Any app built on it shows 21-month-old levels. JagaBanjir reads the live JPS Public InfoBanjir feed instead.
- **It knows tides from floods.** Some river mouths in Sarawak cross the alert line twice a day with the tide. JagaBanjir recognises that pattern and treats alert and warning at normal high-tide height as routine. Danger is always sent.
- **One house, one family, their language,** instead of another district-level dashboard.

## Technical execution

- **Data:** the live JPS map feed (1,306 gauges), thresholds from the 16 JPS state tables and each gauge's own record (894 gauges), and JPS's 7-day record per gauge (5-minute readings, used for the rate of rise, the jump check and the tide check).
- **Trust check per gauge:** under 75 minutes old = Live; under 6 hours = Late; older = Stale; no reading or JPS "Error" = Broken; exactly 0 m, more than 5 m below its alert level, or a 2 m jump between readings = Suspect.
- **Level:** our own reading against published thresholds; it matched JPS's label on 617 of 619 live gauges (the one difference is a reading exactly on the line, where we take the cautious side).
- **When to message:** a rise is sent at once, unless that level or higher was already sent in the last 12 hours; going down, only the all-clear is sent, after an hour; at tidal gauges, alert and warning within the usual daily high are routine; danger is always sent.
- **Message check:** fixed templates in four languages. Before sending, every number in the message must match the JPS reading, or the message is not sent.
- **Stack:** Next.js and TypeScript on Vercel (Singapore), Neon Postgres, Telegram Bot API, GitHub Actions every 15 minutes, Leaflet and OpenStreetMap. 60 unit tests run against the real 25 Nov feed.

### Measured results (backtest on JPS 7-day records, 735 gauges, 18–25 Nov 2026)

| Measure | Result |
|---|---|
| Gauges that reached danger | 53 of 735 |
| First alert → danger (median, 35 rises) | 1.5 h (middle half: 0.8–2.0 h) |
| First warning → danger (median, 34 rises) | 0.9 h (0.5–1.5 h) |
| Messages per gauge per week, every level change | 2.9 |
| Messages per gauge per week, JagaBanjir rules | 1.8 (−38%); median gauge: 0 |
| Danger messages held back | 0 |
| "Time to danger" within ±30% of reality | 43.5% of 646 predictions (usually early) |

## Usability

- No account. Three steps, about a minute.
- Atkinson Hyperlegible, a typeface designed for low-vision readers, at large sizes; colour is never the only signal (every level is also a word); keyboard and screen-reader labels throughout.
- "Read aloud" uses the phone's own voice in the chosen language, for parents who prefer listening.
- The gauge picture is the same striped board JPS paints on bridge piers, so it reads at a glance.

## Challenges

- The obvious data source, the government open-data API, turned out to be frozen. Finding the live feed and decoding its short field names took the first evening.
- JPS's alert and warning field names are swapped in the open-data API; I checked every threshold against the JPS tables.
- My first anti-spam rule cut messages by only 3%, because tidal gauges in Sarawak cross the alert line twice a day. The tide signature rule came from looking at those gauges one by one.

## What I learned

Half the work of a safety tool is deciding when *not* to say something: when a sensor can't be trusted, when a rise is just the tide, when a message would be the tenth of the day.

## Honest limits

- Not an official warning; it complements NADMA and MCMC alerts.
- A gauge measures one river at one spot. Flash floods from drains and local rain can happen while it reads normal.
- "Time to danger" is a straight line through the last hour; it is a rough guide, not a forecast (see measured results).
- About 410 gauges have no thresholds in JPS's tables or records; for those the app shows JPS's own label and says so.
- Chinese and Tamil messages need review by more native speakers.

## What's next

- WhatsApp delivery through the WhatsApp Business API.
- Relief-centre (PPS) status next to the gauge, from JKM InfoBencana.
- Share the sensor check with JPS: which gauges are silent, by state.

## Built with

nextjs, typescript, react, vercel, neon, postgresql, telegram, leaflet, openstreetmap, python, vitest, github-actions

## Links

- Live: __SITE_URL__
- Code: https://github.com/ShermaineYap/jagabanjir
- Video: __VIDEO_URL__

## Sources

- Evacuee numbers: New Straits Times, 18 Nov 2026; The Vibes, 18 Nov 2026 (JKM InfoBencana).
- Flood losses: DOSM, Special Report on Impact of Floods in Malaysia 2025 (15 Apr 2026).
- River data: JPS Public InfoBanjir. Open-data API checked at api.data.gov.my/flood-warning on 25 Nov 2026.
