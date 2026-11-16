export interface ScheduleRow {
  id?: number;
  month: number;
  day: number;
  fajr: string | null; // 24h 'HH:MM' or null
  asr: string | null;  // 24h 'HH:MM' or null
  isha: string | null; // 24h 'HH:MM' or null
  is_default_pdf?: number;
}

export interface ResolvedAnnualTimings {
  fajr: string;
  asr: string;
  isha: string;
  effectiveFrom: {
    fajr: { month: number; day: number };
    asr: { month: number; day: number };
    isha: { month: number; day: number };
  };
}

// Exact canonical annual timetable from Namaz Timings.pdf (Pages 1-3)
export const PDF_ANNUAL_SCHEDULE: ReadonlyArray<Omit<ScheduleRow, 'id' | 'is_default_pdf'>> = [
  { month: 1, day: 1, fajr: '06:40', asr: '16:45', isha: '19:45' },
  { month: 1, day: 10, fajr: null, asr: '17:00', isha: null },
  { month: 1, day: 22, fajr: null, asr: null, isha: '20:00' },
  { month: 2, day: 1, fajr: null, asr: '17:15', isha: null },
  { month: 2, day: 7, fajr: '06:35', asr: null, isha: null },
  { month: 2, day: 15, fajr: '06:30', asr: null, isha: null },
  { month: 2, day: 22, fajr: '06:25', asr: null, isha: '20:15' },
  { month: 2, day: 28, fajr: '06:20', asr: null, isha: null },
  { month: 3, day: 4, fajr: '06:15', asr: '17:30', isha: null },
  { month: 3, day: 9, fajr: '06:10', asr: null, isha: null },
  { month: 3, day: 14, fajr: '06:05', asr: null, isha: '20:30' },
  { month: 3, day: 19, fajr: '06:00', asr: null, isha: null },
  { month: 3, day: 24, fajr: '05:55', asr: null, isha: null },
  { month: 3, day: 29, fajr: '05:50', asr: null, isha: null },
  { month: 4, day: 4, fajr: '05:45', asr: null, isha: null },
  { month: 4, day: 8, fajr: '05:40', asr: null, isha: null },
  { month: 4, day: 13, fajr: '05:35', asr: null, isha: '20:45' },
  { month: 4, day: 19, fajr: '05:30', asr: null, isha: null },
  { month: 4, day: 25, fajr: '05:25', asr: null, isha: null },
  { month: 5, day: 1, fajr: '05:20', asr: null, isha: null },
  { month: 5, day: 8, fajr: '05:15', asr: null, isha: '21:00' },
  { month: 5, day: 19, fajr: '05:10', asr: null, isha: null },
  { month: 5, day: 28, fajr: null, asr: null, isha: '21:15' },
  { month: 6, day: 1, fajr: '05:05', asr: '17:45', isha: null },
  { month: 6, day: 29, fajr: '05:10', asr: null, isha: null },
  { month: 7, day: 12, fajr: '05:15', asr: null, isha: null },
  { month: 7, day: 23, fajr: '05:20', asr: null, isha: null },
  { month: 7, day: 29, fajr: null, asr: null, isha: '21:00' },
  { month: 8, day: 2, fajr: '05:25', asr: null, isha: null },
  { month: 8, day: 13, fajr: '05:30', asr: null, isha: null },
  { month: 8, day: 18, fajr: null, asr: null, isha: '20:45' },
  { month: 8, day: 26, fajr: '05:35', asr: '17:30', isha: null },
  { month: 8, day: 30, fajr: null, asr: null, isha: '20:30' },
  { month: 9, day: 8, fajr: '05:40', asr: null, isha: null },
  { month: 9, day: 13, fajr: null, asr: '17:15', isha: '20:15' },
  { month: 9, day: 22, fajr: '05:45', asr: null, isha: null },
  { month: 9, day: 26, fajr: null, asr: null, isha: '20:00' },
  { month: 9, day: 30, fajr: null, asr: '17:00', isha: null },
  { month: 10, day: 5, fajr: '05:50', asr: null, isha: null },
  { month: 10, day: 11, fajr: null, asr: null, isha: '19:45' },
  { month: 10, day: 16, fajr: '05:55', asr: '16:45', isha: null },
  { month: 10, day: 26, fajr: '06:00', asr: null, isha: null },
  { month: 10, day: 31, fajr: null, asr: null, isha: '19:30' },
  { month: 11, day: 2, fajr: '06:05', asr: null, isha: null },
  { month: 11, day: 10, fajr: '06:10', asr: null, isha: null },
  { month: 11, day: 17, fajr: '06:15', asr: '16:30', isha: null },
  { month: 11, day: 28, fajr: '06:20', asr: null, isha: null },
  { month: 12, day: 8, fajr: '06:30', asr: null, isha: null },
  { month: 12, day: 16, fajr: null, asr: '16:45', isha: null },
  { month: 12, day: 26, fajr: '06:40', asr: null, isha: '19:45' },
];

export function formatTime24To12(time24: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!match) return time24;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function addMinutesTo24Time(time24: string, offsetMinutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!match) return time24;
  const total = (Number(match[1]) * 60 + Number(match[2]) + offsetMinutes + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function isValidTime24(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/**
 * Resolves the active Fajr, Asr, and Isha timings for any (month, day)
 * using carry-forward semantics across the annual schedule, with clean
 * December-to-January wrap-around and leap-year (Feb 29) support.
 */
export function resolveAnnualTimingsForDate(
  rows: ReadonlyArray<ScheduleRow>,
  month: number,
  day: number,
): ResolvedAnnualTimings {
  const sorted = [...rows].sort((a, b) => a.month * 100 + a.day - (b.month * 100 + b.day));
  const targetKey = month * 100 + day;

  const resolveField = (field: 'fajr' | 'asr' | 'isha'): { value: string; month: number; day: number } => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const row = sorted[i];
      const key = row.month * 100 + row.day;
      const val = row[field];
      if (key <= targetKey && val) {
        return { value: val, month: row.month, day: row.day };
      }
    }
    for (let i = sorted.length - 1; i >= 0; i--) {
      const row = sorted[i];
      const val = row[field];
      if (val) {
        return { value: val, month: row.month, day: row.day };
      }
    }
    const defaults = { fajr: '06:40', asr: '16:45', isha: '19:45' };
    return { value: defaults[field], month: 1, day: 1 };
  };

  const fajr = resolveField('fajr');
  const asr = resolveField('asr');
  const isha = resolveField('isha');

  return {
    fajr: fajr.value,
    asr: asr.value,
    isha: isha.value,
    effectiveFrom: {
      fajr: { month: fajr.month, day: fajr.day },
      asr: { month: asr.month, day: asr.day },
      isha: { month: isha.month, day: isha.day },
    },
  };
}
