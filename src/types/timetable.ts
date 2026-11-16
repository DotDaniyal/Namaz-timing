export type Language = 'en' | 'ur';

export interface PrayerItem {
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

export interface AnnouncementItem {
  id: number;
  title_en: string;
  title_ur: string;
  body_en: string;
  body_ur: string;
  category: 'important' | 'timing' | 'jumuah' | 'eid' | 'general';
  is_published?: number;
  start_date: string | null;
  expiry_date: string | null;
  created_at: string;
}

export interface QazaConfig {
  enabledOnPublic: boolean;
  jurisprudencePolicy: 'hanafi' | 'standard';
  zuhrEndRule: 'asr_hanafi' | 'asr_standard';
  maghribEndRule: 'isha_start';
  ishaEndRule: 'subh_sadiq' | 'islamic_midnight' | 'first_third';
  warningThresholdMinutes: number;
  authorityVerifiedNote: string;
  astronomicalSource: 'aladhan' | 'cached' | 'unavailable';
  astronomicalFetchedAt: string;
  updatedAt: string;
  astronomicalSnapshot: {
    fajrStart12: string;
    sunrise12: string;
    dhuhrStart12: string;
    asrHanafi12: string;
    asrStandard12: string;
    sunset12: string;
    ishaStart12: string;
    midnight12: string;
    firstThird12: string;
    nextFajrStart12: string;
  };
}

export interface TimetablePayload {
  mosque: {
    nameEn: string;
    nameAr: string;
    timezone: string;
    city: string;
    country: string;
  };
  date: {
    karachiIso: string;
    weekdayEn: string;
    weekdayIndex: number;
    formattedGregorianEn: string;
    formattedGregorianUr: string;
    serverEpochMs: number;
    hijri: {
      day: number;
      monthNumber: number;
      monthEn: string;
      monthAr: string;
      year: number;
      weekdayAr: string;
      source: 'aladhan' | 'cached' | 'manual' | 'unavailable';
      adjustmentDays: number;
      manualOverrideEnabled: boolean;
    };
  };
  prayers: PrayerItem[];
  maghribMeta: {
    autoEnabled: boolean;
    sunsetTime24: string;
    sunsetTime12: string;
    offsetMinutes: number;
    jamaatTime24: string;
    jamaatTime12: string;
    status: 'live' | 'cached' | 'manual' | 'unavailable';
    fetchedAt: string;
    calculationMethod: number;
  };
  qazaConfig: QazaConfig;
  jumuah: {
    visible: boolean;
    isFriday: boolean;
    configured: boolean;
    bayanTime24: string;
    bayanTime12: string;
    khutbahTime24: string;
    khutbahTime12: string;
    time24: string;
    time12: string;
    showAllWeek: boolean;
    noteEn: string;
    noteUr: string;
  };
  eid: {
    isActive: boolean;
    eidType: 'fitr' | 'adha';
    prayerDate: string;
    prayerTime24: string;
    prayerTime12: string;
    noteEn: string;
    noteUr: string;
  };
  announcements: AnnouncementItem[];
}

export interface AnnualScheduleRow {
  id: number;
  month: number;
  day: number;
  fajr: string | null;
  asr: string | null;
  isha: string | null;
  is_default_pdf: number;
}
