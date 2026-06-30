import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProfileByHandle } from "@/lib/profile-server";
import { MEDIA } from "@/lib/types";
import FollowButton from "@/components/FollowButton";
import ReportCreator from "@/components/ReportCreator";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const p = await getProfileByHandle(handle);
  if (!p) return { title: "Panogram" };
  const title = `${p.displayName} (@${p.handle}) — Panogram`;
  const description = p.bio || `${p.posts.length} immersive captures on Panogram. Step inside them.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary", title, description } };
}

export default async function CreatorPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const p = await getProfileByHandle(handle);
  if (!p) notFound();

  return (
    <>
      <div className="backdrop" />
      <main className="shell">
        <header className="hero" style={{ paddingBottom: 8 }}>
          <Link href="/" className="eyebrow" style={{ display: "inline-block", marginBottom: 18 }}>← Panogram</Link>
          <div className="prof-head">
            <div className="prof-av" style={{ background: p.grad }}>{p.handle[0]?.toUpperCase()}</div>
            <div>
              <h1 style={{ fontSize: "clamp(28px,5vw,46px)", margin: 0 }}>{p.displayName}</h1>
              <div style={{ color: "var(--ink-faint)", fontFamily: "var(--font-d)", marginTop: 4 }}>@{p.handle}</div>
              {p.bio && <p style={{ marginTop: 12, maxWidth: "48ch" }}>{p.bio}</p>}
              <div className="prof-actions">
                <FollowButton targetId={p.id} count={p.followerCount} />
                <ReportCreator targetId={p.id} handle={p.handle} />
              </div>
            </div>
          </div>
        </header>

        <div className="rail" style={{ marginTop: 18 }}>
          <span className="chip" data-active="true">{p.posts.length} capture{p.posts.length === 1 ? "" : "s"}</span>
        </div>

        {p.posts.length === 0 ? (
          <p style={{ color: "var(--ink-faint)", padding: "40px 0" }}>No captures yet.</p>
        ) : (
          <div className="grid">
            {p.posts.map((c) => (
              <Link key={c.id} href={`/p/${c.id}`} className="card" style={{ display: "block" }}>
                <div className="card-stage">
                  <div className="card-poster" style={{ background: c.poster }} />
                  <div className="horizon" />
                  <div className="badge">{MEDIA[c.type].immersive ? "◉ " : "▭ "}{MEDIA[c.type].short}</div>
                  <div className="card-meta">
                    <h3>{c.title}</h3>
                    {c.location && <div className="card-loc">📍 {c.location}</div>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
