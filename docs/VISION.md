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

## The annotation layer (AI + crowd + commerce)

The wedge names **annotate** as the depth loop. This is the concrete plan. Every piece rides
the existing markers-plugin schema — nothing here needs a new rendering engine.

**1. AI tagging on upload (Claude vision).** Server-side pipeline: upload → render 4–6
rectilinear views out of the sphere (never feed raw equirectangular — pole distortion confuses
vision models) → Claude tags each view with pixel coords → convert back to yaw/pitch → rows in
an `annotations` table (RLS'd like everything else). Tag vocabulary: trails + trailheads,
flora/fauna (+ traditional uses), geology, visible route lines, points of interest.
**Cost model: bring-your-own-key.** Users run tagging on their own Anthropic API key (sent
per-request, never stored — see CLAUDE.md protocol 10); the server key is an admin-only
fallback. Consumer subscriptions (Claude Max) can't back the hosted route; the founder seeds
AI tags locally through Claude Code sessions at zero marginal cost.

**2. Route overlays are spherical polylines — and climbers can draw them.** Claude traces a
line in a rectilinear view → convert to yaw/pitch → the Photo Sphere Viewer **markers plugin**
renders an SVG polyline that sticks to the rock as you pan. The same pipeline powers a
**topo drawing tool**: a climber freehands the line in the viewer, pointer path converts to
the same spherical polyline schema. Hand-drawn topos are the sacred artifact of climbing
culture (every guidebook is one) — Panogram makes them interactive and spatial. AI-traced and
human-drawn lines share one schema, so a climber *correcting* an AI line is both a better topo
and a labeled training sample. Draw vocabulary extends beyond routes: descent/rappel lines,
approach trails, variation starts. Route *identity* (which named 5.10 is that?) comes from
**OpenBeta** (open-licensed climbing route DB + API) matched by GPS — a line traces the rock,
the database names it. Never let vision guess route names.

**3. The deterministic layer — math, not AI.** Panos carry GPS + compass heading, so `suncalc`
gives exact sun/moon times, and because orientation is known we can draw the sun's arc across
the scene itself ("crests that ridge at 6:42am"). Always correct, zero inference cost.
**Ship this first — it's the cheapest magic in the whole plan.**

**4. Crowdsourced POIs — a sighting is the native comment.** AI proposes; the crowd confirms,
corrects, and adds what vision can't know (cairns, mines, wrecks, water sources, rap stations).
The placeable-POI vocabulary is the backcountry's living map: **camps + bivy sites, water
sources, rappel stations, trailheads, cairns, mines, wrecks** — anything worth knowing is there.
A "sighting" on an annotation is three things at once: a social object (the platform's comment),
a reputation signal, and a triangulation sample. Every additional pano that sees the same
feature from a new position sharpens its real-world coordinates — this is the crowdsourced
spatial-map **data moat** from the caveats section, made concrete. Geocache finds, verified
sightings, and annotation karma are **one** reputation system, not three.

**5. Commerce annotations — "what you need to be here."** Claude reads the scene (glacier
travel → crampons; splitter cracks → cam sizes via OpenBeta) and renders a packing list as a
native annotation — tap the item, buy the item. Affiliate links first (zero sales team needed),
sponsored placements later through the **same sponsored-marker events already in the schema**.
This is the annotations-are-the-commerce-surface thesis with its first concrete SKU.

**6. The safety rail (inviolable).** Anything a life hangs from — rappel stations, bolts,
anchors, "climbable" cracks — is **never displayed as authoritative**. A photo cannot see a
rusted spinner or sun-rotted webbing. AI-detected safety features render in a distinct
*unverified* style with an explicit disclaimer; only community confirmation from verified
ascents upgrades them; "attempt this crack" framing never ships (crack systems are
observations, not endorsements). This rule outranks engagement.

**7. Cultural layer, handled with respect.** Indigenous significance surfaces as *attributed
pointers* — "this area is significant to the Squamish Nation," linking to tribal sources —
never paraphrased sacred stories. Always name the specific nation.

**Seed protocol (ATX→Squamish caravan, summer 2026):** GPS + compass on for every capture;
shoot the same features from multiple positions (the triangulation eval set); record route
names at crags. The trip comes home as both the seed content library *and* the labeled
dataset the vision pipeline gets evaluated against.

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
  dashboard, the spatial substrate (annotations, finds, sponsored-marker events), the
  deterministic sun/moon layer (annotation layer §3 — cheapest magic first).
- **Phase 2:** geocaching loop, AI vision tagging + route overlays (§1–2), crowdsourced POI
  sightings + the unified reputation system (§4), safety-rail styling (§6), native sponsored
  teleports (instrument only).
- **Phase 3:** 360° video (transcode/CDN), commerce annotations / affiliate packing lists (§5),
  the real ad/campaign system, WebXR headset mode.
