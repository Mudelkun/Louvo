/**
 * Writing the authored catalog into Postgres.
 *
 * Split out of `publish-catalog.mjs` so it can be imported rather than run: the
 * publish script is a program with side effects at module scope, and
 * `check-roundtrip.mjs` needs these three functions against an in-memory
 * database with nothing else happening. Being importable is also what makes the
 * round-trip check a real test of the publish path instead of a re-implementation
 * of it.
 *
 * Every function here takes a `client` rather than reaching for one, so the
 * caller owns the transaction. That matters: `renders` has a foreign key onto
 * `hairstyles`, and metadata and imagery are written in one unit or not at all.
 */

const HAIR_TYPE_IDS = ['straight', 'wavy', 'curly', 'coily'];

/**
 * Replaces the reference tables wholesale.
 *
 * Categories, hair types, lengths, colours and highlights are a few dozen rows
 * that are authored as one list, so "reconcile" and "replace" mean the same
 * thing and replace is the one with no drift. Hairstyles are *not* done this way
 * — see `unpublishMissing`.
 */
export async function writeReferenceTables(client, catalog) {
  const insertAll = async (sql, rows) => {
    for (const params of rows) await client.query(sql, params);
  };

  await client.query('delete from catalog_highlights');
  await insertAll('insert into catalog_highlights (id, body, sort_order) values ($1, $2, $3)',
    (catalog.highlights ?? []).map((body, index) => [index + 1, body, index + 1]));

  await insertAll(
    `insert into categories (id, name, tagline, icon, genders, sort_order)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do update set
       name = excluded.name, tagline = excluded.tagline, icon = excluded.icon,
       genders = excluded.genders, sort_order = excluded.sort_order`,
    catalog.categories.map((row) => [row.id, row.name, row.tagline, row.icon, row.genders, row.order]),
  );

  await insertAll(
    `insert into hair_types (id, tier, name, description, icon, sort_order)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do update set
       tier = excluded.tier, name = excluded.name, description = excluded.description,
       icon = excluded.icon, sort_order = excluded.sort_order`,
    catalog.hairTypes.map((row) => [row.id, row.tier, row.name, row.description, row.icon, row.order]),
  );

  await insertAll(
    `insert into hair_lengths (id, name, description, sort_order)
     values ($1, $2, $3, $4)
     on conflict (id) do update set
       name = excluded.name, description = excluded.description, sort_order = excluded.sort_order`,
    catalog.hairLengths.map((row) => [row.id, row.name, row.description, row.order]),
  );

  await insertAll(
    `insert into hair_colors (id, name, hex, shade, sort_order)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set
       name = excluded.name, hex = excluded.hex, shade = excluded.shade, sort_order = excluded.sort_order`,
    catalog.colors.map((row, index) => [row.id, row.name, row.hex, row.shade, index + 1]),
  );
}

export async function writeHairstyle(client, style) {
  await client.query(
    `insert into hairstyles
       (id, name, description, maintenance, genders, tags, best_for, adjustments,
        popularity, shape, image_url, published, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, now())
     on conflict (id) do update set
       name = excluded.name, description = excluded.description,
       maintenance = excluded.maintenance, genders = excluded.genders,
       tags = excluded.tags, best_for = excluded.best_for,
       adjustments = excluded.adjustments, popularity = excluded.popularity,
       shape = excluded.shape, image_url = excluded.image_url,
       published = true, updated_at = now()`,
    [
      style.id,
      style.name,
      style.description,
      style.maintenance,
      style.genders,
      style.tags ?? [],
      style.bestFor ?? [],
      style.adjustments ?? [],
      style.popularity ?? 0,
      JSON.stringify(style.shape),
      style.imageUrl ?? null,
    ],
  );

  // The three join tables are rewritten rather than merged. Each is a small,
  // wholly-authored set, and a merge would silently keep a category a style was
  // removed from — which is the one kind of catalog error nobody notices.
  await client.query('delete from hairstyle_categories where hairstyle_id = $1', [style.id]);
  for (const categoryId of style.categoryIds ?? []) {
    await client.query(
      'insert into hairstyle_categories (hairstyle_id, category_id) values ($1, $2) on conflict do nothing',
      [style.id, categoryId],
    );
  }

  // A hair type with no variant gets no row: absence *is* "not offered for this
  // type", which is how the matrix says an afro is not a type 1 haircut.
  await client.query('delete from hairstyle_variants where hairstyle_id = $1', [style.id]);
  for (const hairType of HAIR_TYPE_IDS) {
    const variant = style.variants?.[hairType];
    if (!variant) continue;
    await client.query(
      'insert into hairstyle_variants (hairstyle_id, hair_type_id, variant_id) values ($1, $2, $3)',
      [style.id, hairType, variant],
    );
  }

  await client.query('delete from hairstyle_lengths where hairstyle_id = $1', [style.id]);
  for (const [gender, lengths] of Object.entries(style.lengths ?? {})) {
    for (const lengthId of lengths ?? []) {
      await client.query(
        'insert into hairstyle_lengths (hairstyle_id, gender, length_id) values ($1, $2, $3)',
        [style.id, gender, lengthId],
      );
    }
  }
}

/**
 * Hides styles the authored catalog no longer contains, rather than deleting
 * them.
 *
 * A saved look references a hairstyle id, and a user who saved a preview of a
 * cut that has since been retired should still see what it was called. So a
 * removal is `published = false`: gone from the catalog, still resolvable.
 * Only on a full run — `--style` has no idea what else exists.
 */
export async function unpublishMissing(client, catalog) {
  const ids = catalog.hairstyles.map((style) => style.id);
  const { rows } = await client.query(
    'update hairstyles set published = false, updated_at = now() where published and not (id = any($1)) returning id',
    [ids],
  );
  return rows.map((row) => row.id);
}
