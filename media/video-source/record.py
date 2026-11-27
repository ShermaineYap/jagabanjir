"""Record each phone segment from the live site. Usage: python3 record.py <base_url> <segment...>"""
import asyncio, json, sys, shutil, glob, os
from playwright.async_api import async_playwright
B = sys.argv[1]
D = json.load(open("/home/claude/video/durations.json"))
W, H = 390, 844

async def seg_home(pg, dur):
    await pg.goto(B + "/", wait_until="networkidle"); await pg.wait_for_timeout(800)
    await pg.mouse.wheel(0, 0)
    await smooth(pg, 0, 260, dur * 1000 - 1500)

async def seg_sensors(pg, dur):
    await pg.goto(B + "/sensors", wait_until="networkidle"); await pg.wait_for_timeout(1500)
    await smooth(pg, 0, 1700, dur * 1000 - 2500)

async def seg_setup(pg, dur):
    await pg.goto(B + "/", wait_until="networkidle")
    await pg.evaluate("document.getElementById('setup').scrollIntoView()"); await pg.wait_for_timeout(500)
    await pg.click("#q"); await pg.keyboard.type("Banting, Selangor", delay=45)
    await pg.click("button[type=submit]"); await pg.wait_for_selector(".stations li", timeout=60000)
    await pg.wait_for_timeout(900)
    await pg.evaluate("document.querySelector('.stations').scrollIntoView({behavior:'smooth', block:'center'})"); await pg.wait_for_timeout(2200)
    await pg.evaluate("document.getElementById('label').scrollIntoView({behavior:'smooth', block:'center'})"); await pg.wait_for_timeout(900)
    await pg.click("#label"); await pg.keyboard.type("Rumah Mak", delay=60)
    await pg.click('label.langpick:has-text("中文")'); await pg.wait_for_timeout(700)
    await pg.click("text=Start watching"); await pg.wait_for_url("**/w/**", timeout=60000)
    await pg.wait_for_selector(".msg", timeout=60000); await pg.wait_for_timeout(800)
    open("/home/claude/video/watch_url", "w").write(pg.url)

async def seg_watch(pg, dur):
    url = open("/home/claude/video/watch_url").read().strip()
    await pg.goto(url, wait_until="networkidle"); await pg.wait_for_selector(".msg")
    await pg.evaluate("document.querySelector('.msg').scrollIntoView({block:'start'}); window.scrollBy(0,-90)")
    await pg.wait_for_timeout(3000)
    await pg.click('button.lang:has-text("தமிழ்")'); await pg.wait_for_timeout(3200)
    await pg.click('button.lang:has-text("Bahasa Melayu")'); await pg.wait_for_timeout(2600)
    await smooth(pg, None, 380, 2500)

async def seg_replay(pg, dur):
    await pg.goto(B + "/replay", wait_until="networkidle"); await pg.wait_for_timeout(600)
    await pg.evaluate("window.scrollTo(0, document.querySelector('.clock').getBoundingClientRect().top + scrollY - 10)")
    await pg.focus("#scrub")
    n = 180; step = max(30, int((dur * 1000 - 4500) / n))
    for i in range(n):
        await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(step)
        if i == 120: await pg.evaluate("document.querySelector('.phone').scrollIntoView({block:'start'})")
    await pg.wait_for_timeout(1500)

async def smooth(pg, start, delta, ms):
    if start is not None: await pg.evaluate(f"window.scrollTo(0,{start})")
    steps = max(1, int(ms / 40))
    for _ in range(steps):
        await pg.evaluate(f"window.scrollBy(0,{delta/steps})"); await pg.wait_for_timeout(40)

SEGS = {"home": (seg_home, 0), "sensors": (seg_sensors, 1), "setup": (seg_setup, 2), "watch": (seg_watch, 3), "replay": (seg_replay, 4)}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name in sys.argv[2:]:
            fn, idx = SEGS[name]
            tmp = f"/home/claude/video/rec/tmp_{name}"; shutil.rmtree(tmp, ignore_errors=True)
            ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2,
                                      record_video_dir=tmp, record_video_size={"width": W * 2, "height": H * 2})
            pg = await ctx.new_page()
            await fn(pg, D[idx])
            await ctx.close()
            f = glob.glob(tmp + "/*.webm")[0]; os.replace(f, f"/home/claude/video/rec/{name}.webm"); shutil.rmtree(tmp)
            print("recorded", name)
        await b.close()
asyncio.run(main())
