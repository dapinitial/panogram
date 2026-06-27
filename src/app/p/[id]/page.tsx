import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPostById } from "@/lib/post-server";
import { MEDIA } from "@/lib/types";
import PermalinkView from "@/components/PermalinkView";

export const dynamic = "force-dynamic";

// Per-post OG metadata — this is what makes a shared link show the panorama as its
// preview image, which drives the share → click → signup loop.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) return { title: "Panogram" };
  const title = `${post.title} — Panogram`;
  const description = post.description || `${MEDIA[post.type].label} · ${post.location} · stand inside it on Panogram.`;
  const images = post.imageUrl ? [post.imageUrl] : [];
  return {
    title,
    description,
    openGraph: { title, description, images, type: "article" },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();
  return (
    <>
      <div className="backdrop" />
      <PermalinkView post={post} />
    </>
  );
}
