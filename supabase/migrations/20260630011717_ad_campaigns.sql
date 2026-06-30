-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Panogram — Monetization v2: advertisers & campaigns                        ║
-- ║                                                                            ║
-- ║ Promotes the ad layer from denormalized labels to real campaign objects.   ║
-- ║ An annotation can now belong to a campaign; ad events attribute to it (via  ║
-- ║ props.campaign_id on the client, resolvable in the data room). Spend is     ║
-- ║ MODELED at each campaign's CPM — this is the surface to actually bill.      ║
-- ║                                                                            ║
-- ║ advertisers/campaigns are operator-managed: admin-readable, written only by ║
-- ║ the secret-key server client (no public/INSERT policies). The ad's display  ║
-- ║ label stays denormalized on the annotation, so the public viewer never      ║
-- ║ needs to read these tables.                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table advertisers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_email text,
  created_at    timestamptz not null default now()
);

create type campaign_status as enum ('active', 'paused', 'ended');

create table campaigns (
  id            uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references advertisers (id) on delete cascade,
  name          text not null,
  cpm_cents     integer not null default 2800,   -- modeled price per 1,000 impressions (USD cents)
  budget_cents  integer,                          -- optional spend cap; null = uncapped
  status        campaign_status not null default 'active',
  created_at    timestamptz not null default now()
);
create index campaigns_advertiser_idx on campaigns (advertiser_id);

-- An annotation may be backed by a campaign (the in-world placement).
alter table annotations add column campaign_id uuid references campaigns (id) on delete set null;
create index annotations_campaign_idx on annotations (campaign_id) where campaign_id is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Operator-only: admins read for the data room; the secret-key client (bypasses
-- RLS) handles all writes. No public access — the public viewer reads the
-- denormalized label off the annotation instead.
alter table advertisers enable row level security;
alter table campaigns   enable row level security;
create policy "admins read advertisers" on advertisers for select using (is_admin());
create policy "admins read campaigns"   on campaigns   for select using (is_admin());

-- ── Seed demo advertisers + campaigns (fixed UUIDs the demo placements use) ──
insert into advertisers (id, name, contact_email) values
  ('a0000000-0000-4000-8000-000000000001', 'Sapporo',        'ads@sapporo.example'),
  ('a0000000-0000-4000-8000-000000000002', 'Papillon Tours', 'ads@papillon.example'),
  ('a0000000-0000-4000-8000-000000000003', 'Panogram House', 'house@panogram.example');

insert into campaigns (id, advertiser_id, name, cpm_cents, budget_cents, status) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Taste the City — Tokyo', 3200, 500000, 'active'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'Grand Canyon Heli',      4500, 300000, 'active'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'Atacama Teleport',       2800, 200000, 'active');
