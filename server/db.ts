import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { DatabaseSync as NodeDatabaseSync } from 'node:sqlite';
import { PDF_ANNUAL_SCHEDULE } from './pdfSchedule.ts';

type DatabaseSync = NodeDatabaseSync;

const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION,
);
const DATA_DIR = IS_SERVERLESS
  ? path.join('/tmp', 'masjid-bilal-data')
  : path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'masjid_bilal.db');

let dbInstance: DatabaseSync | null = null;

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { hash: derived, salt: usedSalt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const req = createRequire(import.meta.url);
  const { DatabaseSync: SqliteDatabaseSync } = req('node:sqlite') as {
    DatabaseSync: typeof NodeDatabaseSync;
  };
  const db = new SqliteDatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS mosque_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mosque_name_en TEXT NOT NULL DEFAULT 'MASJID-E-BILAL',
      mosque_name_ar TEXT NOT NULL DEFAULT 'مسجدِ بلال',
      zuhr_fixed_time TEXT NOT NULL DEFAULT '13:30',
      jumuah_bayan_time TEXT NOT NULL DEFAULT '12:30',
      jumuah_khutbah_time TEXT NOT NULL DEFAULT '13:15',
      jumuah_time TEXT NOT NULL DEFAULT '13:30',
      jumuah_show_all_week INTEGER NOT NULL DEFAULT 1,
      jumuah_note_en TEXT NOT NULL DEFAULT '',
      jumuah_note_ur TEXT NOT NULL DEFAULT '',
      maghrib_auto_enabled INTEGER NOT NULL DEFAULT 1,
      maghrib_offset_minutes INTEGER NOT NULL DEFAULT 0,
      maghrib_manual_override TEXT,
      karachi_city TEXT NOT NULL DEFAULT 'Karachi',
      karachi_country TEXT NOT NULL DEFAULT 'Pakistan',
      karachi_lat REAL NOT NULL DEFAULT 24.8607,
      karachi_lng REAL NOT NULL DEFAULT 67.0011,
      calculation_method INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prayer_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
      fajr TEXT,
      asr TEXT,
      isha TEXT,
      is_default_pdf INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(month, day)
    );

    CREATE TABLE IF NOT EXISTS prayer_overrides (
      prayer_name TEXT PRIMARY KEY CHECK (prayer_name IN ('fajr', 'zuhr', 'asr', 'maghrib', 'isha')),
      override_time TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_maghrib_times (
      karachi_date TEXT PRIMARY KEY,
      sunset_time TEXT NOT NULL,
      maghrib_api_time TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'aladhan',
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hijri_date_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      adjustment_days INTEGER NOT NULL DEFAULT 0 CHECK (adjustment_days IN (-1, 0, 1)),
      manual_override_enabled INTEGER NOT NULL DEFAULT 0,
      manual_hijri_day INTEGER,
      manual_hijri_month_en TEXT,
      manual_hijri_month_ar TEXT,
      manual_hijri_year INTEGER,
      cached_karachi_date TEXT,
      cached_hijri_day INTEGER,
      cached_hijri_month_number INTEGER,
      cached_hijri_month_en TEXT,
      cached_hijri_month_ar TEXT,
      cached_hijri_year INTEGER,
      cached_weekday_ar TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_en TEXT NOT NULL,
      title_ur TEXT NOT NULL DEFAULT '',
      body_en TEXT NOT NULL,
      body_ur TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('important', 'timing', 'jumuah', 'eid', 'general')),
      is_published INTEGER NOT NULL DEFAULT 1,
      start_date TEXT,
      expiry_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eid_prayer (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      is_active INTEGER NOT NULL DEFAULT 0,
      eid_type TEXT NOT NULL DEFAULT 'fitr' CHECK (eid_type IN ('fitr', 'adha')),
      prayer_date TEXT NOT NULL DEFAULT '',
      prayer_time TEXT NOT NULL DEFAULT '',
      note_en TEXT NOT NULL DEFAULT '',
      note_ur TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'administrator',
      is_default_seeded INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_or_token TEXT NOT NULL UNIQUE,
      device_label TEXT NOT NULL DEFAULT 'Web Browser',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_dispatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_astronomical_times (
      karachi_date TEXT PRIMARY KEY,
      fajr_start TEXT NOT NULL,
      sunrise TEXT NOT NULL,
      dhuhr_start TEXT NOT NULL,
      asr_hanafi TEXT NOT NULL,
      asr_standard TEXT NOT NULL,
      sunset TEXT NOT NULL,
      maghrib_start TEXT NOT NULL,
      isha_start TEXT NOT NULL,
      midnight TEXT NOT NULL,
      first_third TEXT NOT NULL,
      next_fajr_start TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'aladhan',
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS qaza_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled_on_public INTEGER NOT NULL DEFAULT 1,
      jurisprudence_policy TEXT NOT NULL DEFAULT 'hanafi' CHECK (jurisprudence_policy IN ('hanafi', 'standard')),
      zuhr_end_rule TEXT NOT NULL DEFAULT 'asr_hanafi' CHECK (zuhr_end_rule IN ('asr_hanafi', 'asr_standard')),
      maghrib_end_rule TEXT NOT NULL DEFAULT 'isha_start' CHECK (maghrib_end_rule IN ('isha_start')),
      isha_end_rule TEXT NOT NULL DEFAULT 'subh_sadiq' CHECK (isha_end_rule IN ('subh_sadiq', 'islamic_midnight', 'first_third')),
      warning_threshold_minutes INTEGER NOT NULL DEFAULT 20,
      manual_override_fajr_end TEXT,
      manual_override_zuhr_end TEXT,
      manual_override_asr_end TEXT,
      manual_override_maghrib_end TEXT,
      manual_override_isha_end TEXT,
      authority_verified_note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Ensure older DBs have is_default_seeded column
  const cols = db.prepare(`PRAGMA table_info(admin_users)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'is_default_seeded')) {
    db.exec(`ALTER TABLE admin_users ADD COLUMN is_default_seeded INTEGER NOT NULL DEFAULT 1;`);
  }

  // Ensure older DBs have structured Friday prayer timings
  const mosqueCols = db.prepare(`PRAGMA table_info(mosque_settings)`).all() as Array<{ name: string }>;
  if (!mosqueCols.some((c) => c.name === 'jumuah_bayan_time')) {
    db.exec(`ALTER TABLE mosque_settings ADD COLUMN jumuah_bayan_time TEXT NOT NULL DEFAULT '12:30';`);
  }
  if (!mosqueCols.some((c) => c.name === 'jumuah_khutbah_time')) {
    db.exec(`ALTER TABLE mosque_settings ADD COLUMN jumuah_khutbah_time TEXT NOT NULL DEFAULT '13:15';`);
  }
  // Initialize default Jumu'ah time (1:30 PM) only if previously blank/unconfigured
  db.prepare(
    `UPDATE mosque_settings SET jumuah_time = '13:30', jumuah_show_all_week = 1 WHERE id = 1 AND (jumuah_time IS NULL OR jumuah_time = '')`,
  ).run();
  // One-time cleanup if legacy pre-redesign note held duplicated Bayan/Khutbah/Salah text
  db.prepare(
    `UPDATE mosque_settings
     SET jumuah_time = '13:30',
         jumuah_bayan_time = '12:30',
         jumuah_khutbah_time = '13:15',
         jumuah_show_all_week = 1,
         jumuah_note_en = '',
         jumuah_note_ur = ''
     WHERE id = 1 AND jumuah_note_en LIKE 'Bayan Starts: 12:30 PM%'`,
  ).run();

  seedInitialData(db);
  dbInstance = db;
  return db;
}

function seedInitialData(db: DatabaseSync): void {
  db.prepare(`INSERT OR IGNORE INTO mosque_settings (id) VALUES (1)`).run();
  db.prepare(`INSERT OR IGNORE INTO hijri_date_settings (id) VALUES (1)`).run();
  db.prepare(`INSERT OR IGNORE INTO eid_prayer (id) VALUES (1)`).run();
  db.prepare(`INSERT OR IGNORE INTO qaza_settings (id) VALUES (1)`).run();

  const prayers = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
  const insertOverride = db.prepare(
    `INSERT OR IGNORE INTO prayer_overrides (prayer_name, override_time, is_active) VALUES (?, NULL, 0)`,
  );
  for (const p of prayers) {
    insertOverride.run(p);
  }

  const scheduleCount = db.prepare(`SELECT COUNT(*) AS count FROM prayer_schedule`).get() as { count: number };
  if (scheduleCount.count === 0) {
    restorePdfSchedule(db);
  }

  const envUsername = process.env.ADMIN_INITIAL_USERNAME?.trim();
  const envPassword = process.env.ADMIN_INITIAL_PASSWORD;
  
  // Ensure default admin user 'admin' with password 'BilalAdmin2026!' always exists
  const existingAdmin = db.prepare(`SELECT id FROM admin_users WHERE LOWER(username) = 'admin'`).get();
  if (!existingAdmin) {
    const { hash, salt } = hashPassword('BilalAdmin2026!');
    db.prepare(
      `INSERT INTO admin_users (username, password_hash, salt, role, is_default_seeded) VALUES ('admin', ?, ?, 'administrator', 1)`,
    ).run(hash, salt);
  }

  // If environment secret username/password is specified, ensure that user also exists or is synced
  if (envUsername && envUsername.toLowerCase() !== 'admin') {
    const customAdmin = db.prepare(`SELECT id FROM admin_users WHERE LOWER(username) = LOWER(?)`).get(envUsername);
    const password = envPassword || 'BilalAdmin2026!';
    const { hash, salt } = hashPassword(password);
    if (!customAdmin) {
      db.prepare(
        `INSERT INTO admin_users (username, password_hash, salt, role, is_default_seeded) VALUES (?, ?, ?, 'administrator', 1)`,
      ).run(envUsername, hash, salt);
    } else if (envPassword) {
      db.prepare(`UPDATE admin_users SET password_hash = ?, salt = ? WHERE id = ?`).run(
        hash,
        salt,
        (customAdmin as { id: number }).id,
      );
    }
  }
}

export function restorePdfSchedule(db: DatabaseSync): void {
  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM prayer_schedule`).run();
    const insert = db.prepare(
      `INSERT INTO prayer_schedule (month, day, fajr, asr, isha, is_default_pdf) VALUES (?, ?, ?, ?, ?, 1)`,
    );
    for (const row of PDF_ANNUAL_SCHEDULE) {
      insert.run(row.month, row.day, row.fajr, row.asr, row.isha);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
