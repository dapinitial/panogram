"use client";

// Last line of defence for the white-label embed: if anything throws at render
// time, show the same quiet dark stage instead of Next's default error page
// ("This page couldn't load") inside the client's iframe.
export default function EmbedError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="embed-stage">
      <div className="embed-missing">
        <span className="embed-missing-glyph" aria-hidden>⛰</span>
        <p>The map couldn&apos;t load.</p>
        <button className="trip-globe-play" style={{ position: "static", transform: "none", marginTop: 12 }} onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
