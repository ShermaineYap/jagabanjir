"use client";
import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

export interface MapStation {
  id: string;
  lat: number;
  lon: number;
  name: string;
  colour: string;
  trusted: boolean;
}

/** OpenStreetMap with a draggable house pin, and nearby gauges as small markers. */
export function PinMap({
  pin,
  onPin,
  stations = [],
  height = "22rem",
}: {
  pin: { lat: number; lon: number } | null;
  onPin?: (p: { lat: number; lon: number }) => void;
  stations?: MapStation[];
  height?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const pinLayer = useRef<Leaflet.Marker | null>(null);
  const stLayer = useRef<Leaflet.LayerGroup | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod;
      const m = mod.map(el.current, { zoomControl: true, attributionControl: true }).fitBounds([[0.9, 99.6], [7.4, 119.3]]);
      mod
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "© OpenStreetMap contributors",
        })
        .addTo(m);
      if (onPinRef.current) m.on("click", (e: Leaflet.LeafletMouseEvent) => onPinRef.current?.({ lat: e.latlng.lat, lon: e.latlng.lng }));
      stLayer.current = mod.layerGroup().addTo(m);
      map.current = m;
      sync();
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const mod = L.current;
    const m = map.current;
    if (!mod || !m) return;
    if (pin) {
      const icon = mod.divIcon({
        className: "",
        html: `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39 C15 39 2 23 2 14 a13 13 0 0 1 26 0 c0 9 -13 25 -13 25z" fill="#14233a"/><path d="M8 17 l7 -6 7 6 v7 h-14z" fill="#fff"/></svg>`,
        iconSize: [30, 40],
        iconAnchor: [15, 39],
      });
      if (!pinLayer.current) {
        pinLayer.current = mod.marker([pin.lat, pin.lon], { icon, draggable: Boolean(onPinRef.current), keyboard: true, title: "House" }).addTo(m);
        pinLayer.current.on("dragend", () => {
          const ll = pinLayer.current!.getLatLng();
          onPinRef.current?.({ lat: ll.lat, lon: ll.lng });
        });
      } else pinLayer.current.setLatLng([pin.lat, pin.lon]);
    }
    stLayer.current?.clearLayers();
    for (const s of stations) {
      mod
        .circleMarker([s.lat, s.lon], {
          radius: 8,
          color: "#14233a",
          weight: 1.5,
          dashArray: s.trusted ? undefined : "3 3",
          fillColor: s.trusted ? s.colour : "#d8dcdf",
          fillOpacity: 1,
        })
        .bindTooltip(s.name)
        .addTo(stLayer.current!);
    }
    if (pin) {
      const pts: [number, number][] = [[pin.lat, pin.lon], ...stations.map((s) => [s.lat, s.lon] as [number, number])];
      if (pts.length > 1) m.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
      else m.setView([pin.lat, pin.lon], 13);
    }
  }

  useEffect(sync); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="map" style={{ height }} />;
}
