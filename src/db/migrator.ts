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
  const schemaPath = path.join(rootDir, 'supabase', 'migrations', '0001_initial_schema.sql');

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Migration file not found at: ${schemaPath}`);
  }

  const ddlSql = fs.readFileSync(schemaPath, 'utf8');

  // Execute DDL against PostgreSQL
  await db.query(ddlSql);

  return {
    applied: true,
    details: '0001_initial_schema.sql executed successfully (5 tables, indexes & pgvector).',
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
