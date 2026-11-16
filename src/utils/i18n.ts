import type { Language } from '../types/timetable';

export const COPY: Record<
  Language,
  {
    mosqueName: string;
    karachiLabel: string;
    nextPrayer: string;
    tomorrowFajr: string;
    hours: string;
    minutes: string;
    seconds: string;
    todaysPrayers: string;
    jamaatTime: string;
    jamaatTimeCap: string;
    prayerEndsCap: string;
    qazaStartsCap: string;
    endingSoon: string;
    ruleLabel: string;
    sourceLabel: string;
    startsAtLabel: string;
    detailsShow: string;
    detailsHide: string;
    qazaPolicyCaption: string;
    nextLabel: string;
    jumuahTitle: string;
    jumuahNotSet: string;
    eidFitrTitle: string;
    eidAdhaTitle: string;
    announcementsTitle: string;
    noAnnouncements: string;
    enableAlerts: string;
    alertsEnabled: string;
    disableAlerts: string;
    alertsNote: string;
    annualScheduleBtn: string;
    annualScheduleTitle: string;
    close: string;
    sunsetLabel: string;
    offsetLabel: string;
    jamaatLabel: string;
    cachedNotice: string;
    reduceMotion: string;
    standardMotion: string;
    adminAccess: string;
    karachiTimeLabel: string;
    hijriAdjusted: string;
    hijriManual: string;
    dateCol: string;
    fajrCol: string;
    asrCol: string;
    ishaCol: string;
    zuhrNotice: string;
    weekdays: Record<string, string>;
    categories: Record<string, string>;
  }
> = {
  en: {
    mosqueName: 'MASJID-E-BILAL',
    karachiLabel: 'Karachi, Pakistan (PKT)',
    nextPrayer: 'Next Prayer',
    tomorrowFajr: 'Tomorrow · Fajr',
    hours: 'Hours',
    minutes: 'Minutes',
    seconds: 'Seconds',
    todaysPrayers: "Today's Prayer Timetable",
    jamaatTime: 'Jamaat',
    jamaatTimeCap: 'JAMAAT TIME',
    prayerEndsCap: 'PRAYER ENDS',
    qazaStartsCap: 'QAZA STARTS',
    endingSoon: 'Ending in',
    ruleLabel: 'Ending Rule',
    sourceLabel: 'Source',
    startsAtLabel: 'Valid Window Starts',
    detailsShow: 'Details',
    detailsHide: 'Hide',
    qazaPolicyCaption: 'Karachi Method 1 · Hanafi Fiqh',
    nextLabel: 'Upcoming',
    jumuahTitle: "Jumu'ah Prayer",
    jumuahNotSet: "Jumu'ah timing will be updated by mosque administration.",
    eidFitrTitle: 'Eid-ul-Fitr Prayer',
    eidAdhaTitle: 'Eid-ul-Adha Prayer',
    announcementsTitle: 'Mosque Announcements',
    noAnnouncements: 'No active announcements at this time.',
    enableAlerts: 'Enable Prayer Alerts',
    alertsEnabled: 'Alerts Enabled',
    disableAlerts: 'Unsubscribe Alerts',
    alertsNote: 'Receive browser alerts when the mosque publishes new timing updates or notices.',
    annualScheduleBtn: 'View Annual Timetable',
    annualScheduleTitle: 'Masjid-e-Bilal Annual Schedule (Fajr, Asr & Isha)',
    close: 'Close',
    sunsetLabel: 'Karachi Sunset',
    offsetLabel: 'Mosque Offset',
    jamaatLabel: 'Maghrib Jamaat',
    cachedNotice: 'Using last verified Karachi sunset cache',
    reduceMotion: 'Reduced Motion',
    standardMotion: 'Animations On',
    adminAccess: 'Admin Panel',
    karachiTimeLabel: 'Karachi Local Time',
    hijriAdjusted: 'Moon-sighting adjusted',
    hijriManual: 'Local moon-sighting date',
    dateCol: 'Change Date',
    fajrCol: 'Fajr',
    asrCol: 'Asr',
    ishaCol: 'Isha',
    zuhrNotice: 'Zuhr remains fixed at 1:30 PM throughout the year.',
    weekdays: {
      Sunday: 'Sunday',
      Monday: 'Monday',
      Tuesday: 'Tuesday',
      Wednesday: 'Wednesday',
      Thursday: 'Thursday',
      Friday: 'Friday',
      Saturday: 'Saturday',
    },
    categories: {
      important: 'Important',
      timing: 'Timing Update',
      jumuah: "Jumu'ah",
      eid: 'Eid',
      general: 'Notice',
    },
  },
  ur: {
    mosqueName: 'مسجدِ بلال',
    karachiLabel: 'کراچی، پاکستان',
    nextPrayer: 'اگلی نماز',
    tomorrowFajr: 'کل · فجر',
    hours: 'گھنٹے',
    minutes: 'منٹ',
    seconds: 'سیکنڈ',
    todaysPrayers: 'آج کے اوقاتِ نماز',
    jamaatTime: 'جماعت',
    jamaatTimeCap: 'وقتِ جماعت',
    prayerEndsCap: 'اختتامِ وقت',
    qazaStartsCap: 'قضا شروع',
    endingSoon: 'اختتام میں باقی',
    ruleLabel: 'شرعی قاعدہ',
    sourceLabel: 'ماخذ',
    startsAtLabel: 'ابتدائے وقت',
    detailsShow: 'تفصیل',
    detailsHide: 'بند',
    qazaPolicyCaption: 'کراچی طریقہ ۱ · فقہ حنفی',
    nextLabel: 'اگلی',
    jumuahTitle: 'جمعہ کی نماز',
    jumuahNotSet: 'جمعہ کی نماز کا وقت مسجد انتظامیہ جلد مقرر کرے گی۔',
    eidFitrTitle: 'نمازِ عید الفطر',
    eidAdhaTitle: 'نمازِ عید الاضحیٰ',
    announcementsTitle: 'مسجد کے اعلانات',
    noAnnouncements: 'اس وقت کوئی نیا اعلان موجود نہیں ہے۔',
    enableAlerts: 'اطلاعات فعال کریں',
    alertsEnabled: 'اطلاعات فعال ہیں',
    disableAlerts: 'اطلاعات بند کریں',
    alertsNote: 'مسجد کی جانب سے نئے اعلانات یا اوقات کی تبدیلی پر اطلاع حاصل کریں۔',
    annualScheduleBtn: 'سالانہ نقشہ دیکھیں',
    annualScheduleTitle: 'مسجدِ بلال سالانہ اوقاتِ نماز (فجر، عصر، عشاء)',
    close: 'بند کریں',
    sunsetLabel: 'غروبِ آفتاب کراچی',
    offsetLabel: 'مسجد کا وقفہ',
    jamaatLabel: 'جماعت مغرب',
    cachedNotice: 'محفوظ شدہ کراچی غروبِ آفتاب کا وقت دکھایا جا رہا ہے',
    reduceMotion: 'مختصر حرکات',
    standardMotion: 'حرکات فعال',
    adminAccess: 'ایڈمن پینل',
    karachiTimeLabel: 'کراچی کا مقامی وقت',
    hijriAdjusted: 'رویتِ ہلال کے مطابق ترمیم',
    hijriManual: 'مقامی رویتِ ہلال تاریخ',
    dateCol: 'تبدیلی کی تاریخ',
    fajrCol: 'فجر',
    asrCol: 'عصر',
    ishaCol: 'عشاء',
    zuhrNotice: 'نمازِ ظہر پورے سال 1:30 PM پر مقرر ہے۔',
    weekdays: {
      Sunday: 'اتوار',
      Monday: 'پیر',
      Tuesday: 'منگل',
      Wednesday: 'بدھ',
      Thursday: 'جمعرات',
      Friday: 'جمعہ',
      Saturday: 'ہفتہ',
    },
    categories: {
      important: 'اہم اعلان',
      timing: 'اوقات میں تبدیلی',
      jumuah: 'جمعہ',
      eid: 'عید',
      general: 'اطلاع',
    },
  },
};

export const MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const MONTH_NAMES_UR = [
  'جنوری',
  'فروری',
  'مارچ',
  'اپریل',
  'مئی',
  'جون',
  'جولائی',
  'اگست',
  'ستمبر',
  'اکتوبر',
  'نومبر',
  'دسمبر',
];
