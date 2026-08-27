// Client-only stash so an unsaved Atlas plot survives the magic-link round-trip:
// on Save-while-signed-out we keep the plot here, sign in, then restore + auto-save
// on return (mirrors the annotation draft flow in Immersive). localStorage only.
import type { MapRoutePoint, SavedMapMarker } from "./db";

export type PendingMap = {
  title: string;
  route: MapRoutePoint[][];
  markers: SavedMapMarker[];
  distanceM: number;
  gainM: number;
  ts: number;
};

const KEY = "pg_pending_map";
const TTL_MS = 60 * 60 * 1000; // ignore a draft older than an hour

export function stashPendingMap(m: Omit<PendingMap, "ts">): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...m, ts: Date.now() })); } catch { /* private mode */ }
}

export function readPendingMap(): PendingMap | null {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingMap;
    if (!p?.ts || Date.now() - p.ts > TTL_MS) throw new Error("stale");
    return p;
  } catch {
    clearPendingMap();
    return null;
  }
}

export function clearPendingMap(): void {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export function hasPendingMap(): boolean {
  return readPendingMap() != null;
}
