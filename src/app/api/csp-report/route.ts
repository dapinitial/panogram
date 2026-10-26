import { NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/ratelimit";

// Where the browser sends Content-Security-Policy violation reports (both the legacy
// application/csp-report shape and the Reporting API's reports+json). One log line per report,
// four fields, nothing else: `doctl apps logs panogram --type run | grep csp:`.
// Rate limited per address, 16 KB body.
export async function POST(req: Request) {
  if (limited("csp:" + clientIp(req), 60, 60_000)) return new NextResponse(null, { status: 429 });
  const text = await req.text();
  if (text.length > 16_384) return new NextResponse(null, { status: 413 });
  try {
    const parsed = JSON.parse(text);
    const reports: Record<string, unknown>[] = Array.isArray(parsed) ? parsed.map((r) => r.body ?? r) : [parsed["csp-report"] ?? parsed];
    for (const r of reports.slice(0, 10)) {
      const doc = r["document-uri"] ?? r.documentURL ?? "";
      const blocked = r["blocked-uri"] ?? r.blockedURL ?? "";
      const directive = r["violated-directive"] ?? r.effectiveDirective ?? "";
      const sample = String(r["script-sample"] ?? r.sample ?? "").slice(0, 80);
      console.warn("csp:", String(doc).slice(0, 120), "blocked", String(blocked).slice(0, 120), `(${String(directive).slice(0, 40)})`, sample ? `sample=${JSON.stringify(sample)}` : "");
    }
  } catch { /* not JSON: nothing to learn */ }
  return new NextResponse(null, { status: 204 });
}
