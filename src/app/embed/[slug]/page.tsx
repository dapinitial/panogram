import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase-server";
import { tripRowToTrip } from "@/lib/db";
import TripGlobe from "@/components/TripGlobe";

// White-label, chrome-free 3D fly-by for one trip — embedded on external sites
// (e.g. kafadventures.com) via <iframe src=".../embed/<slug>">. Public: reads a
// PUBLISHED trip by slug through RLS (anonymous). Cross-origin framing is
// allowed in src/proxy.ts for the /embed path. Autoplays + loops the tour.

export const dynamic = "force-dynamic";

type TripRowArg = Parameters<typeof tripRowToTrip>[0];
const TRIP_SELECT = "id,slug,title,region,route,markers,color,summit_m,distance_m,gain_m,autoplay,published,created_at";

async function getTrip(slug: string) {
  const sb = await supabaseServer();
  const { data } = await sb.from("trips").select(TRIP_SELECT).eq("slug", slug).eq("published", true).maybeSingle();
  return data ? tripRowToTrip(data as TripRowArg) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const trip = await getTrip(slug);
  return {
    title: trip ? `${trip.title} — 3D fly-by` : "Fly-by",
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = await getTrip(slug);
  if (!trip) notFound();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://panogram-fxfju.ondigitalocean.app";
  return (
    <main className="embed-stage">
      <TripGlobe route={trip.route} markers={trip.markers} color={trip.color} autoplay={trip.autoplay} loop />
      <a className="embed-brand" href={site} target="_blank" rel="noopener noreferrer">Panogram</a>
    </main>
  );
}
