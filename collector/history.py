"""Download the last 7 days of readings for JPS water-level stations.

Usage: python3 collector/history.py <live-feed.json> <out_dir> [workers=1]
Writes <out_dir>/<station_id>.json = {"info": {...thresholds...}, "v": [[iso, level], ...]} at 15-minute steps.
Each worker waits a second between requests; skips stations already downloaded.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

URL = "https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/query/getwaterlevellast7dayslead.php?extra=0&station={}"
UA = "JagaBanjir/0.1 (student non-commercial project)"


def num(s):
    try:
        v = float(s)
    except (TypeError, ValueError):
        return None
    return None if v <= -9999 else v


def iso(dt):  # "18/11/2026 00:00" -> "2026-11-18T00:00:00+08:00"
    d, t = dt.split(" ")
    dd, mm, yy = d.split("/")
    return f"{yy}-{mm}-{dd}T{t}:00+08:00"


def main():
    feed = json.load(open(sys.argv[1]))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    ids = [a["a"] for a in feed if "WL" in a.get("i", "") and a.get("m") not in ("", "-9999", None)]
    print(len(ids), "stations with a current reading", flush=True)
    todo = [sid for sid in ids if not (out / f"{urllib.parse.quote(sid, safe='')}.json").exists()]
    workers = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(workers) as ex:
        done = sum(ex.map(lambda sid: one(sid, out), todo))
    print("finished", done, flush=True)


def one(sid, out):
    f = out / f"{urllib.parse.quote(sid, safe='')}.json"
    if True:
        try:
            req = urllib.request.Request(URL.format(urllib.parse.quote(sid)), headers={"User-Agent": UA})
            j = json.loads(urllib.request.urlopen(req, timeout=60).read())
        except Exception as e:  # keep going
            print("ERR", sid, e, flush=True)
            time.sleep(2)
            return 0
        info = j.get("info", {})
        series = []
        for r in j.get("values", []):
            v = num(r.get("final"))
            if v is None or not r.get("dt", "").endswith(("00", "15", "30", "45")):
                continue
            series.append([iso(r["dt"]), v])
        f.write_text(json.dumps({
            "id": sid,
            "info": {k: num(info.get(k)) for k in ("normal", "alert", "warning", "danger")},
            "v": series,
        }))
        time.sleep(1)
        return 1


if __name__ == "__main__":
    main()
