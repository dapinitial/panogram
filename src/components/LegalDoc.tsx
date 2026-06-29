import Link from "next/link";
import Footer from "./Footer";

// Shared chrome for the static legal/policy pages: a slim top bar that links home,
// the title + last-updated stamp, the prose body, and the site footer.
export default function LegalDoc({
  eyebrow = "Legal", title, updated, intro, children,
}: {
  eyebrow?: string;
  title: string;
  updated: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="backdrop" />
      <header className="legal-top">
        <Link href="/" className="legal-home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/panogram-mark.png" alt="" />
          <span>Panogram</span>
        </Link>
        <Link href="/" className="legal-back">← Back to the feed</Link>
      </header>

      <main className="legal">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated {updated}</p>
        {intro && <div className="legal-intro">{intro}</div>}
        <div className="legal-body">{children}</div>

        <div className="legal-note">
          This document is a plain-language starting point, not legal advice. Bracketed
          placeholders such as <code>[ENTITY]</code>, <code>[CONTACT]</code> and{" "}
          <code>[JURISDICTION]</code> must be completed, and the policies reviewed by counsel,
          before public launch.
        </div>
      </main>

      <Footer />
    </>
  );
}
