"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Lang, StationStatus } from "@/lib/types";
import { LANGS } from "@/lib/messages";
import { isTrusted } from "@/lib/ui";
import { LevelNumber, StationText } from "./StationRow";

const PinMap = dynamic(() => import("./PinMap").then((m) => m.PinMap), {
  ssr: false,
  loading: () => <div className="map" />,
});

type Near = StationStatus & { km: number };
interface Place {
  display_name: string;
  lat: string;
  lon: string;
}

export const LEVEL_COLOUR: Record<string, string> = {
  NORMAL: "#3e8e5e",
  ALERT: "#e8b21a",
  WARNING: "#e2701b",
  DANGER: "#c8312b",
};

export function Setup() {
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [near, setNear] = useState<Near[] | null>(null);
  const [nearErr, setNearErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [lang, setLang] = useState<Lang>("ms");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!pin) return;
    setNear(null);
    setNearErr(null);
    fetch(`/api/near?lat=${pin.lat}&lon=${pin.lon}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setNearErr(j.error);
        setNear(j.stations);
        const firstTrusted = (j.stations as Near[]).find(isTrusted);
        setPicked(firstTrusted ? [firstTrusted.station.id] : []);
      })
      .catch(() => setNearErr("Could not load nearby gauges. Try again."));
  }, [pin]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setPlaces(null);
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&countrycodes=my&limit=5&q=${encodeURIComponent(q)}`,
    ).catch(() => null);
    const j = r ? ((await r.json()) as Place[]) : [];
    setPlaces(j);
    if (j.length === 1) setPin({ lat: +j[0].lat, lon: +j[0].lon });
  }

  function here() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPin({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setErr("Your browser did not share a location. Search or tap the map instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));
  }

  async function create() {
    setErr(null);
    setBusy(true);
    const r = await fetch("/api/watch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, lat: pin?.lat, lon: pin?.lon, stationIds: picked, lang }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.error) return setErr(j.error);
    location.href = `/w/${j.id}`;
  }

  const anyTrusted = near?.some(isTrusted);

  return (
    <section aria-labelledby="setup" style={{ maxWidth: "46rem" }}>
      <h2 id="setup">Watch a house</h2>
      <p className="muted">Takes about a minute. No account needed.</p>

      <ol className="steps">
        <li>
          <h3>Find the house</h3>
          <form onSubmit={search} className="row" style={{ marginBottom: ".6rem" }} role="search">
            <label className="sr" htmlFor="q">
              Town, taman or kampung
            </label>
            <input
              id="q"
              type="search"
              placeholder="Town, taman or kampung, e.g. Kampung Parit Mahang"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: "1 1 16rem" }}
            />
            <button className="btn" type="submit">
              Search
            </button>
            <button className="btn ghost" type="button" onClick={here}>
              Use my location
            </button>
          </form>
          {places && places.length === 0 && <p className="small">No match in Malaysia. Try a nearby town, or tap the map.</p>}
          {places && places.length > 1 && (
            <ul className="small" style={{ paddingLeft: "1.1rem" }}>
              {places.map((p) => (
                <li key={p.lat + p.lon}>
                  <button className="linklike" onClick={() => setPin({ lat: +p.lat, lon: +p.lon })}>
                    {p.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <PinMap
            pin={pin}
            onPin={setPin}
            stations={(near ?? [])
              .filter((n) => n.station.lat !== null)
              .map((n) => ({
                id: n.station.id,
                lat: n.station.lat!,
                lon: n.station.lon!,
                name: n.station.name,
                trusted: isTrusted(n),
                colour: LEVEL_COLOUR[n.level ?? "NORMAL"],
              }))}
          />
          <p className="small muted" style={{ marginTop: ".4rem" }}>
            Tap the map to place the house, then drag the pin to adjust. Round circles are river gauges; dashed grey ones
            are not sending usable data.
          </p>
        </li>

        <li>
          <h3>Choose the river gauges</h3>
          {!pin && <p className="muted">Place the house first.</p>}
          {pin && !near && !nearErr && <p className="muted">Finding gauges within 30 km…</p>}
          {nearErr && <p className="err">{nearErr}</p>}
          {near && near.length === 0 && (
            <p className="notice">
              There is no JPS river gauge within 30 km of this spot, so JagaBanjir cannot watch it. Rely on official SMS
              alerts and your local village head.
            </p>
          )}
          {near && near.length > 0 && (
            <>
              <p className="small muted">
                Pick up to three, on the river that actually floods the house. You know the area better than the map does.
              </p>
              {!anyTrusted && (
                <p className="notice lv-UNKNOWN">
                  None of the nearby gauges is sending usable data right now. You can still watch them; you will be told
                  when they come back, and the page will say &ldquo;can&apos;t tell&rdquo; rather than &ldquo;normal&rdquo;.
                </p>
              )}
              <ul className="stations">
                {near.map((n) => (
                  <li key={n.station.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={picked.includes(n.station.id)}
                        onChange={() => toggle(n.station.id)}
                        aria-describedby={`m-${n.station.id}`}
                      />
                      <div id={`m-${n.station.id}`}>
                        <StationText s={n} km={n.km} />
                      </div>
                      <LevelNumber s={n} />
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </li>

        <li>
          <h3>Name it and pick their language</h3>
          <label className="field" htmlFor="label">
            What do you call the house?
          </label>
          <input
            id="label"
            type="text"
            placeholder="Rumah Mak, Ah Ma's house, Appa's place"
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
          />
          <fieldset style={{ border: 0, padding: 0, margin: "1rem 0 0" }}>
            <legend className="field" style={{ fontWeight: 700, marginBottom: ".35rem" }}>
              Message language
            </legend>
            <div className="row">
              {LANGS.map((l) => (
                <label key={l.code} className={`langpick ${lang === l.code ? "on" : ""}`}>
                  <input type="radio" name="lang" value={l.code} checked={lang === l.code} onChange={() => setLang(l.code)} />
                  {l.native}
                </label>
              ))}
            </div>
          </fieldset>
        </li>
      </ol>

      {err && <p className="err">{err}</p>}
      <button className="btn" onClick={create} disabled={busy || !pin || picked.length === 0 || !label.trim()}>
        {busy ? "Starting…" : "Start watching"}
      </button>

      <style>{`
        .steps { padding-left: 1.6rem; margin: 1.5rem 0 1.5rem; }
        .steps > li { margin-bottom: 2.2rem; padding-left: .3rem; }
        .steps > li::marker { font-family: var(--gauge); font-weight: 700; font-size: 1.5rem; color: var(--river); }
        .langpick { display: inline-flex; align-items: center; gap: .45rem; border: 2px solid var(--line); border-radius: .5rem; padding: .55rem .9rem; background: var(--paper); cursor: pointer; min-height: 3rem; }
        .langpick.on { border-color: var(--ink); }
        .langpick input { accent-color: var(--ink); }
        .linklike { background: none; border: 0; padding: .2rem 0; font: inherit; color: var(--river); text-decoration: underline; cursor: pointer; text-align: left; }
      `}</style>
    </section>
  );
}
