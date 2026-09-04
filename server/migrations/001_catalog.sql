-- The hairstyle catalog.
--
-- Metadata only: not one byte of image data lives in here. Every render is an
-- object in R2 and this schema stores the URL, which is the whole point of the
-- decision recorded in docs/catalog-architecture.md. If you are ever tempted to
-- add a `bytea` column, read the "rejected" section there first.
--
-- The shape mirrors src/api/types.ts exactly, because the API's job is to return
-- a `Catalog` the app already knows how to read. Where a column name differs
-- from the field name it is because the word is reserved or ambiguous in SQL
-- (`sort_order` for `order`, `text` for a highlight); the mapping lives in one
-- place, src/catalog.ts.

create table if not exists categories (
  id          text primary key,
  name        text not null,
  tagline     text not null,
  -- Ionicons glyph. Chosen here rather than in the app so a new category is a
  -- row and not a release — see the `icon` fields in src/api/types.ts.
  icon        text not null,
  genders     text[] not null,
  sort_order  integer not null
);

create table if not exists hair_types (
  id          text primary key,
  tier        text not null,
  name        text not null,
  description text not null,
  icon        text not null,
  sort_order  integer not null,
  constraint hair_types_id_domain check (id in ('straight', 'wavy', 'curly', 'coily'))
);

-- `medium` is the anchor rather than a midpoint: it is the cut as the catalog
-- shot it. Every offered range has to contain it. See `HairLengthOffer`.
create table if not exists hair_lengths (
  id          text primary key,
  name        text not null,
  description text not null,
  sort_order  integer not null,
  constraint hair_lengths_id_domain check (id in ('short', 'medium', 'long'))
);

-- A shade is reached by grading a render in the app, never by generating a
-- second image, so this table can grow without costing a generation.
create table if not exists hair_colors (
  id          text primary key,
  name        text not null,
  hex         text not null,
  shade       text not null,
  sort_order  integer not null
);

create table if not exists hairstyles (
  id           text primary key,
  name         text not null,
  description  text not null,
  maintenance  text not null,
  genders      text[] not null,
  tags         text[] not null default '{}',
  best_for     text[] not null default '{}',
  adjustments  text[] not null default '{}',
  popularity   integer not null default 0,
  -- The procedural silhouette descriptor (`HairShape`). Stored whole as jsonb
  -- rather than as nine columns: the app treats it as one opaque value, nothing
  -- queries into it, and its fields are a drawing's parameters rather than
  -- catalog facts.
  shape        jsonb not null,
  -- Set only when a style's hero image is overridden by hand. `<Mannequin>`
  -- prefers it over the render index; normally null.
  image_url    text,
  -- An unpublished style is authored but not served: the switch that makes
  -- "add a hairstyle" safe to do against production.
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint hairstyles_maintenance_domain check (maintenance in ('Low', 'Medium', 'High'))
);

create table if not exists hairstyle_categories (
  hairstyle_id text not null references hairstyles (id) on delete cascade,
  category_id  text not null references categories (id) on delete cascade,
  primary key (hairstyle_id, category_id)
);

-- The hairstyle x hair type matrix, one row per type the style is offered for.
--
-- The absence of a row is meaningful and is the `null` in `HairTypeVariants`:
-- the style is not offered for that type at all. An afro is not a type 1
-- haircut, and that is a judgement about the haircut, which is why it is data.
create table if not exists hairstyle_variants (
  hairstyle_id text not null references hairstyles (id) on delete cascade,
  hair_type_id text not null references hair_types (id),
  variant_id   text not null,
  primary key (hairstyle_id, hair_type_id),
  constraint hairstyle_variants_variant_domain
    check (variant_id in ('any', 'straight', 'wavy', 'curly', 'coily'))
);

-- Which lengths a cut is offered at, per gender. Fewer than two rows for a
-- gender means no slider, which is most of the catalog and deliberately so.
create table if not exists hairstyle_lengths (
  hairstyle_id text not null references hairstyles (id) on delete cascade,
  gender       text not null,
  length_id    text not null references hair_lengths (id),
  primary key (hairstyle_id, gender, length_id),
  constraint hairstyle_lengths_gender_domain check (gender in ('male', 'female'))
);

-- One row per render slot: style x variant x length x gender x angle.
--
-- `url` and `mask_url` are absolute CDN URLs whose path is a content hash, so
-- they are immutable: replacing a render writes a new object and updates this
-- row, and no cache anywhere has to be purged. `source_checksum` is the hash of
-- the *source* PNG on disk, which is how the publish script knows a slot is
-- already up to date and skips both the transcode and the upload.
create table if not exists renders (
  hairstyle_id    text not null references hairstyles (id) on delete cascade,
  variant_id      text not null,
  length_id       text not null references hair_lengths (id),
  gender          text not null,
  angle           text not null,
  url             text not null,
  -- Null is a supported state, not a broken one: a render whose mask failed to
  -- compute is graded whole, which is the documented degraded path in
  -- <Mannequin>.
  mask_url        text,
  width           integer not null,
  height          integer not null,
  bytes           integer not null,
  mask_bytes      integer,
  source_checksum text not null,
  updated_at      timestamptz not null default now(),
  primary key (hairstyle_id, variant_id, length_id, gender, angle),
  constraint renders_variant_domain
    check (variant_id in ('any', 'straight', 'wavy', 'curly', 'coily')),
  constraint renders_gender_domain check (gender in ('male', 'female')),
  constraint renders_angle_domain check (angle in ('front', 'half', 'side', 'back'))
);

create index if not exists renders_hairstyle_idx on renders (hairstyle_id);

-- Server-driven copy for the welcome screen's "why you'll love it" panel.
create table if not exists catalog_highlights (
  id         integer primary key,
  body       text not null,
  sort_order integer not null
);

-- Bumped by every publish. The API turns it into the catalog's ETag, so a
-- client that already has the current catalog gets a 304 and the server does
-- not rebuild the payload.
create table if not exists catalog_revision (
  id         boolean primary key default true,
  revision   bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint catalog_revision_singleton check (id)
);

insert into catalog_revision (id, revision) values (true, 1) on conflict (id) do nothing;
