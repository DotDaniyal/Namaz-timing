import type { PrayerItem, TimetablePayload } from '../types/timetable';
import {
  PDF_ANNUAL_SCHEDULE,
  formatTime24To12,
  resolveAnnualTimingsForDate,
} from './annualScheduleData';

function cleanAlAdhanTime(raw: string): string {
  const match = /(\d{1,2}):(\d{2})/.exec(raw || '');
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function getKarachiCalendarParts(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const weekdayEn = get('weekday') || 'Monday';
  const weekdayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  return {
    year,
    month,
    day,
    isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    weekdayEn,
    weekdayIndex: weekdayMap[weekdayEn] ?? 0,
    formattedEn: new Intl.DateTimeFormat('en-PK', {
      timeZone: 'Asia/Karachi',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now),
    formattedUr: new Intl.DateTimeFormat('ur-PK', {
      timeZone: 'Asia/Karachi',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now),
  };
}

interface AlAdhanClientPayload {
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

/**
 * Builds a complete canonical Masjid-e-Bilal timetable directly in the browser
 * when /api/timetable/today is unreachable (e.g. offline or static host fallback).
 */
export async function buildClientFallbackTimetable(): Promise<TimetablePayload> {
  const now = new Date();
  const karachi = getKarachiCalendarParts(now);
  const annual = resolveAnnualTimingsForDate(PDF_ANNUAL_SCHEDULE, karachi.month, karachi.day);

  const dd = String(karachi.day).padStart(2, '0');
  const mm = String(karachi.month).padStart(2, '0');
  const yyyy = karachi.year;

  let fajrStart = '';
  let sunrise = '';
  let dhuhrStart = '';
  let asrHanafi = '';
  let asrStandard = '';
  let sunset = '';
  let ishaStart = '';
  let midnight = '';
  let firstThird = '';
  let hijriDay = 0;
  let hijriMonthNumber = 0;
  let hijriMonthEn = '';
  let hijriMonthAr = '';
  let hijriYear = 0;
  let hijriWeekdayAr = '';
  let astroSource: 'aladhan' | 'unavailable' = 'unavailable';

  try {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), 5000);
    const [resHanafi, resStandard] = await Promise.all([
      fetch(
        `https://api.aladhan.com/v1/timingsByCity/${dd}-${mm}-${yyyy}?city=Karachi&country=Pakistan&method=1&school=1`,
        { signal: controller.signal },
      ),
      fetch(
        `https://api.aladhan.com/v1/timingsByCity/${dd}-${mm}-${yyyy}?city=Karachi&country=Pakistan&method=1&school=0`,
        { signal: controller.signal },
      ).catch(() => null),
    ]);
    globalThis.clearTimeout(timer);

    if (resHanafi.ok) {
      const json1 = (await resHanafi.json()) as AlAdhanClientPayload;
      const json0 = resStandard?.ok ? ((await resStandard.json()) as AlAdhanClientPayload) : null;
      const t1 = json1.data?.timings;
      const t0 = json0?.data?.timings;

      fajrStart = cleanAlAdhanTime(t1?.Fajr || '');
      sunrise = cleanAlAdhanTime(t1?.Sunrise || '');
      dhuhrStart = cleanAlAdhanTime(t1?.Dhuhr || '');
      asrHanafi = cleanAlAdhanTime(t1?.Asr || '');
      asrStandard = cleanAlAdhanTime(t0?.Asr || '') || asrHanafi;
      sunset = cleanAlAdhanTime(t1?.Sunset || '') || cleanAlAdhanTime(t1?.Maghrib || '');
      ishaStart = cleanAlAdhanTime(t1?.Isha || '');
      midnight = cleanAlAdhanTime(t1?.Midnight || '');
      firstThird = cleanAlAdhanTime(t1?.Firstthird || '');

      const h = json1.data?.date?.hijri;
      if (h?.day && h?.month?.en && h?.year) {
        hijriDay = Number(h.day) || 0;
        hijriMonthNumber = Number(h.month.number || 0);
        hijriMonthEn = h.month.en;
        hijriMonthAr = h.month.ar || '';
        hijriYear = Number(h.year) || 0;
        hijriWeekdayAr = h.weekday?.ar || '';
      }
      if (sunset && sunrise) {
        astroSource = 'aladhan';
      }
    }
  } catch {
    // Graceful offline fallback without crashing
  }

  const endSrcEn = astroSource === 'aladhan' ? 'AlAdhan Karachi Method 1' : 'Awaiting Astronomical Sync';
  const endSrcUr = astroSource === 'aladhan' ? 'الاذان کراچی (طریقہ ۱)' : 'فلکیاتی وقت دستیاب نہیں';

  const prayers: PrayerItem[] = [
    {
      key: 'fajr',
      nameEn: 'Fajr',
      nameUr: 'فجر',
      nameAr: 'الفجر',
      time24: annual.fajr,
      time12: formatTime24To12(annual.fajr),
      sourceLabelEn: 'Annual schedule',
      sourceLabelUr: 'سالانہ نقشہ',
      isOverridden: false,
      effectiveFrom: annual.effectiveFrom.fajr,
      astroStart24: fajrStart,
      astroStart12: fajrStart ? formatTime24To12(fajrStart) : '—',
      endTime24: sunrise,
      endTime12: sunrise ? formatTime24To12(sunrise) : '—',
      qazaStarts24: sunrise,
      qazaStarts12: sunrise ? formatTime24To12(sunrise) : '—',
      endSourceType: astroSource,
      endSourceLabelEn: endSrcEn,
      endSourceLabelUr: endSrcUr,
      endRuleLabelEn: 'Local Sunrise (Shuruq)',
      endRuleLabelUr: 'طلوعِ آفتاب (شروق)',
      isEndOverridden: false,
    },
    {
      key: 'zuhr',
      nameEn: 'Zuhr',
      nameUr: 'ظہر',
      nameAr: 'الظهر',
      time24: '13:30',
      time12: '1:30 PM',
      sourceLabelEn: 'Fixed year-round',
      sourceLabelUr: 'سال بھر مقررہ وقت',
      isOverridden: false,
      astroStart24: dhuhrStart,
      astroStart12: dhuhrStart ? formatTime24To12(dhuhrStart) : '—',
      endTime24: asrHanafi,
      endTime12: asrHanafi ? formatTime24To12(asrHanafi) : '—',
      qazaStarts24: asrHanafi,
      qazaStarts12: asrHanafi ? formatTime24To12(asrHanafi) : '—',
      endSourceType: astroSource,
      endSourceLabelEn: endSrcEn,
      endSourceLabelUr: endSrcUr,
      endRuleLabelEn: 'Hanafi Mithl Thani (2x Shadow Asr Start)',
      endRuleLabelUr: 'حنفی مثلِ ثانی (عصرِ حنفی کا آغاز)',
      isEndOverridden: false,
    },
    {
      key: 'asr',
      nameEn: 'Asr',
      nameUr: 'عصر',
      nameAr: 'العصر',
      time24: annual.asr,
      time12: formatTime24To12(annual.asr),
      sourceLabelEn: 'Annual schedule',
      sourceLabelUr: 'سالانہ نقشہ',
      isOverridden: false,
      effectiveFrom: annual.effectiveFrom.asr,
      astroStart24: asrHanafi,
      astroStart12: asrHanafi ? formatTime24To12(asrHanafi) : '—',
      endTime24: sunset,
      endTime12: sunset ? formatTime24To12(sunset) : '—',
      qazaStarts24: sunset,
      qazaStarts12: sunset ? formatTime24To12(sunset) : '—',
      endSourceType: astroSource,
      endSourceLabelEn: endSrcEn,
      endSourceLabelUr: endSrcUr,
      endRuleLabelEn: 'Local Sunset (Ghurub-e-Aftab)',
      endRuleLabelUr: 'غروبِ آفتاب',
      isEndOverridden: false,
    },
    {
      key: 'maghrib',
      nameEn: 'Maghrib',
      nameUr: 'مغرب',
      nameAr: 'المغرب',
      time24: sunset,
      time12: sunset ? formatTime24To12(sunset) : '—',
      sourceLabelEn: sunset ? 'Karachi sunset' : 'Awaiting sunset sync',
      sourceLabelUr: sunset ? 'غروبِ آفتاب کراچی' : 'غروبِ آفتاب دستیاب نہیں',
      isOverridden: false,
      sunsetTime24: sunset || undefined,
      sunsetTime12: sunset ? formatTime24To12(sunset) : undefined,
      offsetMinutes: 0,
      status: sunset ? 'live' : 'unavailable',
      astroStart24: sunset,
      astroStart12: sunset ? formatTime24To12(sunset) : '—',
      endTime24: ishaStart,
      endTime12: ishaStart ? formatTime24To12(ishaStart) : '—',
      qazaStarts24: ishaStart,
      qazaStarts12: ishaStart ? formatTime24To12(ishaStart) : '—',
      endSourceType: astroSource,
      endSourceLabelEn: endSrcEn,
      endSourceLabelUr: endSrcUr,
      endRuleLabelEn: 'Isha Start (Hanafi Shafaq Abyad)',
      endRuleLabelUr: 'غروبِ شفقِ ابیض (عشاء کا آغاز)',
      isEndOverridden: false,
    },
    {
      key: 'isha',
      nameEn: 'Isha',
      nameUr: 'عشاء',
      nameAr: 'العشاء',
      time24: annual.isha,
      time12: formatTime24To12(annual.isha),
      sourceLabelEn: 'Annual schedule',
      sourceLabelUr: 'سالانہ نقشہ',
      isOverridden: false,
      effectiveFrom: annual.effectiveFrom.isha,
      astroStart24: ishaStart,
      astroStart12: ishaStart ? formatTime24To12(ishaStart) : '—',
      endTime24: fajrStart,
      endTime12: fajrStart ? formatTime24To12(fajrStart) : '—',
      qazaStarts24: fajrStart,
      qazaStarts12: fajrStart ? formatTime24To12(fajrStart) : '—',
      endSourceType: astroSource,
      endSourceLabelEn: endSrcEn,
      endSourceLabelUr: endSrcUr,
      endRuleLabelEn: 'Subh Sadiq (True Dawn / Next Fajr)',
      endRuleLabelUr: 'صبح صادق (اگلی فجر کا آغاز)',
      isEndOverridden: false,
      crossesMidnight: true,
    },
  ];

  return {
    mosque: {
      nameEn: 'MASJID-E-BILAL',
      nameAr: 'مسجدِ بلال',
      timezone: 'Asia/Karachi',
      city: 'Karachi',
      country: 'Pakistan',
    },
    date: {
      karachiIso: karachi.isoDate,
      weekdayEn: karachi.weekdayEn,
      weekdayIndex: karachi.weekdayIndex,
      formattedGregorianEn: karachi.formattedEn,
      formattedGregorianUr: karachi.formattedUr,
      serverEpochMs: Date.now(),
      hijri: {
        day: hijriDay,
        monthNumber: hijriMonthNumber,
        monthEn: hijriMonthEn,
        monthAr: hijriMonthAr,
        year: hijriYear,
        weekdayAr: hijriWeekdayAr,
        source: astroSource,
        adjustmentDays: 0,
        manualOverrideEnabled: false,
      },
    },
    prayers,
    maghribMeta: {
      autoEnabled: true,
      sunsetTime24: sunset,
      sunsetTime12: sunset ? formatTime24To12(sunset) : '',
      offsetMinutes: 0,
      jamaatTime24: sunset,
      jamaatTime12: sunset ? formatTime24To12(sunset) : '',
      status: sunset ? 'live' : 'unavailable',
      fetchedAt: now.toISOString(),
      calculationMethod: 1,
    },
    qazaConfig: {
      enabledOnPublic: true,
      jurisprudencePolicy: 'hanafi',
      zuhrEndRule: 'asr_hanafi',
      maghribEndRule: 'isha_start',
      ishaEndRule: 'subh_sadiq',
      warningThresholdMinutes: 20,
      authorityVerifiedNote: '',
      astronomicalSource: astroSource,
      astronomicalFetchedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      astronomicalSnapshot: {
        fajrStart12: fajrStart ? formatTime24To12(fajrStart) : '—',
        sunrise12: sunrise ? formatTime24To12(sunrise) : '—',
        dhuhrStart12: dhuhrStart ? formatTime24To12(dhuhrStart) : '—',
        asrHanafi12: asrHanafi ? formatTime24To12(asrHanafi) : '—',
        asrStandard12: asrStandard ? formatTime24To12(asrStandard) : '—',
        sunset12: sunset ? formatTime24To12(sunset) : '—',
        ishaStart12: ishaStart ? formatTime24To12(ishaStart) : '—',
        midnight12: midnight ? formatTime24To12(midnight) : '—',
        firstThird12: firstThird ? formatTime24To12(firstThird) : '—',
        nextFajrStart12: fajrStart ? formatTime24To12(fajrStart) : '—',
      },
    },
    jumuah: {
      visible: true,
      isFriday: karachi.weekdayIndex === 5,
      configured: true,
      bayanTime24: '12:30',
      bayanTime12: '12:30 PM',
      khutbahTime24: '13:15',
      khutbahTime12: '1:15 PM',
      time24: '13:30',
      time12: '1:30 PM',
      showAllWeek: true,
      noteEn: '',
      noteUr: '',
    },
    eid: {
      isActive: false,
      eidType: 'fitr',
      prayerDate: '',
      prayerTime24: '',
      prayerTime12: '',
      noteEn: '',
      noteUr: '',
    },
    announcements: [],
  };
}
