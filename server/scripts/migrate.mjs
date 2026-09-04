#!/usr/bin/env node
/**
 * Applies every unapplied file in `migrations/`, in name order, once each.
 *
 * Deliberately not a migration framework. The schema is one small read-model
 * that changes when a catalog field changes, and a hand-rolled runner keeps the
 * whole story — what ran, in what order, against which database — in forty lines
 * that anybody can read at 3am. It matches how the rest of this repo treats its
 * tools (`scripts/lib/png.mjs`, `scripts/lib/fal.mjs`).
 *
 *   node scripts/migrate.mjs [--status]
 *
 * Each file runs inside its own transaction, so a failure leaves the database on
 * the last good migration rather than half-way through a bad one.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { loadEnv } from './lib/env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(ROOT);

const statusOnly = process.argv.includes('--status');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — see server/.env.example');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('.railway.internal') ? false : { rejectUnauthorized: false },
});

await client.connect();

await client.query(`
  create table if not exists schema_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  )
`);

const dir = path.join(ROOT, 'migrations');
const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
const applied = new Set((await client.query('select name from schema_migrations')).rows.map((row) => row.name));

if (statusOnly) {
  for (const file of files) console.log(`${applied.has(file) ? '  applied' : '  pending'}  ${file}`);
  await client.end();
  process.exit(0);
}

let ran = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = await readFile(path.join(dir, file), 'utf8');
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into schema_migrations (name) values ($1)', [file]);
    await client.query('commit');
    console.log(`  applied ${file}`);
    ran += 1;
  } catch (error) {
    await client.query('rollback');
    console.error(`  ! ${file} failed: ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(ran ? `${ran} migration(s) applied.` : 'Already up to date.');
await client.end();
