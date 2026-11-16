import type { PrayerItem } from '../types/timetable';

export interface KarachiClockSnapshot {
  isoDate: string;
  hours24: number;
  minutes: number;
  seconds: number;
  formattedTime12: string;
}

export function getKarachiNow(now: Date = new Date()): KarachiClockSnapshot {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hours24 = Number(get('hour'));
  if (hours24 === 24) hours24 = 0;
  const minutes = Number(get('minute'));
  const seconds = Number(get('second'));

  const period = hours24 >= 12 ? 'PM' : 'AM';
  const h12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const formattedTime12 = `${h12}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${period}`;

  return {
    isoDate: `${year}-${month}-${day}`,
    hours24,
    minutes,
    seconds,
    formattedTime12,
  };
}

export interface NextPrayerCountdown {
  nextPrayer: PrayerItem | null;
  isTomorrow: boolean;
  hours: number;
  minutes: number;
  seconds: number;
}

function parse24ToSeconds(time24: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time24 || '').trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

export function computeNextPrayer(
  prayers: PrayerItem[],
  clock: KarachiClockSnapshot,
): NextPrayerCountdown {
  const nowSec = clock.hours24 * 3600 + clock.minutes * 60 + clock.seconds;

  const valid = prayers
    .map((p) => ({ prayer: p, sec: parse24ToSeconds(p.time24) }))
    .filter((item): item is { prayer: PrayerItem; sec: number } => item.sec !== null);

  if (valid.length === 0) {
    return { nextPrayer: null, isTomorrow: false, hours: 0, minutes: 0, seconds: 0 };
  }

  for (const item of valid) {
    if (item.sec > nowSec) {
      const diff = item.sec - nowSec;
      return {
        nextPrayer: item.prayer,
        isTomorrow: false,
        hours: Math.floor(diff / 3600),
        minutes: Math.floor((diff % 3600) / 60),
        seconds: diff % 60,
      };
    }
  }

  // All prayers today have passed -> next is tomorrow's Fajr
  const fajr = valid[0];
  const diff = 86400 - nowSec + fajr.sec;
  return {
    nextPrayer: fajr.prayer,
    isTomorrow: true,
    hours: Math.floor(diff / 3600),
    minutes: Math.floor((diff % 3600) / 60),
    seconds: diff % 60,
  };
}

export interface PrayerEndingStatus {
  isInActiveWindow: boolean;
  isEndingSoon: boolean;
  remainingMinutes: number;
  effectiveEnd24?: string;
  effectiveEnd12?: string;
}

/**
 * Evaluates whether a prayer is currently in its valid astronomical window
 * and whether its ending time (Qaza threshold) is approaching within `thresholdMinutes`.
 * Optionally accepts `forcedEnd24` (e.g. today's Fajr start when Isha is in the pre-dawn Subh Sadiq window).
 */
export function getPrayerEndingStatus(
  prayer: PrayerItem,
  clock: KarachiClockSnapshot,
  thresholdMinutes: number,
  forcedEnd24?: string,
): PrayerEndingStatus {
  const startSec = parse24ToSeconds(prayer.astroStart24);
  const effectiveEnd24 = forcedEnd24 || prayer.endTime24;
  const endSec = parse24ToSeconds(effectiveEnd24);
  if (startSec === null || endSec === null || startSec === endSec) {
    return { isInActiveWindow: false, isEndingSoon: false, remainingMinutes: 0 };
  }

  const nowSec = clock.hours24 * 3600 + clock.minutes * 60 + clock.seconds;
  let remainingSec = -1;

  if (endSec > startSec) {
    if (nowSec >= startSec && nowSec < endSec) {
      remainingSec = endSec - nowSec;
    }
  } else {
    // Window crosses midnight (e.g. Isha 19:03 -> 00:16 or 05:30)
    if (nowSec >= startSec) {
      remainingSec = 86400 - nowSec + endSec;
    } else if (nowSec < endSec) {
      remainingSec = endSec - nowSec;
    }
  }

  if (remainingSec <= 0) {
    return { isInActiveWindow: false, isEndingSoon: false, remainingMinutes: 0 };
  }

  const remainingMinutes = Math.ceil(remainingSec / 60);
  const isEndingSoon = thresholdMinutes > 0 && remainingMinutes <= thresholdMinutes;
  return {
    isInActiveWindow: true,
    isEndingSoon,
    remainingMinutes,
    effectiveEnd24,
    effectiveEnd12: formatTime24To12Client(effectiveEnd24),
  };
}

export interface ActivePrayerState {
  activePrayer: PrayerItem | null;
  endingStatus: PrayerEndingStatus;
}

/**
 * Deterministically detects the single currently active prayer period in Asia/Karachi time.
 * Handles:
 * - Sunrise -> Dhuhr Start gap (no prayer active)
 * - Midnight & post-midnight Isha -> Fajr transitions (zero gap / zero overlap)
 * - Reverse-chronological precedence so overlapping manual overrides never activate two prayers
 */
export function getActivePrayerState(
  prayers: PrayerItem[],
  clock: KarachiClockSnapshot,
  thresholdMinutes: number,
  ishaEndRule?: 'subh_sadiq' | 'islamic_midnight' | 'first_third',
): ActivePrayerState {
  const byKey = new Map<PrayerItem['key'], PrayerItem>();
  for (const p of prayers) {
    byKey.set(p.key, p);
  }

  const fajr = byKey.get('fajr');
  const fajrStartSec = fajr ? parse24ToSeconds(fajr.astroStart24) : null;
  const nowSec = clock.hours24 * 3600 + clock.minutes * 60 + clock.seconds;

  // 1. Check same-day / post-Fajr daytime prayers in reverse chronological order:
  //    Isha (if now >= ishaStart), Maghrib, Asr, Zuhr, Fajr
  const isha = byKey.get('isha');
  if (isha) {
    const ishaStartSec = parse24ToSeconds(isha.astroStart24);
    if (ishaStartSec !== null && nowSec >= ishaStartSec) {
      const status = getPrayerEndingStatus(isha, clock, thresholdMinutes);
      if (status.isInActiveWindow) {
        return { activePrayer: isha, endingStatus: status };
      }
    }
  }

  const daytimeOrder: Array<PrayerItem['key']> = ['maghrib', 'asr', 'zuhr', 'fajr'];
  for (const key of daytimeOrder) {
    const prayer = byKey.get(key);
    if (!prayer) continue;
    const status = getPrayerEndingStatus(prayer, clock, thresholdMinutes);
    if (status.isInActiveWindow) {
      return { activePrayer: prayer, endingStatus: status };
    }
  }

  // 2. Check post-midnight Isha window (00:00 -> Fajr start or Islamic Midnight)
  if (isha && (fajrStartSec === null || nowSec < fajrStartSec)) {
    const ishaStartSec = parse24ToSeconds(isha.astroStart24);
    const ishaEndSec = parse24ToSeconds(isha.endTime24);
    if (ishaStartSec !== null && ishaEndSec !== null && ishaEndSec < ishaStartSec) {
      // When in pre-dawn morning under Subh Sadiq rule, today's Fajr start is the exact morning Subh Sadiq boundary
      const forcedMorningEnd =
        !isha.isEndOverridden && ishaEndRule === 'subh_sadiq' && fajr?.astroStart24
          ? fajr.astroStart24
          : undefined;
      const status = getPrayerEndingStatus(isha, clock, thresholdMinutes, forcedMorningEnd);
      if (status.isInActiveWindow) {
        return { activePrayer: isha, endingStatus: status };
      }
    }
  }

  return {
    activePrayer: null,
    endingStatus: { isInActiveWindow: false, isEndingSoon: false, remainingMinutes: 0 },
  };
}

export function formatTime24To12Client(time24: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time24 || '').trim());
  if (!m) return time24;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${period}`;
}

export function formatTime24ToUrduPhrase(time24: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time24 || '').trim());
  if (!m) return time24;
  const h = Number(m[1]);
  const min = m[2];
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const partOfDay =
    h >= 4 && h < 12
      ? 'صبح'
      : h >= 12 && h < 16
        ? 'دوپہر'
        : h >= 16 && h < 19
          ? 'شام'
          : 'رات';
  return `${partOfDay} ${h12}:${min} بجے`;
}
