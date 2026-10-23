// In-memory rate limits for public endpoints (one Node instance on DigitalOcean; resets on deploy).

/** The client's address. DigitalOcean's edge sets do-connecting-ip and Cloudflare's cf-connecting-ip,
 * and both overwrite any copy a visitor sends. The leftmost X-Forwarded-For entry is whatever the
 * visitor wrote, so it is never trusted. */
export function clientIp(req: Request): string {
  const h = req.headers;
  const direct = h.get("do-connecting-ip")?.trim() || h.get("cf-connecting-ip")?.trim();
  if (direct) return direct;
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] || "unknown";
}

const windows = new Map<string, number[]>();

/** Sliding window: true when `key` already has `max` hits inside `windowMs` (and this one isn't counted). */
export function limited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { windows.set(key, hits); return true; }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 10_000) for (const [k, v] of windows) if (!v.some((t) => now - t < 3_600_000)) windows.delete(k);
  return false;
}
