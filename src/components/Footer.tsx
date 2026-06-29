import Link from "next/link";

// Shared site footer. No "use client" — plain markup, so it works in both the
// client app shell and the server-rendered legal pages.
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="foot-inner">
        <div className="foot-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/panogram-mark.png" alt="" />
          <span>Panogram</span>
        </div>
        <nav className="foot-links" aria-label="Legal">
          <Link href="/guidelines">Community Guidelines</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/legal/dmca">Copyright / DMCA</Link>
          <a href="mailto:me@davidpuerto.com">Contact</a>
        </nav>
        <div className="foot-copy">© 2026 Unakin LLC. Stand inside the world.</div>
      </div>
    </footer>
  );
}
