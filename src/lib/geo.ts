import type { Station } from "./types";

export function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLon = toR(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearest(stations: Station[], lat: number, lon: number, limit = 6, maxKm = 25) {
  return stations
    .filter((s) => s.lat !== null && s.lon !== null)
    .map((s) => ({ station: s, km: Math.round(km(lat, lon, s.lat!, s.lon!) * 10) / 10 }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}
