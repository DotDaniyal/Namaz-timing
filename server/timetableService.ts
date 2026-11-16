import { fetchAndCacheKarachiDailyData, getKarachiDateInfo } from './aladhan.ts';
import { getDb } from './db.ts';
import {
  addMinutesTo24Time,
  formatTime24To12,
  resolveAnnualTimingsForDate,
  type ScheduleRow,
} from './pdfSchedule.ts';

export interface PrayerEntry {
  key: 'fajr' | 'zuhr' | 'asr' | 'maghrib' | 'isha';
  nameEn: string;
  nameUr: string;
  nameAr: string;
  time24: string;
  time12: string;
  sourceLabelEn: string;
  sourceLabelUr: string;
  isOverridden: boolean;
  effectiveFrom?: { month: number; day: number };
  sunsetTime24?: string;
  sunsetTime12?: string;
  offsetMinutes?: number;
  status?: 'live' | 'cached' | 'manual' | 'unavailable';
  // Prayer Ending Time & Qaza fields
  astroStart24: string;
  astroStart12: string;
  endTime24: string;
  endTime12: string;
  qazaStarts24: string;
  qazaStarts12: string;
  endSourceType: 'aladhan' | 'cached' | 'manual' | 'unavailable';
  endSourceLabelEn: string;
  endSourceLabelUr: string;
  endRuleLabelEn: string;
  endRuleLabelUr: string;
  endNoteEn?: string;
  endNoteUr?: string;
  isEndOverridden: boolean;
  crossesMidnight?: boolean;
}

interface QazaSettingsRow {
  enabled_on_public: number;
  jurisprudence_policy: 'hanafi' | 'standard';
  zuhr_end_rule: 'asr_hanafi' | 'asr_standard';
  maghrib_end_rule: 'isha_start';
  isha_end_rule: 'subh_sadiq' | 'islamic_midnight' | 'first_third';
  warning_threshold_minutes: number;
  manual_override_fajr_end: string | null;
  manual_override_zuhr_end: string | null;
  manual_override_asr_end: string | null;
  manual_override_maghrib_end: string | null;
  manual_override_isha_end: string | null;
  authority_verified_note: string;
  updated_at: string;
}

function buildEndField(
  autoTime24: string,
  manualOverride: string | null,
  astroSource: 'aladhan' | 'cached' | 'unavailable',
  ruleEn: string,
  ruleUr: string,
  noteEn?: string,
  noteUr?: string,
  crossesMidnight = false,
) {
  const isManual = Boolean(manualOverride && manualOverride.trim() !== '');
  const time24 = isManual ? manualOverride!.trim() : autoTime24;
  const sourceType: 'aladhan' | 'cached' | 'manual' | 'unavailable' = isManual
    ? 'manual'
    : !time24
      ? 'unavailable'
      : astroSource;

  const sourceLabelEn =
    sourceType === 'manual'
      ? 'Manual Override (Admin Entered)'
      : sourceType === 'cached'
        ? 'AlAdhan Karachi Method 1 (Cached)'
        : sourceType === 'unavailable'
          ? 'Awaiting Astronomical Sync'
          : 'AlAdhan Karachi Method 1';

  const sourceLabelUr =
    sourceType === 'manual'
      ? 'دستی ترمیم (ایڈمن)'
      : sourceType === 'cached'
        ? 'محفوظ شدہ فلکیاتی وقت (کراچی)'
        : sourceType === 'unavailable'
          ? 'فلکیاتی وقت دستیاب نہیں'
          : 'الاذان کراچی (طریقہ ۱)';

  return {
    endTime24: time24,
    endTime12: time24 ? formatTime24To12(time24) : '—',
    qazaStarts24: time24,
    qazaStarts12: time24 ? formatTime24To12(time24) : '—',
    endSourceType: sourceType,
    endSourceLabelEn: sourceLabelEn,
    endSourceLabelUr: sourceLabelUr,
    endRuleLabelEn: isManual ? 'Manual Override' : ruleEn,
    endRuleLabelUr: isManual ? 'دستی مقررہ وقت' : ruleUr,
    endNoteEn: noteEn,
    endNoteUr: noteUr,
    isEndOverridden: isManual,
    crossesMidnight,
  };
}

export async function buildTodayTimetablePayload(forceRefreshApi = false) {
  const db = getDb();
  const karachi = getKarachiDateInfo();
  const aladhan = await fetchAndCacheKarachiDailyData(db, forceRefreshApi);
  const astro = aladhan.astronomical;

  const settings = db.prepare(`SELECT * FROM mosque_settings WHERE id = 1`).get() as {
    mosque_name_en: string;
    mosque_name_ar: string;
    zuhr_fixed_time: string;
    jumuah_time: string;
    jumuah_show_all_week: number;
    jumuah_note_en: string;
    jumuah_note_ur: string;
    maghrib_auto_enabled: number;
    maghrib_offset_minutes: number;
    maghrib_manual_override: string | null;
    karachi_city: string;
    karachi_country: string;
    calculation_method: number;
  };

  const qaza = db
    .prepare(`SELECT * FROM qaza_settings WHERE id = 1`)
    .get() as unknown as QazaSettingsRow;

  const scheduleRows = db
    .prepare(`SELECT id, month, day, fajr, asr, isha, is_default_pdf FROM prayer_schedule ORDER BY month ASC, day ASC`)
    .all() as unknown as ScheduleRow[];

  const overridesRaw = db
    .prepare(`SELECT prayer_name, override_time, is_active FROM prayer_overrides`)
    .all() as Array<{ prayer_name: string; override_time: string | null; is_active: number }>;

  const overrideMap = new Map<string, { time: string | null; active: boolean }>();
  for (const row of overridesRaw) {
    overrideMap.set(row.prayer_name, { time: row.override_time, active: row.is_active === 1 });
  }

  const annual = resolveAnnualTimingsForDate(scheduleRows, karachi.month, karachi.day);

  // 1. Fajr Jamaat (PDF annual schedule + optional admin override)
  const fajrOv = overrideMap.get('fajr');
  const fajr24 = fajrOv?.active && fajrOv.time ? fajrOv.time : annual.fajr;

  // 2. Zuhr Jamaat (ALWAYS fixed 1:30 PM unless emergency manual override active)
  const zuhrOv = overrideMap.get('zuhr');
  const zuhrBase = settings.zuhr_fixed_time || '13:30';
  const zuhr24 = zuhrOv?.active && zuhrOv.time ? zuhrOv.time : zuhrBase;

  // 3. Asr Jamaat (PDF annual schedule + optional admin override)
  const asrOv = overrideMap.get('asr');
  const asr24 = asrOv?.active && asrOv.time ? asrOv.time : annual.asr;

  // 4. Maghrib Jamaat (Automatic Karachi Sunset + Admin Offset OR Manual Override)
  const maghribOv = overrideMap.get('maghrib');
  const sunset24 = aladhan.sunsetTime;
  const offset = Number(settings.maghrib_offset_minutes || 0);
  const calculatedMaghrib24 = sunset24 ? addMinutesTo24Time(sunset24, offset) : '';

  let maghrib24 = calculatedMaghrib24;
  let maghribStatus: 'live' | 'cached' | 'manual' | 'unavailable' =
    aladhan.source === 'aladhan' ? 'live' : aladhan.source === 'cached' ? 'cached' : 'unavailable';
  let maghribOverridden = false;

  if (maghribOv?.active && maghribOv.time) {
    maghrib24 = maghribOv.time;
    maghribStatus = 'manual';
    maghribOverridden = true;
  } else if (settings.maghrib_auto_enabled === 0 && settings.maghrib_manual_override) {
    maghrib24 = settings.maghrib_manual_override;
    maghribStatus = 'manual';
    maghribOverridden = true;
  }

  // 5. Isha Jamaat (PDF annual schedule + optional admin override)
  const ishaOv = overrideMap.get('isha');
  const isha24 = ishaOv?.active && ishaOv.time ? ishaOv.time : annual.isha;

  // Ending Time & Qaza Calculations
  const fajrEnd = buildEndField(
    astro.sunrise,
    qaza.manual_override_fajr_end,
    astro.source,
    'Local Sunrise (Shuruq)',
    'طلوعِ آفتاب (شروق)',
    'Fajr valid time ends at Sunrise and becomes Qaza immediately. Performing Salah (including Qaza) is prohibited during the sunrise Makruh period until Ishraq.',
    'فجر کا وقت طلوعِ آفتاب پر ختم ہو کر قضا ہو جاتا ہے۔ طلوع کے بعد اشراق تک مکروہ وقت میں نماز پڑھنا ممنوع ہے۔',
  );

  const zuhrEndAuto =
    qaza.zuhr_end_rule === 'asr_standard' ? astro.asrStandard : astro.asrHanafi;
  const zuhrEnd = buildEndField(
    zuhrEndAuto,
    qaza.manual_override_zuhr_end,
    astro.source,
    qaza.zuhr_end_rule === 'asr_standard'
      ? 'Mithl Awwal (1x Shadow Asr Start)'
      : 'Hanafi Mithl Thani (2x Shadow Asr Start)',
    qaza.zuhr_end_rule === 'asr_standard'
      ? 'مثلِ اول (عصر کا آغاز)'
      : 'حنفی مثلِ ثانی (عصرِ حنفی کا آغاز)',
  );

  const asrEnd = buildEndField(
    astro.sunset,
    qaza.manual_override_asr_end,
    astro.source,
    'Local Sunset (Ghurub-e-Aftab)',
    'غروبِ آفتاب',
    'Asr valid time ends at Sunset. Delaying Asr until the sun turns pale before sunset is Makruh without excuse.',
    'عصر کا وقت غروبِ آفتاب پر ختم ہوتا ہے۔ بلا عذر غروب کے قریب تاخیر مکروہ ہے۔',
  );

  const maghribEnd = buildEndField(
    astro.ishaStart,
    qaza.manual_override_maghrib_end,
    astro.source,
    'Isha Start (Hanafi Shafaq Abyad)',
    'غروبِ شفقِ ابیض (عشاء کا آغاز)',
  );

  const ishaAutoTime =
    qaza.isha_end_rule === 'islamic_midnight'
      ? astro.midnight
      : qaza.isha_end_rule === 'first_third'
        ? astro.firstThird
        : astro.nextFajrStart || astro.fajrStart;

  const ishaRuleEn =
    qaza.isha_end_rule === 'islamic_midnight'
      ? 'Islamic Midnight (Sunset–Fajr Midpoint)'
      : qaza.isha_end_rule === 'first_third'
        ? 'First Third of the Night'
        : 'Subh Sadiq (True Dawn / Next Fajr)';

  const ishaRuleUr =
    qaza.isha_end_rule === 'islamic_midnight'
      ? 'نصف اللیل شرعی'
      : qaza.isha_end_rule === 'first_third'
        ? 'تہائی رات'
        : 'صبح صادق (اگلی فجر کا آغاز)';

  const ishaNoteEn =
    qaza.isha_end_rule === 'subh_sadiq'
      ? 'Under Hanafi Fiqh, Isha remains valid until Subh Sadiq (true dawn), though delaying past Islamic Midnight without excuse is Makruh.'
      : undefined;

  const ishaNoteUr =
    qaza.isha_end_rule === 'subh_sadiq'
      ? 'فقہ حنفی میں عشاء کا وقت صبح صادق تک رہتا ہے، تاہم بلا عذر نصف شب سے تاخیر مکروہ ہے۔'
      : undefined;

  const ishaCrossesMidnight =
    qaza.isha_end_rule === 'subh_sadiq' ||
    (Boolean(ishaAutoTime) && ishaAutoTime < (astro.ishaStart || '19:00'));

  const ishaEnd = buildEndField(
    ishaAutoTime,
    qaza.manual_override_isha_end,
    astro.source,
    ishaRuleEn,
    ishaRuleUr,
    ishaNoteEn,
    ishaNoteUr,
    ishaCrossesMidnight,
  );

  const prayers: PrayerEntry[] = [
    {
      key: 'fajr',
      nameEn: 'Fajr',
      nameUr: 'فجر',
      nameAr: 'الفجر',
      time24: fajr24,
      time12: formatTime24To12(fajr24),
      sourceLabelEn: fajrOv?.active ? 'Manual override' : 'Annual schedule',
      sourceLabelUr: fajrOv?.active ? 'دستی ترمیم' : 'سالانہ نقشہ',
      isOverridden: Boolean(fajrOv?.active && fajrOv.time),
      effectiveFrom: annual.effectiveFrom.fajr,
      astroStart24: astro.fajrStart,
      astroStart12: astro.fajrStart ? formatTime24To12(astro.fajrStart) : '—',
      ...fajrEnd,
    },
    {
      key: 'zuhr',
      nameEn: 'Zuhr',
      nameUr: 'ظہر',
      nameAr: 'الظهر',
      time24: zuhr24,
      time12: formatTime24To12(zuhr24),
      sourceLabelEn: zuhrOv?.active ? 'Emergency override' : 'Fixed year-round',
      sourceLabelUr: zuhrOv?.active ? 'ہنگامی تبدیلی' : 'سال بھر مقررہ وقت',
      isOverridden: Boolean(zuhrOv?.active && zuhrOv.time),
      astroStart24: astro.dhuhrStart,
      astroStart12: astro.dhuhrStart ? formatTime24To12(astro.dhuhrStart) : '—',
      ...zuhrEnd,
    },
    {
      key: 'asr',
      nameEn: 'Asr',
      nameUr: 'عصر',
      nameAr: 'العصر',
      time24: asr24,
      time12: formatTime24To12(asr24),
      sourceLabelEn: asrOv?.active ? 'Manual override' : 'Annual schedule',
      sourceLabelUr: asrOv?.active ? 'دستی ترمیم' : 'سالانہ نقشہ',
      isOverridden: Boolean(asrOv?.active && asrOv.time),
      effectiveFrom: annual.effectiveFrom.asr,
      astroStart24: zuhrEndAuto,
      astroStart12: zuhrEndAuto ? formatTime24To12(zuhrEndAuto) : '—',
      ...asrEnd,
    },
    {
      key: 'maghrib',
      nameEn: 'Maghrib',
      nameUr: 'مغرب',
      nameAr: 'المغرب',
      time24: maghrib24,
      time12: maghrib24 ? formatTime24To12(maghrib24) : '—',
      sourceLabelEn:
        maghribStatus === 'manual'
          ? 'Manual override'
          : maghribStatus === 'cached'
            ? 'Karachi sunset (cached)'
            : maghribStatus === 'unavailable'
              ? 'Awaiting sunset sync'
              : 'Karachi sunset',
      sourceLabelUr:
        maghribStatus === 'manual'
          ? 'دستی ترمیم'
          : maghribStatus === 'cached'
            ? 'غروبِ آفتاب کراچی (محفوظ شدہ)'
            : maghribStatus === 'unavailable'
              ? 'غروبِ آفتاب دستیاب نہیں'
              : 'غروبِ آفتاب کراچی',
      isOverridden: maghribOverridden,
      sunsetTime24: sunset24 || undefined,
      sunsetTime12: sunset24 ? formatTime24To12(sunset24) : undefined,
      offsetMinutes: offset,
      status: maghribStatus,
      astroStart24: astro.sunset,
      astroStart12: astro.sunset ? formatTime24To12(astro.sunset) : '—',
      ...maghribEnd,
    },
    {
      key: 'isha',
      nameEn: 'Isha',
      nameUr: 'عشاء',
      nameAr: 'العشاء',
      time24: isha24,
      time12: formatTime24To12(isha24),
      sourceLabelEn: ishaOv?.active ? 'Manual override' : 'Annual schedule',
      sourceLabelUr: ishaOv?.active ? 'دستی ترمیم' : 'سالانہ نقشہ',
      isOverridden: Boolean(ishaOv?.active && ishaOv.time),
      effectiveFrom: annual.effectiveFrom.isha,
      astroStart24: astro.ishaStart,
      astroStart12: astro.ishaStart ? formatTime24To12(astro.ishaStart) : '—',
      ...ishaEnd,
    },
  ];

  const announcements = db
    .prepare(
      `SELECT id, title_en, title_ur, body_en, body_ur, category, start_date, expiry_date, created_at
       FROM announcements
       WHERE is_published = 1
         AND (start_date IS NULL OR start_date = '' OR start_date <= ?)
         AND (expiry_date IS NULL OR expiry_date = '' OR expiry_date >= ?)
       ORDER BY id DESC`,
    )
    .all(karachi.isoDate, karachi.isoDate) as Array<{
      id: number;
      title_en: string;
      title_ur: string;
      body_en: string;
      body_ur: string;
      category: string;
      start_date: string | null;
      expiry_date: string | null;
      created_at: string;
    }>;

  const eid = db.prepare(`SELECT * FROM eid_prayer WHERE id = 1`).get() as {
    is_active: number;
    eid_type: 'fitr' | 'adha';
    prayer_date: string;
    prayer_time: string;
    note_en: string;
    note_ur: string;
  };

  const hijriSettings = db
    .prepare(`SELECT adjustment_days, manual_override_enabled FROM hijri_date_settings WHERE id = 1`)
    .get() as { adjustment_days: number; manual_override_enabled: number };

  const isFriday = karachi.weekdayIndex === 5;
  const hasJumuahTime = Boolean(settings.jumuah_time && settings.jumuah_time.trim() !== '');
  const showJumuah = isFriday || (hasJumuahTime && settings.jumuah_show_all_week === 1);

  return {
    mosque: {
      nameEn: settings.mosque_name_en,
      nameAr: settings.mosque_name_ar,
      timezone: 'Asia/Karachi',
      city: settings.karachi_city,
      country: settings.karachi_country,
    },
    date: {
      karachiIso: karachi.isoDate,
      weekdayEn: karachi.weekdayEn,
      weekdayIndex: karachi.weekdayIndex,
      formattedGregorianEn: karachi.formattedDateEn,
      formattedGregorianUr: karachi.formattedDateUr,
      serverEpochMs: Date.now(),
      hijri: {
        ...aladhan.hijri,
        adjustmentDays: hijriSettings.adjustment_days,
        manualOverrideEnabled: hijriSettings.manual_override_enabled === 1,
      },
    },
    prayers,
    maghribMeta: {
      autoEnabled: settings.maghrib_auto_enabled === 1,
      sunsetTime24: sunset24,
      sunsetTime12: sunset24 ? formatTime24To12(sunset24) : '',
      offsetMinutes: offset,
      jamaatTime24: maghrib24,
      jamaatTime12: maghrib24 ? formatTime24To12(maghrib24) : '',
      status: maghribStatus,
      fetchedAt: aladhan.fetchedAt,
      calculationMethod: settings.calculation_method,
    },
    qazaConfig: {
      enabledOnPublic: qaza.enabled_on_public === 1,
      jurisprudencePolicy: qaza.jurisprudence_policy,
      zuhrEndRule: qaza.zuhr_end_rule,
      maghribEndRule: qaza.maghrib_end_rule,
      ishaEndRule: qaza.isha_end_rule,
      warningThresholdMinutes: qaza.warning_threshold_minutes,
      authorityVerifiedNote: qaza.authority_verified_note,
      astronomicalSource: astro.source,
      astronomicalFetchedAt: astro.fetchedAt,
      updatedAt: qaza.updated_at,
      astronomicalSnapshot: {
        fajrStart12: astro.fajrStart ? formatTime24To12(astro.fajrStart) : '—',
        sunrise12: astro.sunrise ? formatTime24To12(astro.sunrise) : '—',
        dhuhrStart12: astro.dhuhrStart ? formatTime24To12(astro.dhuhrStart) : '—',
        asrHanafi12: astro.asrHanafi ? formatTime24To12(astro.asrHanafi) : '—',
        asrStandard12: astro.asrStandard ? formatTime24To12(astro.asrStandard) : '—',
        sunset12: astro.sunset ? formatTime24To12(astro.sunset) : '—',
        ishaStart12: astro.ishaStart ? formatTime24To12(astro.ishaStart) : '—',
        midnight12: astro.midnight ? formatTime24To12(astro.midnight) : '—',
        firstThird12: astro.firstThird ? formatTime24To12(astro.firstThird) : '—',
        nextFajrStart12: astro.nextFajrStart ? formatTime24To12(astro.nextFajrStart) : '—',
      },
    },
    jumuah: {
      visible: showJumuah,
      isFriday,
      configured: hasJumuahTime,
      time24: settings.jumuah_time || '',
      time12: hasJumuahTime ? formatTime24To12(settings.jumuah_time) : '',
      showAllWeek: settings.jumuah_show_all_week === 1,
      noteEn: settings.jumuah_note_en,
      noteUr: settings.jumuah_note_ur,
    },
    eid: {
      isActive: eid.is_active === 1,
      eidType: eid.eid_type,
      prayerDate: eid.prayer_date,
      prayerTime24: eid.prayer_time,
      prayerTime12: eid.prayer_time ? formatTime24To12(eid.prayer_time) : '',
      noteEn: eid.note_en,
      noteUr: eid.note_ur,
    },
    announcements,
  };
}
