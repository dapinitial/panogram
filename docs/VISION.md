# Panogram — Vision & Architecture

> Stand in the world instead of scrolling past it.

Panogram is a social platform for **immersive media** — panoramic, 360°, and 180° photos
and video — where the core action isn't viewing a flat image, it's *being somewhere*.

---

## The problem (why this exists)

- Every existing platform **destroys** immersive media: post a 360 or a pano to Instagram and
  it's cropped to a flat rectangle. The capture side is a growing hardware category
  (Insta360, iPhone pano mode in every pocket) with **no good consumer destination.**
- The behavior already exists with nowhere to go — panoramas die in camera rolls.
- Immersive creators (real estate, travel, venues, artists) have no *social* home; they use
  clunky virtual-tour tools that don't compound.

## The wedge (why Instagram won't just copy it)

The defensible moat isn't the *format*, it's the **interactive spatial behavior**, which is
structurally hostile to a flat scrolling feed:

1. **Teleport** — open a link, drag a thumb, you're *there* in under 2 seconds. (The "toilet
   test": can a half-distracted person feel "whoa, I'm there" instantly? That's activation.)
2. **Annotate** — touch and tag specific regions/items in the scene. Notes, links, products,
   stories anchored to a real point in space.
3. **Discover / geocache** — because panos carry geo + heading, annotations map to real-world
   **bearings**; hide things in real places, people go find them. Location-based, IRL pull.

The loop: **teleport (hook) → annotate (depth) → discover (retention) → immersive-native ads (revenue).**
It all rides on *one* schema.

## Distribution advantage

The founder-artist has **~2.4M followers.** Every social app dies at the cold-start problem;
this one skips it — near-zero CAC. **Distribution is the unfair advantage, not the tech.**
That's the headline of any raise. But distribution isn't a business by itself (see below).

## Business model — instrument for all, decide on data

We are deliberately **wedge-neutral at launch** and instrument the full metric tree, letting
early engagement pick the pitch. The three monetizable directions the same product supports:

- **Creator-first social** — the artist's reach seeds it; monetize creators (tips/subs) later.
- **Immersive commerce** — real estate / travel / venues pay to host listings; **annotations
  *are* the commerce surface** (tap the sofa → buy; tap the venue → book).
- **Prosumer SaaS** — the capture→host→embed pipeline as a tool; the feed is top-of-funnel.

### The ad unit: native sponsored teleports (NOT banners)

A banner over Patagonia breaks the spell. The format that *deepens* it: the ad is **a portal
you choose to step through into another real, immersive place** — and the brand is **in-world**,
not overlaid.

> "You've been exploring tropical coastlines… there's a Full Moon party in Tamarindo tonight.
> Want to peer in?" → tap → you're on the stage, people dancing, one of them holding a White Claw.

This sells something no one else can: **measured attention in 3D space** (the system knows you
dwelled on the beach, panned to the DJ booth, tapped the board). Proven intent, not inferred
impressions. **This is also what finally makes ROI a real number** — campaigns are the missing
spend/revenue input, so the funnel terminates in dollars:
`sponsored impression → portal peek → dwell → conversion`.

---

## Metric tree (what the admin dashboard headlines)

**North-star: immersive views / active user / week** — engagement with the *differentiated*
action (actually exploring a scene), not vanity scrolls.

| Layer | Metric |
|---|---|
| Activation | % reaching the magic moment (first `explore_drag` / `annotation_tap`), % who upload |
| Engagement | DAU/WAU/MAU, viewer dwell time, drag-interaction rate, annotation-tap rate |
| Retention | D1/D7/D30, **WAU/MAU stickiness** (the social metric investors watch most) |
| Virality | shares-out, K-factor, geocache finds |
| Conversion | impression → card-click → viewer-open → engaged-explore → like/save/follow → **ad portal peek → conversion** |

Every arrow above maps to a row in the `events` table (see the schema migration).

---

## Honest caveats (design constraints, not afterthoughts)

- **360° video is the cost monster.** 8K, ~3.3 Gbit/s streams, ~$0.045/min transcode. Ship
  **photos first**; gate video (Phase 3) behind real storage/CDN planning.
- **"Map to coordinates" = bearing for free, distance is hard.** A tap gives an exact compass
  *bearing* from the capture point, not a pin. True coordinates need a distance source (depth,
  manual map-tap, or triangulation from 2+ panos). Geocaching works on bearing + proximity
  anyway; triangulation across users becomes a crowdsourced spatial-map **data moat.**
- **Gaze/attention data is sensitive.** Opt-in + aggregate, target on *context* (what's in the
  scene) over *person*, native-teleport format keeps ads additive/chosen. ToS/consent path
  (Resend) must exist before the first real campaign. Don't re-architect under GDPR/CCPA later.
- **Don't build the ad network yet.** Instrument the *substrate* (region dwell, sponsored-marker
  events) so the day you talk to an advertiser you can show "X% stepped through the portal."

---

## Tech stack

- **Next.js 16** (App Router, TypeScript) — interactive, scales if it explodes.
- **Supabase** — Postgres + auth + storage + RLS + realtime.
- **Photo Sphere Viewer** (MIT, three.js) — equirectangular panos + 360 video + VR mode, and a
  built-in **markers plugin** that *is* our annotation layer. The hard rendering is off-the-shelf.
- **Resend** (MIT) — transactional email + consent flows.
- **PostHog** — product analytics on top of the durable `events` table.
- All runtime deps are MIT. The brand/logo/name are the artist's IP (separate from code license).
  Font: **Nunito** (OFL) substitutes for Circular (paid) — keep the substitution unless licensed.

### Supabase account isolation (per-directory)

Matches the `sedulous` / `shotgundetour` convention: `.envrc` (direnv) exports
`SUPABASE_ACCESS_TOKEN` from the macOS keychain (`panogram-supabase`), locking every `supabase`
command in this folder to the panogram account. The CLI checks that token *before* the global
login, so a missing keychain entry fails **safely** rather than hitting the wrong account.
Browser env vars use the `NEXT_PUBLIC_` prefix (Next.js), where the Astro projects use `PUBLIC_`.

---

## Roadmap

- **Phase 1 (now):** Next.js + Supabase shell, port the prototype UI, real panoramic + 360°
  **photo** upload/storage, Photo Sphere Viewer wired to real images, full telemetry + admin
  dashboard, the spatial substrate (annotations, finds, sponsored-marker events).
- **Phase 2:** geocaching loop, community annotations, AI region classification, native sponsored
  teleports (instrument only).
- **Phase 3:** 360° video (transcode/CDN), the real ad/campaign system, WebXR headset mode.
