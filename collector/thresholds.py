"""Build src/data/thresholds.json from the JPS Public InfoBanjir water-level tables.

The live JSON feed has no threshold columns, so we scrape the per-state tables
(Normal / Alert / Warning / Danger) once in a while and key them by
state|district|station name exactly as JPS writes them.

Usage: python3 collector/thresholds.py src/data/thresholds.json
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scrape import STATES, fetch, parse  # noqa: E402


def key(state, district, name):
    return "|".join(" ".join(x.lower().split()) for x in (state, district, name))


def main():
    out = {}
    for code, state in STATES.items():
        for row in parse(fetch(code), state):
            t = {k: row[k] for k in ("normal", "alert", "warning", "danger")}
            if not any(v is not None for v in t.values()):
                continue
            out[key(state, row["district"], row["name"])] = {**t, "jps_id": row["jps_id"]}
        time.sleep(1)
    Path(sys.argv[1]).parent.mkdir(parents=True, exist_ok=True)
    Path(sys.argv[1]).write_text(json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True))
    print(len(out), "stations with thresholds")


if __name__ == "__main__":
    main()
