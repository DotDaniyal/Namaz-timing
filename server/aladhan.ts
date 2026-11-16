import type { DatabaseSync } from 'node:sqlite';

export interface KarachiDateInfo {
  isoDate: string; // YYYY-MM-DD
  year: number;
  month: number;
  day: number;
  weekdayIndex: number; // 0 = Sun ... 5 = Fri ... 6 = Sat
  weekdayEn: string;
  time24: string; // HH:MM
  seconds: number;
  formattedDateEn: string;
  formattedDateUr: string;
}

export interface AstronomicalSnapshot {
  karachiDate: string;
  fajrStart: string;
  sunrise: string;
  dhuhrStart: string;
  asrHanafi: string;
  asrStandard: string;
  sunset: string;
  maghribStart: string;
  ishaStart: string;
  midnight: string;
  firstThird: string;
  nextFajrStart: string;
  source: 'aladhan' | 'cached' | 'unavailable';
  fetchedAt: string;
}

export interface AlAdhanDailyResult {
  karachiDate: string;
  sunsetTime: string;     // 24h HH:MM
  maghribApiTime: string; // 24h HH:MM
  source: 'aladhan' | 'cached' | 'manual' | 'unavailable';
  fetchedAt: string;
  astronomical: AstronomicalSnapshot;
  hijri: {
    day: number;
    monthNumber: number;
    monthEn: string;
    monthAr: string;
    year: number;
    weekdayAr: string;
    source: 'aladhan' | 'cached' | 'manual' | 'unavailable';
  };
}

const WEEKDAY_MAP: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export function getKarachiDateInfo(now: Date = new Date()): KarachiDateInfo {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));
  const seconds = Number(get('second'));
  const weekdayEn = get('weekday');
  const weekdayIndex = WEEKDAY_MAP[weekdayEn] ?? 0;

  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const time24 = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const formattedDateEn = new Intl.DateTimeFormat('en-PK', {
    timeZone: 'Asia/Karachi',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);

  const formattedDateUr = new Intl.DateTimeFormat('ur-PK', {
    timeZone: 'Asia/Karachi',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);

  return {
    isoDate,
    year,
    month,
    day,
    weekdayIndex,
    weekdayEn,
    time24,
    seconds,
    formattedDateEn,
    formattedDateUr,
  };
}

function cleanAlAdhanTime(raw: string): string {
  const match = /(\d{1,2}):(\d{2})/.exec(raw || '');
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

interface AlAdhanApiPayload {
  code: number;
  data?: {
    timings?: {
      Fajr?: string;
      Sunrise?: string;
      Dhuhr?: string;
      Asr?: string;
      Sunset?: string;
      Maghrib?: string;
      Isha?: string;
      Midnight?: string;
      Firstthird?: string;
    };
    date?: {
      hijri?: {
        day?: string;
        month?: { number?: number; en?: string; ar?: string };
        year?: string;
        weekday?: { ar?: string };
      };
    };
  };
}

async function fetchAlAdhanTimings(
  dd: string,
  mm: string,
  yyyy: number,
  city: string,
  country: string,
  method: number,
  school: 0 | 1,
  adjustment: number,
): Promise<AlAdhanApiPayload> {
  const url = `https://api.aladhan.com/v1/timingsByCity/${dd}-${mm}-${yyyy}?city=${encodeURIComponent(
    city,
  )}&country=${encodeURIComponent(country)}&method=${method}&school=${school}&adjustment=${adjustment}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`AlAdhan API returned ${res.status}`);
    return (await res.json()) as AlAdhanApiPayload;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAndCacheKarachiDailyData(
  db: DatabaseSync,
  forceRefresh = false,
): Promise<AlAdhanDailyResult> {
  const karachi = getKarachiDateInfo();
  const tomorrow = getKarachiDateInfo(new Date(Date.now() + 86400_000));

  const settings = db.prepare(`SELECT * FROM mosque_settings WHERE id = 1`).get() as {
    karachi_city: string;
    karachi_country: string;
    calculation_method: number;
  };
  const hijriSettings = db.prepare(`SELECT * FROM hijri_date_settings WHERE id = 1`).get() as {
    adjustment_days: number;
    manual_override_enabled: number;
    manual_hijri_day: number | null;
    manual_hijri_month_en: string | null;
    manual_hijri_month_ar: string | null;
    manual_hijri_year: number | null;
    cached_karachi_date: string | null;
    cached_hijri_day: number | null;
    cached_hijri_month_number: number | null;
    cached_hijri_month_en: string | null;
    cached_hijri_month_ar: string | null;
    cached_hijri_year: number | null;
    cached_weekday_ar: string | null;
  };

  const cachedMaghribToday = db
    .prepare(`SELECT * FROM daily_maghrib_times WHERE karachi_date = ?`)
    .get(karachi.isoDate) as
    | { karachi_date: string; sunset_time: string; maghrib_api_time: string; source: string; fetched_at: string }
    | undefined;

  const cachedAstroToday = db
    .prepare(`SELECT * FROM daily_astronomical_times WHERE karachi_date = ?`)
    .get(karachi.isoDate) as
    | {
        karachi_date: string;
        fajr_start: string;
        sunrise: string;
        dhuhr_start: string;
        asr_hanafi: string;
        asr_standard: string;
        sunset: string;
        maghrib_start: string;
        isha_start: string;
        midnight: string;
        first_third: string;
        next_fajr_start: string;
        source: string;
        fetched_at: string;
      }
    | undefined;

  const hasTodayHijriCache =
    hijriSettings.cached_karachi_date === karachi.isoDate && hijriSettings.cached_hijri_day !== null;

  if (!forceRefresh && cachedMaghribToday && cachedAstroToday && hasTodayHijriCache) {
    return {
      karachiDate: karachi.isoDate,
      sunsetTime: cachedMaghribToday.sunset_time,
      maghribApiTime: cachedMaghribToday.maghrib_api_time,
      source: cachedMaghribToday.source === 'manual' ? 'manual' : 'aladhan',
      fetchedAt: cachedMaghribToday.fetched_at,
      astronomical: {
        karachiDate: cachedAstroToday.karachi_date,
        fajrStart: cachedAstroToday.fajr_start,
        sunrise: cachedAstroToday.sunrise,
        dhuhrStart: cachedAstroToday.dhuhr_start,
        asrHanafi: cachedAstroToday.asr_hanafi,
        asrStandard: cachedAstroToday.asr_standard,
        sunset: cachedAstroToday.sunset,
        maghribStart: cachedAstroToday.maghrib_start,
        ishaStart: cachedAstroToday.isha_start,
        midnight: cachedAstroToday.midnight,
        firstThird: cachedAstroToday.first_third,
        nextFajrStart: cachedAstroToday.next_fajr_start,
        source: 'aladhan',
        fetchedAt: cachedAstroToday.fetched_at,
      },
      hijri: resolveHijriFromSettings(hijriSettings, 'aladhan'),
    };
  }

  const dd = String(karachi.day).padStart(2, '0');
  const mm = String(karachi.month).padStart(2, '0');
  const yyyy = karachi.year;
  const ddNext = String(tomorrow.day).padStart(2, '0');
  const mmNext = String(tomorrow.month).padStart(2, '0');
  const yyyyNext = tomorrow.year;

  const city = settings.karachi_city || 'Karachi';
  const country = settings.karachi_country || 'Pakistan';
  const method = settings.calculation_method || 1;
  const adj = hijriSettings.adjustment_days || 0;

  try {
    // Fetch Hanafi (school=1), Standard (school=0 for Mithl Awwal), and tomorrow's Fajr in parallel
    const [jsonHanafi, jsonStandard, jsonNextDay] = await Promise.all([
      fetchAlAdhanTimings(dd, mm, yyyy, city, country, method, 1, adj),
      fetchAlAdhanTimings(dd, mm, yyyy, city, country, method, 0, adj),
      fetchAlAdhanTimings(ddNext, mmNext, yyyyNext, city, country, method, 1, adj).catch(() => null),
    ]);

    const t1 = jsonHanafi?.data?.timings;
    const t0 = jsonStandard?.data?.timings;
    const tNext = jsonNextDay?.data?.timings;

    const fajrStart = cleanAlAdhanTime(t1?.Fajr || '');
    const sunrise = cleanAlAdhanTime(t1?.Sunrise || '');
    const dhuhrStart = cleanAlAdhanTime(t1?.Dhuhr || '');
    const asrHanafi = cleanAlAdhanTime(t1?.Asr || '');
    const asrStandard = cleanAlAdhanTime(t0?.Asr || '') || asrHanafi;
    const sunset = cleanAlAdhanTime(t1?.Sunset || '');
    const maghribStart = cleanAlAdhanTime(t1?.Maghrib || '') || sunset;
    const ishaStart = cleanAlAdhanTime(t1?.Isha || '');
    const midnight = cleanAlAdhanTime(t1?.Midnight || '');
    const firstThird = cleanAlAdhanTime(t1?.Firstthird || '');
    const nextFajrStart = cleanAlAdhanTime(tNext?.Fajr || '') || fajrStart;

    const h = jsonHanafi?.data?.date?.hijri;

    if (!sunset || !sunrise || !asrHanafi || !ishaStart || !h?.day || !h?.month?.en || !h?.year) {
      throw new Error('Incomplete AlAdhan response payload');
    }

    const nowIso = new Date().toISOString();

    db.prepare(
      `INSERT INTO daily_maghrib_times (karachi_date, sunset_time, maghrib_api_time, source, fetched_at)
       VALUES (?, ?, ?, 'aladhan', ?)
       ON CONFLICT(karachi_date) DO UPDATE SET
         sunset_time = excluded.sunset_time,
         maghrib_api_time = excluded.maghrib_api_time,
         source = 'aladhan',
         fetched_at = excluded.fetched_at`,
    ).run(karachi.isoDate, sunset, maghribStart, nowIso);

    db.prepare(
      `INSERT INTO daily_astronomical_times (
         karachi_date, fajr_start, sunrise, dhuhr_start, asr_hanafi, asr_standard,
         sunset, maghrib_start, isha_start, midnight, first_third, next_fajr_start,
         source, fetched_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aladhan', ?)
       ON CONFLICT(karachi_date) DO UPDATE SET
         fajr_start = excluded.fajr_start,
         sunrise = excluded.sunrise,
         dhuhr_start = excluded.dhuhr_start,
         asr_hanafi = excluded.asr_hanafi,
         asr_standard = excluded.asr_standard,
         sunset = excluded.sunset,
         maghrib_start = excluded.maghrib_start,
         isha_start = excluded.isha_start,
         midnight = excluded.midnight,
         first_third = excluded.first_third,
         next_fajr_start = excluded.next_fajr_start,
         source = 'aladhan',
         fetched_at = excluded.fetched_at`,
    ).run(
      karachi.isoDate,
      fajrStart,
      sunrise,
      dhuhrStart,
      asrHanafi,
      asrStandard,
      sunset,
      maghribStart,
      ishaStart,
      midnight,
      firstThird,
      nextFajrStart,
      nowIso,
    );

    const hDay = Number(h.day);
    const hMonthNum = Number(h.month.number || 1);
    const hMonthEn = h.month.en;
    const hMonthAr = h.month.ar || '';
    const hYear = Number(h.year);
    const hWeekdayAr = h.weekday?.ar || '';

    db.prepare(
      `UPDATE hijri_date_settings SET
         cached_karachi_date = ?,
         cached_hijri_day = ?,
         cached_hijri_month_number = ?,
         cached_hijri_month_en = ?,
         cached_hijri_month_ar = ?,
         cached_hijri_year = ?,
         cached_weekday_ar = ?,
         updated_at = ?
       WHERE id = 1`,
    ).run(karachi.isoDate, hDay, hMonthNum, hMonthEn, hMonthAr, hYear, hWeekdayAr, nowIso);

    const updatedHijri = db.prepare(`SELECT * FROM hijri_date_settings WHERE id = 1`).get() as typeof hijriSettings;

    return {
      karachiDate: karachi.isoDate,
      sunsetTime: sunset,
      maghribApiTime: maghribStart,
      source: 'aladhan',
      fetchedAt: nowIso,
      astronomical: {
        karachiDate: karachi.isoDate,
        fajrStart,
        sunrise,
        dhuhrStart,
        asrHanafi,
        asrStandard,
        sunset,
        maghribStart,
        ishaStart,
        midnight,
        firstThird,
        nextFajrStart,
        source: 'aladhan',
        fetchedAt: nowIso,
      },
      hijri: resolveHijriFromSettings(updatedHijri, 'aladhan'),
    };
  } catch {
    const latestCached = db
      .prepare(`SELECT * FROM daily_maghrib_times ORDER BY karachi_date DESC LIMIT 1`)
      .get() as
      | { karachi_date: string; sunset_time: string; maghrib_api_time: string; source: string; fetched_at: string }
      | undefined;

    const latestAstro = db
      .prepare(`SELECT * FROM daily_astronomical_times ORDER BY karachi_date DESC LIMIT 1`)
      .get() as typeof cachedAstroToday;

    return {
      karachiDate: latestCached?.karachi_date || karachi.isoDate,
      sunsetTime: latestCached?.sunset_time || '',
      maghribApiTime: latestCached?.maghrib_api_time || '',
      source: latestCached ? 'cached' : 'unavailable',
      fetchedAt: latestCached?.fetched_at || '',
      astronomical: latestAstro
        ? {
            karachiDate: latestAstro.karachi_date,
            fajrStart: latestAstro.fajr_start,
            sunrise: latestAstro.sunrise,
            dhuhrStart: latestAstro.dhuhr_start,
            asrHanafi: latestAstro.asr_hanafi,
            asrStandard: latestAstro.asr_standard,
            sunset: latestAstro.sunset,
            maghribStart: latestAstro.maghrib_start,
            ishaStart: latestAstro.isha_start,
            midnight: latestAstro.midnight,
            firstThird: latestAstro.first_third,
            nextFajrStart: latestAstro.next_fajr_start,
            source: 'cached',
            fetchedAt: latestAstro.fetched_at,
          }
        : {
            karachiDate: karachi.isoDate,
            fajrStart: '',
            sunrise: '',
            dhuhrStart: '',
            asrHanafi: '',
            asrStandard: '',
            sunset: '',
            maghribStart: '',
            ishaStart: '',
            midnight: '',
            firstThird: '',
            nextFajrStart: '',
            source: 'unavailable',
            fetchedAt: '',
          },
      hijri: resolveHijriFromSettings(hijriSettings, hijriSettings.cached_hijri_day ? 'cached' : 'unavailable'),
    };
  }
}

function resolveHijriFromSettings(
  s: {
    manual_override_enabled: number;
    manual_hijri_day: number | null;
    manual_hijri_month_en: string | null;
    manual_hijri_month_ar: string | null;
    manual_hijri_year: number | null;
    cached_hijri_day: number | null;
    cached_hijri_month_number: number | null;
    cached_hijri_month_en: string | null;
    cached_hijri_month_ar: string | null;
    cached_hijri_year: number | null;
    cached_weekday_ar: string | null;
  },
  apiSource: 'aladhan' | 'cached' | 'unavailable',
) {
  if (
    s.manual_override_enabled === 1 &&
    s.manual_hijri_day &&
    s.manual_hijri_month_en &&
    s.manual_hijri_year
  ) {
    return {
      day: s.manual_hijri_day,
      monthNumber: s.cached_hijri_month_number || 1,
      monthEn: s.manual_hijri_month_en,
      monthAr: s.manual_hijri_month_ar || '',
      year: s.manual_hijri_year,
      weekdayAr: s.cached_weekday_ar || '',
      source: 'manual' as const,
    };
  }

  return {
    day: s.cached_hijri_day || 0,
    monthNumber: s.cached_hijri_month_number || 0,
    monthEn: s.cached_hijri_month_en || '',
    monthAr: s.cached_hijri_month_ar || '',
    year: s.cached_hijri_year || 0,
    weekdayAr: s.cached_weekday_ar || '',
    source: apiSource,
  };
}
