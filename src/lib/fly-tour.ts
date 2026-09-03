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

export type IntroLevel = "space" | "continent" | "country" | "region" | "area" | "trailhead";
export type LightPreset = "dawn" | "day" | "dusk" | "night";

interface TourOpts {
  /** 0→1 as the trail run progresses (drives the HUD). */
  onProgress?: (pct: number) => void;
  /** Fired once when the whole tour ends (finished OR cancelled). */
  onEnd?: (cancelled: boolean) => void;
  /** Called with a Mapbox `lightPreset` name as the sun sweeps; no-ops off Standard. */
  onPreset?: (preset: LightPreset) => void;
  // ── Per-trip fly-by settings (all optional; defaults reproduce the original) ──
  /** Where the camera begins its descent. Default "space". */
  intro?: IntroLevel;
  /** Trail-run birdseye pitch, 45 (top-down-ish) → 75 (low/cinematic). Default 62. */
  pitch?: number;
  /** Pace multiplier: >1 faster, <1 slower. Default 1. */
  pace?: number;
  /** Sun rakes dawn→dusk across the climb. Default true. When false, the light
   *  stays fixed at `lightPreset`. */
  sunSweep?: boolean;
  /** Base light mood (start-of-flight, and the whole flight when sunSweep is off).
   *  Default "dawn". */
  lightPreset?: LightPreset;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Ease in/out — camera accelerates off the mark and settles, never robotic.
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
// Shortest signed turn from one heading to another (−180..180), so bearing
// smoothing never spins the long way around the compass.
const angDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

// Trail-run camera: close + tilted DOWN toward the trail (not across the range,
// where foreground ridges would occlude it).
const DEFAULT_RUN_PITCH = 62;
const RUN_ZOOM = 15.6;
// Opening zoom per altitude choice — how far out the descent begins. "trailhead"
// skips the space reveal and starts right on the ground.
const INTRO_ZOOM: Record<IntroLevel, number> = {
  space: 1.5, continent: 3.2, country: 4.6, region: 6.6, area: 9, trailhead: 13.2,
};

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

  // Highest point = the climax. We fly the trail UP TO the summit and celebrate
  // there, rather than running the whole loop back down past it.
  let hiIdx = path.length - 1, hiEle = -Infinity;
  for (let i = 0; i < path.length; i++) { const e = path[i].ele ?? -Infinity; if (e > hiEle) { hiEle = e; hiIdx = i; } }
  const hi = path[hiIdx];
  // Distance flown = up to the summit (unless it sits right at the start — then the whole path).
  const runEnd = cum[hiIdx] > total * 0.12 ? cum[hiIdx] : total;

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
  // Sun sweeps across the climb: dawn at the trailhead → day on the trail →
  // golden dusk as you crest the summit (the celebration light).
  const sunFor = (p: number): "dawn" | "day" | "dusk" => (p < 0.12 ? "dawn" : p < 0.75 ? "day" : "dusk");

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
    const pace = opts.pace && opts.pace > 0 ? opts.pace : 1;
    const runPitch = clamp(opts.pitch ?? DEFAULT_RUN_PITCH, 40, 78);
    const base: LightPreset = opts.lightPreset ?? "dawn";
    const sweep = opts.sunSweep !== false;
    const runMs = clamp((runEnd * 2.1) / pace, 12000, 42000); // scaled to ascent + pace

    try {
      // 0 — OPENING: descend from the chosen altitude (space reveal → regional
      // establish → straight to the trailhead).
      setPreset(base);
      const introZoom = INTRO_ZOOM[opts.intro ?? "space"];
      if (introZoom <= 5) {
        // Space reveal: the whole planet, a beat, then a long descent.
        map.jumpTo({ center: [start.lng, start.lat], zoom: introZoom, pitch: 0, bearing: 0 });
        await animate(1200, () => {});
        if (cancelled) return;
        await move({ center: [start.lng, start.lat], zoom: 10.5, pitch: 45, bearing: startBearing - 35 }, 5400);
      } else if (introZoom < 12) {
        // Regional establish: start out over the range, ease in.
        map.jumpTo({ center: [start.lng, start.lat], zoom: introZoom, pitch: 25, bearing: startBearing - 30 });
        await move({ center: [start.lng, start.lat], zoom: 10.5, pitch: 45, bearing: startBearing - 30 }, 3600);
      } else {
        // Trailhead: skip the reveal, drop right in.
        map.jumpTo({ center: [start.lng, start.lat], zoom: introZoom, pitch: 40, bearing: startBearing - 10 });
      }
      if (cancelled) return;

      // 1 — APPROACH: descend onto the trailhead, settling into the run pose so
      // the trail run begins without a snap.
      await move({ center: [start.lng, start.lat], zoom: RUN_ZOOM, pitch: runPitch, bearing: startBearing }, 3000);
      if (cancelled) return;

      // 2 — TRAIL RUN: climb to the summit. Heading is low-passed so the camera
      // banks smoothly through switchbacks; distance is eased in and out.
      let curBearing = startBearing;
      await animate(runMs, (p) => {
        const d = easeInOut(p) * runEnd;
        const pos = at(d);
        curBearing += angDelta(curBearing, headingAt(d)) * 0.08; // smooth bank
        const bob = Math.sin(p * Math.PI * 4);                   // gentle float
        map.jumpTo({
          center: [pos.lng, pos.lat],
          bearing: curBearing,
          pitch: runPitch + bob * 1.4,
          zoom: RUN_ZOOM + bob * 0.08,
        });
        if (sweep) setPreset(sunFor(p));
        opts.onProgress?.(p);
      });
      if (cancelled) return;

      // 3 — ARRIVAL: a short beat settling onto the summit before the reveal.
      setPreset(sweep ? "dusk" : base);
      await move({ center: [hi.lng, hi.lat], zoom: RUN_ZOOM + 0.3, pitch: 60, bearing: curBearing }, 1100);
      if (cancelled) return;

      // 4 — SUMMIT CELEBRATION: a slow FULL orbit that pulls back to reveal the massif.
      const orbitFrom = map.getBearing();
      await animate(11000, (p) => {
        const e = easeInOut(p);
        map.jumpTo({
          center: [hi.lng, hi.lat],
          bearing: orbitFrom + 360 * e,
          pitch: 60 - 13 * e,
          zoom: (RUN_ZOOM + 0.3) - 2.1 * e,
        });
      });
    } finally {
      for (const h of io) h?.enable?.();
      opts.onEnd?.(cancelled);
    }
  })();

  return { cancel };
}
