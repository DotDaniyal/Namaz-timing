import 'dotenv/config';
import express from 'express';
import { fetchAndCacheKarachiDailyData, getKarachiDateInfo } from './aladhan.ts';
import {
  clearSessionCookie,
  createSessionToken,
  getAuthenticatedAdmin,
  requireAdmin,
  setSessionCookie,
} from './auth.ts';
import { getDb, hashPassword, restorePdfSchedule, verifyPassword } from './db.ts';
import {
  PDF_ANNUAL_SCHEDULE,
  isValidTime24,
  resolveAnnualTimingsForDate,
  type ScheduleRow,
} from './pdfSchedule.ts';
import { buildTodayTimetablePayload } from './timetableService.ts';

export function createApiApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // ---------------------------------------------------------------------------
  // PUBLIC API ROUTES
  // ---------------------------------------------------------------------------

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timezone: 'Asia/Karachi', karachiDate: getKarachiDateInfo().isoDate });
  });

  app.get('/api/timetable/today', async (_req, res) => {
    try {
      const payload = await buildTodayTimetablePayload(false);
      res.json(payload);
    } catch {
      try {
        const { buildClientFallbackTimetable } = await import(
          '../src/utils/fallbackTimetable.ts'
        );
        const fallback = await buildClientFallbackTimetable();
        res.json(fallback);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message || 'Failed to load timetable' });
      }
    }
  });

  app.get('/api/schedule/annual', (_req, res) => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT id, month, day, fajr, asr, isha, is_default_pdf FROM prayer_schedule ORDER BY month ASC, day ASC`,
        )
        .all() as unknown as ScheduleRow[];
      res.json({ rows });
    } catch {
      const rows = PDF_ANNUAL_SCHEDULE.map((row, idx) => ({
        id: idx + 1,
        ...row,
        is_default_pdf: 1,
      }));
      res.json({ rows });
    }
  });

  app.get('/api/timetable/date', (req, res) => {
    const month = Number(req.query.month);
    const day = Number(req.query.day);
    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31
    ) {
      res.status(400).json({ error: 'Invalid month or day' });
      return;
    }
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, month, day, fajr, asr, isha, is_default_pdf FROM prayer_schedule ORDER BY month ASC, day ASC`,
      )
      .all() as unknown as ScheduleRow[];
    const resolved = resolveAnnualTimingsForDate(rows, month, day);
    const settings = db.prepare(`SELECT zuhr_fixed_time FROM mosque_settings WHERE id = 1`).get() as {
      zuhr_fixed_time: string;
    };
    res.json({
      month,
      day,
      fajr: resolved.fajr,
      zuhr: settings.zuhr_fixed_time || '13:30',
      asr: resolved.asr,
      isha: resolved.isha,
      effectiveFrom: resolved.effectiveFrom,
    });
  });

  // Notification subscriptions (visitor opt-in)
  app.post('/api/notifications/subscribe', (req, res) => {
    const { endpointOrToken, deviceLabel } = req.body || {};
    if (!endpointOrToken || typeof endpointOrToken !== 'string') {
      res.status(400).json({ error: 'Valid subscription token is required' });
      return;
    }
    const db = getDb();
    db.prepare(
      `INSERT INTO notification_subscriptions (endpoint_or_token, device_label, is_active)
       VALUES (?, ?, 1)
       ON CONFLICT(endpoint_or_token) DO UPDATE SET is_active = 1, device_label = excluded.device_label`,
    ).run(endpointOrToken.slice(0, 500), String(deviceLabel || 'Web Browser').slice(0, 100));
    res.json({ subscribed: true });
  });

  app.post('/api/notifications/unsubscribe', (req, res) => {
    const { endpointOrToken } = req.body || {};
    if (!endpointOrToken || typeof endpointOrToken !== 'string') {
      res.status(400).json({ error: 'Subscription token is required' });
      return;
    }
    const db = getDb();
    db.prepare(`UPDATE notification_subscriptions SET is_active = 0 WHERE endpoint_or_token = ?`).run(
      endpointOrToken.slice(0, 500),
    );
    res.json({ subscribed: false });
  });

  app.get('/api/notifications/latest', (req, res) => {
    const sinceId = Number(req.query.sinceId || 0);
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, announcement_id, title, body, created_at FROM notification_dispatches WHERE id > ? ORDER BY id DESC LIMIT 10`,
      )
      .all(Number.isFinite(sinceId) ? sinceId : 0);
    res.json({ dispatches: rows });
  });

  // ---------------------------------------------------------------------------
  // ADMIN AUTH ROUTES
  // ---------------------------------------------------------------------------

  app.get('/api/admin/session', (req, res) => {
    try {
      const admin = getAuthenticatedAdmin(req);
      if (!admin) {
        res.json({ authenticated: false });
        return;
      }
      res.json({ authenticated: true, username: admin.username, role: admin.role });
    } catch {
      res.json({ authenticated: false });
    }
  });

  app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body || {};
    const cleanUser = String(username || '').trim();
    const rawPass = String(password || '');
    const trimmedPass = rawPass.trim();

    if (!cleanUser || !rawPass) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }
    const db = getDb();
    const user = db
      .prepare(
        `SELECT id, username, password_hash, salt, role FROM admin_users WHERE LOWER(username) = LOWER(?)`,
      )
      .get(cleanUser) as
      | { id: number; username: string; password_hash: string; salt: string; role: string }
      | undefined;

    const passwordMatches =
      Boolean(user) &&
      (verifyPassword(rawPass, user!.password_hash, user!.salt) ||
        (trimmedPass !== rawPass && verifyPassword(trimmedPass, user!.password_hash, user!.salt)));

    if (!user || !passwordMatches) {
      res.status(401).json({ error: 'Invalid administrator credentials' });
      return;
    }

    const token = createSessionToken({ userId: user.id, username: user.username, role: user.role });
    setSessionCookie(req, res, token);
    res.json({ authenticated: true, username: user.username, role: user.role, token });
  });

  app.post('/api/admin/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/admin/change-password', requireAdmin, (req, res) => {
    const admin = (req as express.Request & { admin: { userId: number } }).admin;
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || String(newPassword).length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }
    const db = getDb();
    const user = db
      .prepare(`SELECT id, password_hash, salt FROM admin_users WHERE id = ?`)
      .get(admin.userId) as { id: number; password_hash: string; salt: string };
    if (!verifyPassword(String(currentPassword), user.password_hash, user.salt)) {
      res.status(403).json({ error: 'Current password is incorrect' });
      return;
    }
    const { hash, salt } = hashPassword(String(newPassword));
    db.prepare(
      `UPDATE admin_users SET password_hash = ?, salt = ?, is_default_seeded = 0 WHERE id = ?`,
    ).run(hash, salt, admin.userId);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // PROTECTED ADMIN PANEL ROUTES
  // ---------------------------------------------------------------------------

  app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
    try {
      const db = getDb();
      const timetable = await buildTodayTimetablePayload(false);
      const settings = db.prepare(`SELECT * FROM mosque_settings WHERE id = 1`).get();
      const overrides = db.prepare(`SELECT * FROM prayer_overrides`).all();
      const schedule = db
        .prepare(
          `SELECT id, month, day, fajr, asr, isha, is_default_pdf FROM prayer_schedule ORDER BY month ASC, day ASC`,
        )
        .all();
      const hijriSettings = db.prepare(`SELECT * FROM hijri_date_settings WHERE id = 1`).get();
      const qazaSettings = db.prepare(`SELECT * FROM qaza_settings WHERE id = 1`).get();
      const announcements = db.prepare(`SELECT * FROM announcements ORDER BY id DESC`).all();
      const eid = db.prepare(`SELECT * FROM eid_prayer WHERE id = 1`).get();
      const subCount = db
        .prepare(`SELECT COUNT(*) AS count FROM notification_subscriptions WHERE is_active = 1`)
        .get() as { count: number };

      res.json({
        timetable,
        settings,
        overrides,
        schedule,
        hijriSettings,
        qazaSettings,
        announcements,
        eid,
        activeSubscribers: subCount.count,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Update active prayer manual overrides (Fajr, Zuhr, Asr, Maghrib, Isha)
  app.put('/api/admin/overrides', requireAdmin, (req, res) => {
    const { prayerName, overrideTime, isActive } = req.body || {};
    const allowed = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
    if (!allowed.includes(prayerName)) {
      res.status(400).json({ error: 'Invalid prayer name' });
      return;
    }
    if (isActive && (!overrideTime || !isValidTime24(String(overrideTime)))) {
      res.status(400).json({ error: 'Valid HH:MM 24-hour time is required when override is active' });
      return;
    }
    const db = getDb();
    db.prepare(
      `UPDATE prayer_overrides SET override_time = ?, is_active = ?, updated_at = datetime('now') WHERE prayer_name = ?`,
    ).run(overrideTime ? String(overrideTime) : null, isActive ? 1 : 0, prayerName);
    res.json({ ok: true });
  });

  app.post('/api/admin/overrides/reset-all', requireAdmin, (_req, res) => {
    const db = getDb();
    db.prepare(
      `UPDATE prayer_overrides SET override_time = NULL, is_active = 0, updated_at = datetime('now')`,
    ).run();
    res.json({ ok: true });
  });

  // Annual Schedule Management (CRUD + Restore PDF defaults)
  app.post('/api/admin/schedule', requireAdmin, (req, res) => {
    const { month, day, fajr, asr, isha } = req.body || {};
    const m = Number(month);
    const d = Number(day);
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > 31) {
      res.status(400).json({ error: 'Valid month (1-12) and day (1-31) required' });
      return;
    }
    const clean = (val: unknown): string | null => {
      if (val === null || val === undefined || val === '') return null;
      const str = String(val).trim();
      if (!isValidTime24(str)) throw new Error(`Invalid time format: ${str}`);
      return str;
    };
    try {
      const f = clean(fajr);
      const a = clean(asr);
      const i = clean(isha);
      if (!f && !a && !i) {
        res.status(400).json({ error: 'Provide at least one prayer time (Fajr, Asr, or Isha)' });
        return;
      }
      const db = getDb();
      db.prepare(
        `INSERT INTO prayer_schedule (month, day, fajr, asr, isha, is_default_pdf, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
         ON CONFLICT(month, day) DO UPDATE SET
           fajr = excluded.fajr,
           asr = excluded.asr,
           isha = excluded.isha,
           is_default_pdf = 0,
           updated_at = datetime('now')`,
      ).run(m, d, f, a, i);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.put('/api/admin/schedule/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const { month, day, fajr, asr, isha } = req.body || {};
    const m = Number(month);
    const d = Number(day);
    if (
      !Number.isInteger(id) ||
      !Number.isInteger(m) ||
      m < 1 ||
      m > 12 ||
      !Number.isInteger(d) ||
      d < 1 ||
      d > 31
    ) {
      res.status(400).json({ error: 'Invalid schedule entry parameters' });
      return;
    }
    const clean = (val: unknown): string | null => {
      if (val === null || val === undefined || val === '') return null;
      const str = String(val).trim();
      if (!isValidTime24(str)) throw new Error(`Invalid time format: ${str}`);
      return str;
    };
    try {
      const f = clean(fajr);
      const a = clean(asr);
      const i = clean(isha);
      const db = getDb();
      db.prepare(
        `UPDATE prayer_schedule SET month = ?, day = ?, fajr = ?, asr = ?, isha = ?, is_default_pdf = 0, updated_at = datetime('now') WHERE id = ?`,
      ).run(m, d, f, a, i, id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/admin/schedule/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid schedule ID' });
      return;
    }
    const db = getDb();
    db.prepare(`DELETE FROM prayer_schedule WHERE id = ?`).run(id);
    res.json({ ok: true });
  });

  app.post('/api/admin/schedule/restore-pdf', requireAdmin, (_req, res) => {
    const db = getDb();
    restorePdfSchedule(db);
    res.json({ ok: true });
  });

  // Maghrib & Karachi Location Settings
  app.put('/api/admin/maghrib', requireAdmin, async (req, res) => {
    const { autoEnabled, offsetMinutes, manualOverride, karachiCity, karachiCountry, resetToAuto } =
      req.body || {};
    const db = getDb();

    if (resetToAuto) {
      db.prepare(
        `UPDATE mosque_settings SET maghrib_auto_enabled = 1, maghrib_manual_override = NULL, updated_at = datetime('now') WHERE id = 1`,
      ).run();
      db.prepare(
        `UPDATE prayer_overrides SET override_time = NULL, is_active = 0, updated_at = datetime('now') WHERE prayer_name = 'maghrib'`,
      ).run();
      await fetchAndCacheKarachiDailyData(db, true);
      res.json({ ok: true });
      return;
    }

    const offset = Number(offsetMinutes ?? 0);
    if (!Number.isInteger(offset) || offset < -30 || offset > 60) {
      res.status(400).json({ error: 'Offset must be an integer between -30 and 60 minutes' });
      return;
    }
    if (manualOverride && !isValidTime24(String(manualOverride))) {
      res.status(400).json({ error: 'Manual Maghrib time must be HH:MM (24h)' });
      return;
    }

    db.prepare(
      `UPDATE mosque_settings SET
         maghrib_auto_enabled = ?,
         maghrib_offset_minutes = ?,
         maghrib_manual_override = ?,
         karachi_city = ?,
         karachi_country = ?,
         updated_at = datetime('now')
       WHERE id = 1`,
    ).run(
      autoEnabled ? 1 : 0,
      offset,
      manualOverride ? String(manualOverride) : null,
      String(karachiCity || 'Karachi').trim(),
      String(karachiCountry || 'Pakistan').trim(),
    );

    if (autoEnabled) {
      db.prepare(
        `UPDATE prayer_overrides SET override_time = NULL, is_active = 0, updated_at = datetime('now') WHERE prayer_name = 'maghrib'`,
      ).run();
    }

    res.json({ ok: true });
  });

  app.post('/api/admin/maghrib/refresh', requireAdmin, async (_req, res) => {
    const db = getDb();
    const result = await fetchAndCacheKarachiDailyData(db, true);
    res.json({ ok: true, result });
  });

  // Jumu'ah Prayer Settings
  app.put('/api/admin/jumuah', requireAdmin, (req, res) => {
    const { bayanTime, khutbahTime, jumuahTime, showAllWeek, noteEn, noteUr } = req.body || {};
    const cleanBayan = bayanTime ? String(bayanTime).trim() : '';
    const cleanKhutbah = khutbahTime ? String(khutbahTime).trim() : '';
    const cleanTime = jumuahTime ? String(jumuahTime).trim() : '';
    if (cleanBayan && !isValidTime24(cleanBayan)) {
      res.status(400).json({ error: 'Bayan time must be HH:MM (24h)' });
      return;
    }
    if (cleanKhutbah && !isValidTime24(cleanKhutbah)) {
      res.status(400).json({ error: 'Khutbah time must be HH:MM (24h)' });
      return;
    }
    if (cleanTime && !isValidTime24(cleanTime)) {
      res.status(400).json({ error: 'Jumuah time must be HH:MM (24h)' });
      return;
    }
    const db = getDb();
    db.prepare(
      `UPDATE mosque_settings SET
         jumuah_bayan_time = ?,
         jumuah_khutbah_time = ?,
         jumuah_time = ?,
         jumuah_show_all_week = ?,
         jumuah_note_en = ?,
         jumuah_note_ur = ?,
         updated_at = datetime('now')
       WHERE id = 1`,
    ).run(
      cleanBayan || '12:30',
      cleanKhutbah || '13:15',
      cleanTime || '13:30',
      showAllWeek ? 1 : 0,
      String(noteEn || ''),
      String(noteUr || ''),
    );
    res.json({ ok: true });
  });

  // Hijri Date Settings
  app.put('/api/admin/hijri', requireAdmin, async (req, res) => {
    const {
      adjustmentDays,
      manualOverrideEnabled,
      manualHijriDay,
      manualHijriMonthEn,
      manualHijriMonthAr,
      manualHijriYear,
      resetToApi,
    } = req.body || {};
    const db = getDb();

    if (resetToApi) {
      db.prepare(
        `UPDATE hijri_date_settings SET
           adjustment_days = 0,
           manual_override_enabled = 0,
           manual_hijri_day = NULL,
           manual_hijri_month_en = NULL,
           manual_hijri_month_ar = NULL,
           manual_hijri_year = NULL,
           updated_at = datetime('now')
         WHERE id = 1`,
      ).run();
      await fetchAndCacheKarachiDailyData(db, true);
      res.json({ ok: true });
      return;
    }

    const adj = Number(adjustmentDays ?? 0);
    if (![-1, 0, 1].includes(adj)) {
      res.status(400).json({ error: 'Hijri adjustment must be -1, 0, or 1' });
      return;
    }

    db.prepare(
      `UPDATE hijri_date_settings SET
         adjustment_days = ?,
         manual_override_enabled = ?,
         manual_hijri_day = ?,
         manual_hijri_month_en = ?,
         manual_hijri_month_ar = ?,
         manual_hijri_year = ?,
         updated_at = datetime('now')
       WHERE id = 1`,
    ).run(
      adj,
      manualOverrideEnabled ? 1 : 0,
      manualHijriDay ? Number(manualHijriDay) : null,
      manualHijriMonthEn ? String(manualHijriMonthEn).trim() : null,
      manualHijriMonthAr ? String(manualHijriMonthAr).trim() : null,
      manualHijriYear ? Number(manualHijriYear) : null,
    );

    await fetchAndCacheKarachiDailyData(db, true);
    res.json({ ok: true });
  });

  // Prayer Ending & Qaza Settings
  app.put('/api/admin/qaza', requireAdmin, (req, res) => {
    const {
      enabledOnPublic,
      jurisprudencePolicy,
      zuhrEndRule,
      ishaEndRule,
      warningThresholdMinutes,
      manualFajrEnd,
      manualZuhrEnd,
      manualAsrEnd,
      manualMaghribEnd,
      manualIshaEnd,
      authorityVerifiedNote,
    } = req.body || {};

    const policy = jurisprudencePolicy === 'standard' ? 'standard' : 'hanafi';
    const zuhrRule = zuhrEndRule === 'asr_standard' ? 'asr_standard' : 'asr_hanafi';
    const ishaRule = ['subh_sadiq', 'islamic_midnight', 'first_third'].includes(ishaEndRule)
      ? ishaEndRule
      : 'subh_sadiq';
    const warnMin = Number(warningThresholdMinutes ?? 20);
    if (!Number.isInteger(warnMin) || warnMin < 0 || warnMin > 90) {
      res.status(400).json({ error: 'Warning threshold must be between 0 and 90 minutes' });
      return;
    }

    const cleanOverride = (v: unknown, label: string): string | null => {
      if (v === null || v === undefined || String(v).trim() === '') return null;
      const str = String(v).trim();
      if (!isValidTime24(str)) throw new Error(`Invalid ${label} ending time format (HH:MM)`);
      return str;
    };

    try {
      const f = cleanOverride(manualFajrEnd, 'Fajr');
      const z = cleanOverride(manualZuhrEnd, 'Zuhr');
      const a = cleanOverride(manualAsrEnd, 'Asr');
      const m = cleanOverride(manualMaghribEnd, 'Maghrib');
      const i = cleanOverride(manualIshaEnd, 'Isha');

      const db = getDb();
      db.prepare(
        `UPDATE qaza_settings SET
           enabled_on_public = ?,
           jurisprudence_policy = ?,
           zuhr_end_rule = ?,
           isha_end_rule = ?,
           warning_threshold_minutes = ?,
           manual_override_fajr_end = ?,
           manual_override_zuhr_end = ?,
           manual_override_asr_end = ?,
           manual_override_maghrib_end = ?,
           manual_override_isha_end = ?,
           authority_verified_note = ?,
           updated_at = datetime('now')
         WHERE id = 1`,
      ).run(
        enabledOnPublic ? 1 : 0,
        policy,
        zuhrRule,
        ishaRule,
        warnMin,
        f,
        z,
        a,
        m,
        i,
        String(authorityVerifiedNote || '').trim(),
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/admin/qaza/reset', requireAdmin, async (req, res) => {
    const { prayerName } = req.body || {};
    const colMap: Record<string, string> = {
      fajr: 'manual_override_fajr_end',
      zuhr: 'manual_override_zuhr_end',
      asr: 'manual_override_asr_end',
      maghrib: 'manual_override_maghrib_end',
      isha: 'manual_override_isha_end',
    };
    const db = getDb();

    if (prayerName && colMap[prayerName]) {
      db.prepare(
        `UPDATE qaza_settings SET ${colMap[prayerName]} = NULL, updated_at = datetime('now') WHERE id = 1`,
      ).run();
    } else {
      db.prepare(
        `UPDATE qaza_settings SET
           manual_override_fajr_end = NULL,
           manual_override_zuhr_end = NULL,
           manual_override_asr_end = NULL,
           manual_override_maghrib_end = NULL,
           manual_override_isha_end = NULL,
           updated_at = datetime('now')
         WHERE id = 1`,
      ).run();
    }
    await fetchAndCacheKarachiDailyData(db, true);
    res.json({ ok: true });
  });

  // Eid Prayer Settings
  app.put('/api/admin/eid', requireAdmin, (req, res) => {
    const { isActive, eidType, prayerDate, prayerTime, noteEn, noteUr } = req.body || {};
    if (eidType !== 'fitr' && eidType !== 'adha') {
      res.status(400).json({ error: 'Invalid Eid type' });
      return;
    }
    const cleanTime = prayerTime ? String(prayerTime).trim() : '';
    if (isActive && cleanTime && !isValidTime24(cleanTime)) {
      res.status(400).json({ error: 'Eid prayer time must be HH:MM (24h)' });
      return;
    }
    const db = getDb();
    db.prepare(
      `UPDATE eid_prayer SET
         is_active = ?,
         eid_type = ?,
         prayer_date = ?,
         prayer_time = ?,
         note_en = ?,
         note_ur = ?,
         updated_at = datetime('now')
       WHERE id = 1`,
    ).run(
      isActive ? 1 : 0,
      eidType,
      String(prayerDate || ''),
      cleanTime,
      String(noteEn || ''),
      String(noteUr || ''),
    );
    res.json({ ok: true });
  });

  // Announcements & Notification Dispatch
  app.post('/api/admin/announcements', requireAdmin, (req, res) => {
    const {
      titleEn,
      titleUr,
      bodyEn,
      bodyUr,
      category,
      isPublished,
      startDate,
      expiryDate,
      sendPush,
    } = req.body || {};
    if (!titleEn || !bodyEn) {
      res.status(400).json({ error: 'Announcement title and body are required' });
      return;
    }
    const allowedCats = ['important', 'timing', 'jumuah', 'eid', 'general'];
    const cat = allowedCats.includes(category) ? category : 'general';
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO announcements (title_en, title_ur, body_en, body_ur, category, is_published, start_date, expiry_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        String(titleEn).trim(),
        String(titleUr || '').trim(),
        String(bodyEn).trim(),
        String(bodyUr || '').trim(),
        cat,
        isPublished ? 1 : 0,
        startDate ? String(startDate) : null,
        expiryDate ? String(expiryDate) : null,
      );

    if (isPublished && sendPush) {
      db.prepare(
        `INSERT INTO notification_dispatches (announcement_id, title, body) VALUES (?, ?, ?)`,
      ).run(Number(result.lastInsertRowid), String(titleEn).trim(), String(bodyEn).trim());
    }

    res.json({ ok: true, id: Number(result.lastInsertRowid) });
  });

  app.put('/api/admin/announcements/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const {
      titleEn,
      titleUr,
      bodyEn,
      bodyUr,
      category,
      isPublished,
      startDate,
      expiryDate,
      sendPush,
    } = req.body || {};
    if (!Number.isInteger(id) || !titleEn || !bodyEn) {
      res.status(400).json({ error: 'Valid announcement ID, title, and body are required' });
      return;
    }
    const allowedCats = ['important', 'timing', 'jumuah', 'eid', 'general'];
    const cat = allowedCats.includes(category) ? category : 'general';
    const db = getDb();

    db.prepare(
      `UPDATE announcements SET
         title_en = ?,
         title_ur = ?,
         body_en = ?,
         body_ur = ?,
         category = ?,
         is_published = ?,
         start_date = ?,
         expiry_date = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      String(titleEn).trim(),
      String(titleUr || '').trim(),
      String(bodyEn).trim(),
      String(bodyUr || '').trim(),
      cat,
      isPublished ? 1 : 0,
      startDate ? String(startDate) : null,
      expiryDate ? String(expiryDate) : null,
      id,
    );

    if (isPublished && sendPush) {
      db.prepare(
        `INSERT INTO notification_dispatches (announcement_id, title, body) VALUES (?, ?, ?)`,
      ).run(id, String(titleEn).trim(), String(bodyEn).trim());
    }

    res.json({ ok: true });
  });

  app.delete('/api/admin/announcements/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid announcement ID' });
      return;
    }
    const db = getDb();
    db.prepare(`DELETE FROM announcements WHERE id = ?`).run(id);
    res.json({ ok: true });
  });

  return app;
}
