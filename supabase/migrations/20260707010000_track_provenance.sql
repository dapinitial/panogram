-- Track provenance: WHEN a line was recorded and WHOSE line it is.
--
-- recorded_at — from the GPX's own <time> data. Recency is the most valuable
-- datum in backcountry beta (snowpack varies by year; a track from 3 weeks ago
-- beats a guidebook from 2019) — make it first-class, not buried in the file.
--
-- credit / credit_url — for tracks shared with explicit permission by their
-- recorder (e.g. a trip-report author who says yes). Attribution displays with
-- the overlay; consent is what makes it publishable, credit is how we honor
-- it. Empty for the uploader's own tracks.

alter table tracks add column recorded_at timestamptz;
alter table tracks add column credit     text not null default '' check (char_length(credit) <= 120);
alter table tracks add column credit_url text check (credit_url is null or credit_url ~ '^https?://');
