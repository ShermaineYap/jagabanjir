"""Scrape live river levels from JPS Public InfoBanjir and join station coordinates.

Usage: python3 scrape.py <out_dir> [coords.json]
Writes <out_dir>/latest.json (list of stations) and appends to <out_dir>/history/<date>.jsonl.
"""
import json
import re
import sys
import time
import html as htmlmod
import urllib.request
import datetime as dt
from pathlib import Path

STATES = {
    "PLS": "PERLIS", "KDH": "KEDAH", "PNG": "PULAU PINANG", "PRK": "PERAK",
    "SEL": "SELANGOR", "WLH": "WILAYAH PERSEKUTUAN KUALA LUMPUR",
    "PTJ": "WILAYAH PERSEKUTUAN PUTRAJAYA", "NSN": "NEGERI SEMBILAN",
    "MLK": "MELAKA", "JHR": "JOHOR", "PHG": "PAHANG", "TRG": "TERENGGANU",
    "KEL": "KELANTAN", "SRK": "SARAWAK", "SAB": "SABAH",
    "WLP": "WILAYAH PERSEKUTUAN LABUAN",
}
URL = ("https://publicinfobanjir.water.gov.my/index.php/aras-air/data-paras-air/"
       "aras-air-data/?state={code}&district=ALL&station=ALL&lang=en")
UA = "JagaBanjir/0.1 (student non-commercial project; polls every 15 min)"

ROW = re.compile(r"<tr\s+class='item'>(.*?)</tr>", re.S)
CELL = re.compile(r"<td data-th='([^']*)'>(.*?)</td>", re.S)
GRAPH = re.compile(r"stationid=(\d+)")


def clean(s):
    return htmlmod.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def num(s):
    s = clean(s)
    try:
        return float(s)
    except ValueError:
        return None


def norm_name(s):
    s = s.lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(sg|sungai)\b\.?", "sg", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def parse(page, state):
    out = []
    for row in ROW.findall(page):
        cells = {k: v for k, v in CELL.findall(row)}
        g = GRAPH.search(cells.get("wl", ""))
        ts = clean(cells.get("Last Update", ""))
        try:
            iso = dt.datetime.strptime(ts, "%d/%m/%Y %H:%M").isoformat()
        except ValueError:
            iso = None
        out.append({
            "jps_id": g.group(1) if g else None,
            "station_code": clean(cells.get("Station ID", "")) or None,
            "name": clean(cells.get("Station Name", "")),
            "district": clean(cells.get("District", "")),
            "state": state,
            "basin": clean(cells.get("Main Basin (mm)", "")),
            "sub_basin": clean(cells.get("Sub River Basin (mm)", "")),
            "updated": iso,  # Malaysia time, no offset
            "level": num(cells.get("wl", "")),
            "normal": num(cells.get("Normal", "")),
            "alert": num(cells.get("Alert", "")),
            "warning": num(cells.get("Warning", "")),
            "danger": num(cells.get("Danger", "")),
        })
    return out


def fetch(code):
    req = urllib.request.Request(URL.format(code=code), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "ignore")


def load_coords(path):
    """Index the (stale) data.gov.my station list by normalised name."""
    idx = {}
    for r in json.load(open(path)):
        if "WL" not in (r.get("station_type") or ""):
            continue
        key = (r["state"], norm_name(r["station_name"]))
        idx[key] = (r["latitude"], r["longitude"])
        if r.get("station_code"):
            idx[("code", r["station_code"])] = (r["latitude"], r["longitude"])
    return idx


def main():
    out_dir = Path(sys.argv[1])
    coords = load_coords(sys.argv[2]) if len(sys.argv) > 2 else {}
    out_dir.mkdir(parents=True, exist_ok=True)
    fetched_at = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).replace(microsecond=0)
    stations, errors = [], []
    for code, state in STATES.items():
        try:
            rows = parse(fetch(code), state)
        except Exception as e:  # keep going; one state failing must not stop the rest
            errors.append(f"{code}: {e}")
            continue
        for s in rows:
            ll = coords.get((state, norm_name(s["name"])))
            if not ll and s["station_code"]:
                ll = coords.get(("code", s["station_code"].replace("WL", "")))
            s["lat"], s["lon"] = ll if ll else (None, None)
        stations.extend(rows)
        time.sleep(1)
    snap = {"fetched_at": fetched_at.isoformat(), "errors": errors, "stations": stations}
    (out_dir / "latest.json").write_text(json.dumps(snap, ensure_ascii=False))
    hist = out_dir / "history"
    hist.mkdir(exist_ok=True)
    slim = [[s["jps_id"], s["updated"], s["level"]] for s in stations]
    with open(hist / f"{fetched_at.date()}.jsonl", "a") as f:
        f.write(json.dumps({"t": fetched_at.isoformat(), "s": slim}) + "\n")
    print(f"{len(stations)} stations, {sum(1 for s in stations if s['lat'])} with coords, errors={errors}")


if __name__ == "__main__":
    main()
