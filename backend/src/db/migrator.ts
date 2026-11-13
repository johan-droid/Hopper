/**
 * Database Migration & Seeding Runner.
 * Executes initial PostgreSQL + pgvector DDL schema and seed datasets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseExecutor, getDatabaseExecutor } from './client.js';

export interface MigrationResult {
  applied: boolean;
  details: string;
}

export async function runMigrations(
  executor?: DatabaseExecutor,
  rootDir: string = process.cwd()
): Promise<MigrationResult> {
  const db = executor || getDatabaseExecutor();
  let migrationsDir = path.join(rootDir, 'supabase', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    const backendMigrations = path.join(rootDir, 'backend', 'supabase', 'migrations');
    if (fs.existsSync(backendMigrations)) {
      migrationsDir = backendMigrations;
    } else {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && fs.statSync(path.join(migrationsDir, file)).isFile())
    .sort();

  if (migrationFiles.length === 0) {
    throw new Error(`No .sql migration files found in: ${migrationsDir}`);
  }

  // Each migration is idempotent (IF NOT EXISTS), so applying all files in order is safe.
  for (const file of migrationFiles) {
    const ddlSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.query(ddlSql);
  }

  return {
    applied: true,
    details: `${migrationFiles.join(', ')} executed successfully (tables, indexes, HNSW vector index).`,
  };
}

export async function seedInitialData(
  executor?: DatabaseExecutor,
  rootDir: string = process.cwd()
): Promise<MigrationResult> {
  const db = executor || getDatabaseExecutor();
  const seedPath = path.join(rootDir, 'supabase', 'seed.sql');

  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file not found at: ${seedPath}`);
  }

  const seedSql = fs.readFileSync(seedPath, 'utf8');
  await db.query(seedSql);

  return {
    applied: true,
    details: 'seed.sql executed successfully (demo orgs, repo, and failure signatures seeded).',
  };
}
