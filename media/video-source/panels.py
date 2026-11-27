import asyncio
from playwright.async_api import async_playwright
F = "file:///home/claude/jagabanjir/node_modules/@fontsource"
CSS = f"""
@font-face{{font-family:A;src:url({F}/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2)}}
@font-face{{font-family:A;font-weight:700;src:url({F}/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2)}}
@font-face{{font-family:G;font-weight:700;src:url({F}/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2)}}
@font-face{{font-family:G;font-weight:500;src:url({F}/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2)}}
*{{box-sizing:border-box;margin:0}}
body{{width:1920px;height:1080px;background:#eef2f0;color:#14233a;font-family:A,sans-serif;position:relative;overflow:hidden}}
.phone{{position:absolute;left:190px;top:56px;width:458px;height:968px;border-radius:44px;background:#14233a;box-shadow:0 18px 40px rgba(20,35,58,.25)}}
.right{{position:absolute;left:760px;top:140px;width:1000px;height:860px;display:flex;flex-direction:column;justify-content:center}}
.brand{{position:absolute;left:760px;top:64px;font-family:G;font-weight:700;font-size:40px;display:flex;gap:14px;align-items:center}}
.k{{font-size:30px;color:#4a5a6e;margin-bottom:22px}}
.big{{font-family:G;font-weight:700;font-size:96px;line-height:1;margin-bottom:28px}}
.mid{{font-size:42px;line-height:1.3;margin-bottom:24px;max-width:900px}}
.src{{font-size:24px;color:#4a5a6e;margin-top:18px}}
ol{{padding-left:0;list-style:none}} li{{display:flex;gap:28px;align-items:baseline;font-size:44px;line-height:1.25;margin-bottom:34px}}
li b{{font-family:G;font-size:72px;color:#2f6f8f;min-width:44px}}
.bar{{width:10px;align-self:stretch;border-radius:5px}}
.row{{display:flex;gap:30px;margin-bottom:30px}}
.full{{position:absolute;inset:0;padding:110px 160px;display:flex;flex-direction:column;justify-content:center}}
.stat{{display:grid;grid-template-columns:420px 1fr;gap:10px 40px;align-items:baseline;margin-bottom:34px}}
.stat .n{{font-family:G;font-weight:700;font-size:110px;line-height:.95;color:#14233a}}
.stat .t{{font-size:38px;line-height:1.3}}
"""
LOGO = '<svg width="30" height="44" viewBox="0 0 18 26"><rect x="1" y="1" width="16" height="24" fill="#fff" stroke="#14233a" stroke-width="1.5"/><rect x="1" y="4" width="10" height="3" fill="#14233a"/><rect x="1" y="10" width="6" height="3" fill="#14233a"/><rect x="1" y="16" width="10" height="3" fill="#c8312b"/><rect x="1.75" y="18" width="14.5" height="6.25" fill="#2f6f8f" opacity=".8"/></svg>'
BR = f'<div class="brand">{LOGO}JagaBanjir</div>'
P = {
 "0": BR + """<div class="right"><div class="k">18 November 2026 &mdash; Selangor, Perak, Melaka, Negeri Sembilan, Penang</div>
   <div class="big">2,553 people</div><div class="mid">slept in flood relief centres.</div>
   <div class="mid" style="color:#4a5a6e">For some families, the warning is a forwarded WhatsApp message, after the water is at the door.</div>
   <div class="src">Source: JKM InfoBencana, via New Straits Times, 18 Nov 2026</div></div>""",
 "1": BR + """<div class="right">
   <div class="row"><div class="bar" style="background:#c8312b"></div><div><div class="big" style="font-size:72px;margin-bottom:8px">23 Feb 2024</div><div class="mid">Last reading on the government open-data flood API.</div></div></div>
   <div class="row"><div class="bar" style="background:#2f6f8f"></div><div><div class="big" style="font-size:72px;margin-bottom:8px">About half</div><div class="mid">of 1,306 live JPS river gauges send readings you can trust.</div></div></div>
   <div class="row"><div class="bar" style="background:#e2701b"></div><div><div class="big" style="font-size:72px;margin-bottom:8px">Dozens</div><div class="mid">show an alarm on stale, faulty or zero-threshold data.</div></div></div>
   <div class="src">Measured by JagaBanjir on the live JPS Public InfoBanjir feed, 25&ndash;27 Nov 2026</div></div>""",
 "2": BR + """<div class="right"><ol>
   <li><b>1</b><span>Find the house</span></li>
   <li><b>2</b><span>Choose the river gauges, each labelled Live, Late, Stale, Broken or Suspect</span></li>
   <li><b>3</b><span>Name it, and pick their language</span></li></ol></div>""",
 "3": BR + """<div class="right"><div class="big" style="font-size:84px">One message.<br>Their language.</div>
   <div class="mid">Bahasa Melayu, 中文, தமிழ் or English, with three things to do.</div>
   <div class="mid">Every number is checked against the JPS reading before it is sent.</div>
   <div class="mid" style="color:#4a5a6e">Forward on WhatsApp, get it on Telegram, or read it aloud.</div></div>""",
 "4": BR + """<div class="right"><div class="k">Real JPS readings &mdash; Sg. Langat at Bukit Changgang, Kuala Langat, 23&ndash;25 Nov 2026</div>
   <div class="big">8 h 15 min</div><div class="mid">between the evening alert and the river reaching danger level.</div>
   <div class="big" style="font-size:72px;margin-top:20px">5 messages</div><div class="mid">in 50 hours. No repeats once at danger.</div></div>""",
 "5": """<div class="full"><div class="k" style="font-size:34px">Backtest of JagaBanjir&rsquo;s rules on JPS&rsquo;s own 7-day records, 735 gauges, 18&ndash;25 Nov 2026</div>
   <div style="height:30px"></div>
   <div class="stat"><div class="n">1.5 h</div><div class="t">median from first alert to danger level (35 rises). Minutes matter.</div></div>
   <div class="stat"><div class="n">&minus;38%</div><div class="t">messages: 2.9 &rarr; 1.8 per gauge per week. The median gauge sent none.</div></div>
   <div class="stat"><div class="n">0</div><div class="t">danger warnings held back.</div></div>
   <div class="stat"><div class="n">605/607</div><div class="t">live gauges where our level matches JPS&rsquo;s own label.</div></div></div>""",
 "6": """<div class="full" style="align-items:flex-start"><div style="display:flex;gap:28px;align-items:center;font-family:G;font-weight:700;font-size:130px">""" + LOGO.replace('width="30" height="44"','width="84" height="122"') + """JagaBanjir</div>
   <div class="mid" style="font-size:48px;margin-top:26px">Watch the river by your parents&rsquo; house.</div>
   <div class="big" style="font-size:80px;color:#2f6f8f;margin-top:30px">jagabanjir.vercel.app</div>
   <div class="mid" style="color:#4a5a6e;margin-top:40px">Not an official warning. In an emergency, call 999 and follow Bomba, APM and police.</div>
   <div class="src" style="font-size:28px">Built by Shermaine Yap for Code for Change 2026. River data: JPS Public InfoBanjir.</div></div>""",
}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1920,"height":1080})
        for k, html in P.items():
            phone = '<div class="phone"></div>' if k in "01234" else ""
            path = f"/home/claude/video/panels/{k}.html"
            open(path, "w").write(f"<html><head><meta charset=utf-8><style>{CSS}</style></head><body>{phone}{html}</body></html>")
            await pg.goto("file://" + path)
            await pg.evaluate("document.fonts.ready")
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=f"/home/claude/video/panels/{k}.png")
        await b.close()
asyncio.run(main())
