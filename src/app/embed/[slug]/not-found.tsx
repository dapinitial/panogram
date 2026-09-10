// Shown inside the client's iframe when a trip is unpublished, deleted, or the
// slug is wrong. Without this, Next's default white "404 | This page could not
// be found" would render on a white-label site. Keep it dark, neutral, quiet.
export default function EmbedNotFound() {
  return (
    <main className="embed-stage">
      <div className="embed-missing">
        <span className="embed-missing-glyph" aria-hidden>⛰</span>
        <p>This trip isn&apos;t available right now.</p>
      </div>
    </main>
  );
}
