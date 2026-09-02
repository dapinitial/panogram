// Cinematic "helicopter birdseye" fly-by for the 3D Atlas — the shock-and-awe
// tour that dives in from orbit, screams along a plotted trail at a steep
// birdseye pitch (bearing locked to the direction of travel), then orbits the
// high point to reveal it. The sun rakes from dawn → dusk across the flight, so
// the light moves "as someone hikes" (Mapbox Standard `lightPreset`).
//
// Engine-agnostic of React: give it a Mapbox map + the trail path and it runs a
// rAF-driven camera. Returns a handle whose cancel() aborts mid-flight.

import type { Map as MbMap } from "mapbox-gl";
import { bearingBetween, distanceM } from "@/lib/geo";

export interface TourPoint { lat: number; lng: number; ele?: number | null }

export interface TourHandle {
  /** Abort the flight immediately (safe to call after it has finished). */
  cancel: () => void;
}

interface TourOpts {
  /** 0→1 as the trail run progresses (drives the HUD). */
  onProgress?: (pct: number) => void;
  /** Fired once when the whole tour ends (finished OR cancelled). */
  onEnd?: (cancelled: boolean) => void;
  /** Called with a Mapbox `lightPreset` name as the sun sweeps; no-ops off Standard. */
  onPreset?: (preset: "dawn" | "day" | "dusk" | "night") => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Ease in/out — camera accelerates off the mark and settles, never robotic.
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Fly the trail. `path` is the ordered route (one flattened polyline). Needs at
 * least two points; a shorter path resolves immediately via onEnd(true).
 */
export function flyTour(map: MbMap, path: TourPoint[], opts: TourOpts = {}): TourHandle {
  if (path.length < 2) { opts.onEnd?.(true); return { cancel: () => {} }; }

  let cancelled = false;
  const cancel = () => { cancelled = true; };

  // Cumulative ground distance so we can sample the path at an even ground speed
  // rather than per-vertex (dense stretches would otherwise crawl).
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum[i] = cum[i - 1] + distanceM(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng);
  }
  const total = cum[cum.length - 1] || 1;

  // Position (and interpolated point) at ground-distance d along the path.
  const at = (d: number): TourPoint => {
    d = clamp(d, 0, total);
    let i = 1;
    while (i < cum.length && cum[i] < d) i++;
    const a = path[i - 1], b = path[i] ?? path[i - 1];
    const seg = cum[i] - cum[i - 1] || 1;
    const f = clamp((d - cum[i - 1]) / seg, 0, 1);
    return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
  };

  // Highest point (summit reveal target); falls back to the trail's end.
  let hi = path[path.length - 1], hiEle = -Infinity;
  for (const p of path) if ((p.ele ?? -Infinity) > hiEle) { hiEle = p.ele ?? -Infinity; hi = p; }

  // Lock in the direction of travel with a lookahead so bearing doesn't jitter
  // on tight switchbacks — read the heading a little way down the trail.
  const lookahead = clamp(total * 0.08, 60, 500);
  const headingAt = (d: number) => {
    const a = at(d), b = at(Math.min(total, d + lookahead));
    return bearingBetween(a.lat, a.lng, b.lat, b.lng);
  };

  let preset = "";
  const setPreset = (p: "dawn" | "day" | "dusk" | "night") => {
    if (p === preset) return;
    preset = p;
    try { map.setConfigProperty("basemap", "lightPreset", p); } catch { /* not Standard */ }
    opts.onPreset?.(p);
  };
  // Sun sweeps across the flight: dawn on approach → day on the trail → dusk at the summit.
  const sunFor = (p: number) => (p < 0.15 ? "dawn" : p < 0.7 ? "day" : p < 0.92 ? "dusk" : "night");

  // A phase that hands the camera to Mapbox's own easing, resolving when it lands.
  const move = (cam: Parameters<MbMap["easeTo"]>[0], ms: number) =>
    new Promise<void>((res) => {
      if (cancelled) return res();
      map.easeTo({ ...cam, duration: ms, essential: true });
      setTimeout(res, ms + 40);
    });

  // A rAF phase: `step(p)` drives the camera each frame for `ms` (p is 0→1).
  const animate = (ms: number, step: (p: number) => void) =>
    new Promise<void>((res) => {
      const t0 = performance.now();
      const frame = (now: number) => {
        if (cancelled) return res();
        const p = clamp((now - t0) / ms, 0, 1);
        step(p);
        if (p < 1) requestAnimationFrame(frame); else res();
      };
      requestAnimationFrame(frame);
    });

  (async () => {
    // Freeze user input for the duration — the camera is the director now.
    const io = [map.dragPan, map.scrollZoom, map.dragRotate, map.touchZoomRotate, map.touchPitch, map.keyboard, map.doubleClickZoom];
    for (const h of io) h?.disable?.();

    const start = at(0), startBearing = headingAt(0);
    const runMs = clamp(total * 1.25, 9000, 22000); // ~9–22s trail run, scaled to length

    try {
      // 1 — ESTABLISH: rise to a wide orbital birdseye over the trailhead.
      setPreset("dawn");
      await move({ center: [start.lng, start.lat], zoom: 11, pitch: 40, bearing: startBearing - 40 }, 2600);
      if (cancelled) return;

      // 2 — APPROACH: dive down onto the trailhead like a gunship rolling in.
      await move({ center: [start.lng, start.lat], zoom: 15.2, pitch: 70, bearing: startBearing }, 2600);
      if (cancelled) return;

      // 3 — TRAIL RUN: skim the route, bearing tracking travel, with a rotor bob.
      await animate(runMs, (p) => {
        const d = p * total;
        const pos = at(d);
        const bob = Math.sin(p * Math.PI * 7); // subtle helicopter float
        map.jumpTo({
          center: [pos.lng, pos.lat],
          bearing: headingAt(d),
          pitch: 71 + bob * 3,
          zoom: 15.1 + bob * 0.18,
        });
        setPreset(sunFor(p));
        opts.onProgress?.(p);
      });
      if (cancelled) return;

      // 4 — SUMMIT REVEAL: orbit the high point 360° and pull back to show the land.
      const orbitFrom = map.getBearing();
      await animate(6400, (p) => {
        const e = easeInOut(p);
        map.jumpTo({
          center: [hi.lng, hi.lat],
          bearing: orbitFrom + 340 * e,
          pitch: 71 - 16 * e,
          zoom: 15.1 - 1.7 * e,
        });
      });
      setPreset("dusk");
    } finally {
      for (const h of io) h?.enable?.();
      opts.onEnd?.(cancelled);
    }
  })();

  return { cancel };
}
