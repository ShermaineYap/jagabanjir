import { describe, expect, it } from "vitest";
import { allWatches, deleteWatch, getJSON, getWatch, historyFor, loadTicks, putWatch, releaseLock, saveTick, setJSON, tryLock } from "../src/lib/store";

describe("store (in-memory mode)", () => {
  it("round-trips JSON and honours expiry", async () => {
    await setJSON("a", { x: 1 });
    expect(await getJSON("a")).toEqual({ x: 1 });
    await setJSON("b", 1, -1);
    expect(await getJSON("b")).toBeNull();
  });
  it("gives the tick lock to one caller at a time", async () => {
    expect(await tryLock("lock:t", 60)).toBe(true);
    expect(await tryLock("lock:t", 60)).toBe(false);
    await releaseLock("lock:t");
    expect(await tryLock("lock:t", 60)).toBe(true);
  });
  it("loads ticks since a time, oldest first, and builds station history", async () => {
    await saveTick("tick:2", { t: "2026-11-25T12:15:00Z", l: { s: ["2026-11-25T20:15:00+08:00", 3.2] } });
    await saveTick("tick:1", { t: "2026-11-25T12:00:00Z", l: { s: ["2026-11-25T20:00:00+08:00", 3.0] } });
    const ticks = await loadTicks(Date.parse("2026-11-25T11:00:00Z"));
    expect(ticks.map((t) => t.t)).toEqual(["2026-11-25T12:00:00Z", "2026-11-25T12:15:00Z"]);
    expect(historyFor(ticks, "s").map((p) => p[1])).toEqual([3.0, 3.2]);
  });
  it("stores, lists and deletes watches", async () => {
    const w = { id: "w1", createdAt: "", label: "Rumah Mak", lat: 3, lon: 101, stationIds: ["s"], lang: "ms" as const };
    await putWatch(w);
    expect((await getWatch("w1"))?.label).toBe("Rumah Mak");
    expect((await allWatches()).map((x) => x.id)).toContain("w1");
    await deleteWatch("w1");
    expect(await getWatch("w1")).toBeNull();
  });
});
