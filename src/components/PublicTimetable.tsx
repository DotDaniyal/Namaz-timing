import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  Settings,
  Sparkles,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { Language, TimetablePayload } from '../types/timetable';
import { COPY, MONTH_NAMES_EN, MONTH_NAMES_UR } from '../utils/i18n';
import {
  computeNextPrayer,
  getKarachiNow,
  getPrayerEndingStatus,
  type KarachiClockSnapshot,
} from '../utils/karachiClock';
import { AnnualScheduleModal } from './AnnualScheduleModal';
import { MosqueEmblem } from './MosqueEmblem';

interface PublicTimetableProps {
  data: TimetablePayload | null;
  loading: boolean;
  error: string;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  reduceMotion: boolean;
  onToggleReduceMotion: () => void;
  onOpenAdmin: () => void;
  onRefresh: () => void;
}

export const PublicTimetable: React.FC<PublicTimetableProps> = ({
  data,
  loading,
  error,
  language,
  onLanguageChange,
  reduceMotion,
  onToggleReduceMotion,
  onOpenAdmin,
  onRefresh,
}) => {
  const t = COPY[language];
  const isUrdu = language === 'ur';
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const [clock, setClock] = useState<KarachiClockSnapshot>(() => getKarachiNow());
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [expandedPrayers, setExpandedPrayers] = useState<Record<string, boolean>>({});

  const togglePrayerDetails = (key: string) => {
    setExpandedPrayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Visitor browser alert subscription state (opt-in only, never auto-requested)
  const [alertsSubscribed, setAlertsSubscribed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('masjid_alerts_subscribed') === 'true';
    } catch {
      return false;
    }
  });
  const [alertFeedback, setAlertFeedback] = useState('');

  // Tick Karachi clock every second & trigger daily refresh when Karachi date rolls over
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = getKarachiNow();
      setClock(next);
      if (data && next.isoDate !== data.date.karachiIso) {
        onRefresh();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [data, onRefresh]);

  // Poll for newly published mosque notifications when visitor opted in
  useEffect(() => {
    if (!alertsSubscribed) return;
    let lastId = Number(localStorage.getItem('masjid_last_dispatch_id') || '0');
    const checkDispatches = async () => {
      try {
        const res = await fetch(`/api/notifications/latest?sinceId=${lastId}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          dispatches?: Array<{ id: number; title: string; body: string }>;
        };
        const items = json.dispatches || [];
        if (items.length > 0) {
          const newest = items[0];
          lastId = newest.id;
          localStorage.setItem('masjid_last_dispatch_id', String(newest.id));
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(`Masjid-e-Bilal: ${newest.title}`, {
              body: newest.body,
              icon: '/pwa-192x192.png',
            });
          }
        }
      } catch {
        // Silent network retry
      }
    };
    const timer = window.setInterval(checkDispatches, 30000);
    return () => window.clearInterval(timer);
  }, [alertsSubscribed]);

  const countdown = useMemo(() => {
    if (!data) return null;
    return computeNextPrayer(data.prayers, clock);
  }, [data, clock]);

  const handleToggleAlerts = async () => {
    setAlertFeedback('');
    if (alertsSubscribed) {
      const token = localStorage.getItem('masjid_sub_token') || '';
      if (token) {
        await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpointOrToken: token }),
        }).catch(() => {});
      }
      localStorage.setItem('masjid_alerts_subscribed', 'false');
      setAlertsSubscribed(false);
      return;
    }

    if (typeof Notification === 'undefined') {
      setAlertFeedback(
        isUrdu
          ? 'اس براؤزر میں اطلاعات دستیاب نہیں ہیں۔'
          : 'Browser notifications are not supported on this device.',
      );
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setAlertFeedback(
        isUrdu
          ? 'براہ کرم براؤزر سیٹنگز سے اطلاعات کی اجازت دیں۔'
          : 'Notification permission was declined.',
      );
      return;
    }

    let token = localStorage.getItem('masjid_sub_token');
    if (!token) {
      token = `web-${crypto.randomUUID()}`;
      localStorage.setItem('masjid_sub_token', token);
    }

    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpointOrToken: token,
        deviceLabel: navigator.userAgent.slice(0, 60),
      }),
    }).catch(() => {});

    localStorage.setItem('masjid_alerts_subscribed', 'true');
    setAlertsSubscribed(true);
  };

  const formatEffectiveMonthDay = (month: number, day: number) => {
    const mName = isUrdu ? MONTH_NAMES_UR[month - 1] : MONTH_NAMES_EN[month - 1];
    return `${String(day).padStart(2, '0')} ${mName}`;
  };

  const weekdayText = data
    ? isUrdu
      ? t.weekdays[data.date.weekdayEn] || data.date.weekdayEn
      : data.date.weekdayEn
    : '';

  return (
    <div
      className={`min-h-dvh islamic-lattice-bg pb-12 ${reduceMotion ? 'reduce-motion' : ''}`}
      dir={isUrdu ? 'rtl' : 'ltr'}
    >
      {/* Compact Mosque Top Header */}
      <header className="sticky top-0 z-30 bg-[#FAF8F4]/92 backdrop-blur-md border-b border-[#0B3B2B]/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <MosqueEmblem className="w-10 h-10 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h1 className="font-display text-lg sm:text-xl font-bold tracking-wide text-[#0B3B2B] whitespace-nowrap">
                  MASJID-E-BILAL
                </h1>
                <span className="font-arabic text-base sm:text-lg font-semibold text-[#B68D40] whitespace-nowrap">
                  مسجدِ بلال
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0" dir="ltr">
            {/* Language Switch: English | اردو */}
            <div
              className="flex items-center p-1 rounded-xl bg-[#F3EFE6] border border-[#0B3B2B]/10"
              role="group"
              aria-label="Language switch"
            >
              <button
                type="button"
                onClick={() => onLanguageChange('en')}
                className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  language === 'en'
                    ? 'bg-[#0B3B2B] text-[#FAF8F4]'
                    : 'text-[#15241E]/75 hover:text-[#0B3B2B]'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange('ur')}
                className={`min-h-[34px] px-2.5 rounded-lg text-xs font-arabic font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  language === 'ur'
                    ? 'bg-[#0B3B2B] text-[#FAF8F4]'
                    : 'text-[#15241E]/75 hover:text-[#0B3B2B]'
                }`}
              >
                اردو
              </button>
            </div>

            {/* Reduced motion toggle */}
            <button
              type="button"
              onClick={onToggleReduceMotion}
              title={reduceMotion ? t.standardMotion : t.reduceMotion}
              aria-label={reduceMotion ? t.standardMotion : t.reduceMotion}
              className={`hidden sm:flex min-h-[44px] px-3 items-center gap-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                reduceMotion
                  ? 'border-[#B68D40] bg-[#F3EFE6] text-[#0B3B2B]'
                  : 'border-[#0B3B2B]/12 bg-white text-[#15241E]/75 hover:text-[#0B3B2B]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">{reduceMotion ? t.reduceMotion : t.standardMotion}</span>
            </button>

            {/* PWA Install Button */}
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="min-h-[44px] px-3 flex items-center gap-1.5 rounded-xl bg-[#0B3B2B] text-[#FAF8F4] text-xs font-medium hover:bg-[#072A1E] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Install</span>
              </button>
            )}
            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                aria-label="Install app on iOS"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#0B3B2B]/15 bg-white text-[#0B3B2B] cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
            )}

            {/* Discreet Admin Panel Access Icon */}
            <button
              type="button"
              onClick={onOpenAdmin}
              aria-label={t.adminAccess}
              title={t.adminAccess}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#0B3B2B]/12 bg-white text-[#0B3B2B]/75 hover:text-[#0B3B2B] hover:border-[#0B3B2B]/30 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-5 sm:pt-7 space-y-5">
        {!isOnline && (
          <div className="rounded-xl border border-[#B68D40]/40 bg-[#F3EFE6] px-4 py-3 text-xs sm:text-sm text-[#15241E]">
            {isUrdu
              ? 'آف لائن موڈ — محفوظ شدہ اوقاتِ نماز دکھائے جا رہے ہیں۔'
              : 'Offline mode — showing last saved prayer timetable.'}
          </div>
        )}

        {loading && !data && (
          <div className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-10 text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full border-2 border-[#0B3B2B]/20 border-t-[#0B3B2B] animate-spin" />
            <p className="text-sm text-[#15241E]/70">
              {isUrdu ? 'اوقاتِ نماز لوڈ ہو رہے ہیں...' : 'Loading Masjid-e-Bilal timetable...'}
            </p>
          </div>
        )}

        {error && !data && (
          <div className="rounded-2xl bg-white border border-red-200 p-6 text-center space-y-3">
            <p className="text-sm text-red-800">{error}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-xl bg-[#0B3B2B] text-white text-sm font-medium cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        )}

        {data && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
          >
            {/* LEFT / PRIMARY COLUMN: Dates, Next Prayer Countdown, Five Daily Prayers */}
            <div className="lg:col-span-7 space-y-5">
              {/* Automatic Date & Karachi Local Time Strip */}
              <section
                aria-label="Current dates and Karachi local time"
                className="rounded-2xl bg-white border border-[#0B3B2B]/10 px-4 sm:px-5 py-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm sm:text-base font-semibold text-[#15241E]">
                      <span>{weekdayText}</span>
                      <span aria-hidden="true" className="text-[#B68D40]">·</span>
                      <span>
                        {isUrdu ? data.date.formattedGregorianUr : data.date.formattedGregorianEn}
                      </span>
                    </div>

                    {data.date.hijri.day > 0 ? (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm text-[#0B3B2B]/85">
                        <span className="font-medium">
                          {data.date.hijri.day} {data.date.hijri.monthEn} {data.date.hijri.year} AH
                        </span>
                        {data.date.hijri.monthAr && (
                          <>
                            <span aria-hidden="true" className="text-[#B68D40]">·</span>
                            <span className="font-arabic text-sm text-[#0B3B2B]">
                              {data.date.hijri.day} {data.date.hijri.monthAr} {data.date.hijri.year}
                            </span>
                          </>
                        )}
                        {(data.date.hijri.manualOverrideEnabled || data.date.hijri.adjustmentDays !== 0) && (
                          <>
                            <span aria-hidden="true" className="text-[#B68D40]">·</span>
                            <span className="text-xs text-[#B68D40] font-medium">
                              {data.date.hijri.manualOverrideEnabled ? t.hijriManual : t.hijriAdjusted}
                            </span>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[#15241E]/60">
                        {isUrdu ? 'ہجری تاریخ دستیاب نہیں' : 'Hijri calendar awaiting sync'}
                      </p>
                    )}
                  </div>

                  <div className={`${isUrdu ? 'sm:text-left' : 'sm:text-right'} shrink-0`} dir="ltr">
                    <div className="text-[11px] font-medium text-[#15241E]/55">
                      {t.karachiTimeLabel}
                    </div>
                    <div className="font-mono-tabular text-base sm:text-lg font-semibold text-[#0B3B2B]">
                      {clock.formattedTime12}
                    </div>
                  </div>
                </div>
              </section>

              {/* Focal Hero Anchor: Next Prayer Live Countdown */}
              {countdown?.nextPrayer && (
                <section
                  aria-label="Next prayer countdown"
                  className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B3B2B] to-[#072A1E] text-[#FAF8F4] p-5 sm:p-6 shadow-md"
                >
                  <div className="islamic-arch-pattern absolute inset-0 pointer-events-none" />
                  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium tracking-wider text-[#F5E6C4]/80">
                        {countdown.isTomorrow ? t.tomorrowFajr : t.nextPrayer}
                      </div>
                      <div className="flex items-baseline gap-3">
                        <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
                          {isUrdu ? countdown.nextPrayer.nameUr : countdown.nextPrayer.nameEn}
                        </h2>
                        <span className="font-arabic text-xl sm:text-2xl text-[#C9A24D]">
                          {countdown.nextPrayer.nameAr}
                        </span>
                      </div>
                      <div className="text-sm text-[#F5E6C4]/90 font-mono-tabular">
                        {t.jamaatTime}: {countdown.nextPrayer.time12}
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-2 sm:gap-3 self-start sm:self-center"
                      dir="ltr"
                      aria-live="off"
                    >
                      {[
                        { val: countdown.hours, label: t.hours },
                        { val: countdown.minutes, label: t.minutes },
                        { val: countdown.seconds, label: t.seconds },
                      ].map((unit, idx) => (
                        <React.Fragment key={unit.label}>
                          <div className="min-w-[66px] sm:min-w-[74px] rounded-xl bg-white/10 border border-[#C9A24D]/30 px-3 py-2.5 text-center">
                            <AnimatePresence mode="popLayout" initial={false}>
                              <motion.div
                                key={unit.val}
                                initial={reduceMotion ? false : { opacity: 0.6, y: -3 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18 }}
                                className="font-mono-tabular text-2xl sm:text-3xl font-semibold text-white leading-none"
                              >
                                {String(unit.val).padStart(2, '0')}
                              </motion.div>
                            </AnimatePresence>
                            <div className="mt-1 text-[11px] text-[#F5E6C4]/75">{unit.label}</div>
                          </div>
                          {idx < 2 && (
                            <span className="text-xl font-semibold text-[#C9A24D] select-none">:</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Today's Five Daily Prayers Timetable */}
              <section
                aria-label="Daily prayer timetable"
                className="rounded-2xl bg-white border border-[#0B3B2B]/10 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#0B3B2B]/10">
                  <div>
                    <h2
                      className={`text-base sm:text-lg font-semibold text-[#0B3B2B] ${
                        isUrdu ? 'font-arabic' : 'font-display text-xl'
                      }`}
                    >
                      {t.todaysPrayers}
                    </h2>
                    {data.qazaConfig?.enabledOnPublic && (
                      <p className="text-[11px] text-[#15241E]/60 mt-0.5">
                        {data.qazaConfig.jurisprudencePolicy === 'standard'
                          ? isUrdu
                            ? 'کراچی طریقہ ۱ · جمہور فقہ'
                            : 'Karachi Method 1 · Standard Fiqh'
                          : t.qazaPolicyCaption}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(true)}
                    className="min-h-[40px] inline-flex items-center gap-1 text-xs font-semibold text-[#0B3B2B] hover:text-[#B68D40] transition-colors cursor-pointer shrink-0"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>{t.annualScheduleBtn}</span>
                    <ChevronRight className={`w-3.5 h-3.5 ${isUrdu ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                <div className="divide-y divide-[#0B3B2B]/8">
                  {data.prayers.map((prayer) => {
                    const isNext =
                      countdown?.nextPrayer?.key === prayer.key && !countdown.isTomorrow;
                    const qazaEnabled = Boolean(data.qazaConfig?.enabledOnPublic);
                    const endingStatus = qazaEnabled
                      ? getPrayerEndingStatus(
                          prayer,
                          clock,
                          data.qazaConfig?.warningThresholdMinutes ?? 20,
                        )
                      : { isInActiveWindow: false, isEndingSoon: false, remainingMinutes: 0 };
                    const isExpanded = Boolean(expandedPrayers[prayer.key]);
                    const endNote = isUrdu ? prayer.endNoteUr : prayer.endNoteEn;

                    return (
                      <div
                        key={prayer.key}
                        className={`px-4 sm:px-5 py-4 transition-colors ${
                          endingStatus.isEndingSoon
                            ? 'bg-amber-50/75 ring-1 ring-inset ring-amber-400/60'
                            : isNext
                              ? 'bg-[#0B3B2B]/[0.05] ring-1 ring-inset ring-[#C9A24D]/55'
                              : 'hover:bg-[#FAF8F4]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1 flex-1">
                            <div className="flex items-baseline gap-2.5 flex-wrap">
                              <span className="text-base sm:text-lg font-semibold text-[#15241E]">
                                {isUrdu ? prayer.nameUr : prayer.nameEn}
                              </span>
                              <span className="font-arabic text-base text-[#0B3B2B]/75">
                                {isUrdu ? prayer.nameEn : prayer.nameUr}
                              </span>
                              {isNext && (
                                <span className="text-xs font-semibold text-[#B68D40]">
                                  · {t.nextLabel}
                                </span>
                              )}
                              {endingStatus.isEndingSoon && (
                                <span className="text-xs font-semibold text-amber-900">
                                  · {t.endingSoon} {endingStatus.remainingMinutes}{' '}
                                  {isUrdu ? 'منٹ' : 'min'}
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-[#15241E]/60 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span>{isUrdu ? prayer.sourceLabelUr : prayer.sourceLabelEn}</span>
                              {prayer.effectiveFrom && !prayer.isOverridden && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {isUrdu ? 'نافذ از' : 'From'}{' '}
                                    {formatEffectiveMonthDay(
                                      prayer.effectiveFrom.month,
                                      prayer.effectiveFrom.day,
                                    )}
                                  </span>
                                </>
                              )}
                              {prayer.key === 'maghrib' &&
                                prayer.sunsetTime12 &&
                                prayer.status !== 'manual' && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="tabular-nums">
                                      {t.sunsetLabel}: {prayer.sunsetTime12}
                                      {typeof prayer.offsetMinutes === 'number' &&
                                      prayer.offsetMinutes !== 0
                                        ? ` (${prayer.offsetMinutes > 0 ? '+' : ''}${prayer.offsetMinutes} min)`
                                        : ''}
                                    </span>
                                  </>
                                )}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            <div className="text-right" dir="ltr">
                              <div
                                className={`font-mono-tabular text-xl sm:text-2xl font-semibold leading-tight ${
                                  endingStatus.isEndingSoon
                                    ? 'text-amber-950'
                                    : isNext
                                      ? 'text-[#0B3B2B]'
                                      : 'text-[#15241E]'
                                }`}
                              >
                                {prayer.time12}
                              </div>
                            </div>

                            {qazaEnabled && (
                              <button
                                type="button"
                                onClick={() => togglePrayerDetails(prayer.key)}
                                aria-expanded={isExpanded}
                                aria-label={`${isUrdu ? prayer.nameUr : prayer.nameEn} ${
                                  isExpanded ? t.detailsHide : t.detailsShow
                                }`}
                                className="min-h-[44px] min-w-[44px] px-2.5 inline-flex items-center justify-center gap-1 rounded-xl border border-[#0B3B2B]/12 bg-white/80 text-[11px] font-semibold text-[#0B3B2B] hover:border-[#0B3B2B]/30 transition-colors cursor-pointer"
                              >
                                <span className="hidden sm:inline">
                                  {isExpanded ? t.detailsHide : t.detailsShow}
                                </span>
                                <ChevronDown
                                  className={`w-4 h-4 transition-transform ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* JAMAAT TIME | PRAYER ENDS | QAZA STARTS strip */}
                        {qazaEnabled && (
                          <div className="mt-3 pt-2.5 border-t border-[#0B3B2B]/8 grid grid-cols-3 gap-2 sm:gap-4">
                            <div>
                              <div className="text-[10px] font-semibold tracking-wider text-[#15241E]/55 uppercase">
                                {t.jamaatTimeCap}
                              </div>
                              <div
                                className="font-mono-tabular text-xs sm:text-sm font-semibold text-[#0B3B2B] mt-0.5"
                                dir="ltr"
                              >
                                {prayer.time12}
                              </div>
                            </div>

                            <div>
                              <div className="text-[10px] font-semibold tracking-wider text-[#15241E]/55 uppercase">
                                {t.prayerEndsCap}
                              </div>
                              <div
                                className={`font-mono-tabular text-xs sm:text-sm font-semibold mt-0.5 ${
                                  endingStatus.isEndingSoon ? 'text-amber-900' : 'text-[#15241E]'
                                }`}
                                dir="ltr"
                              >
                                {prayer.endTime12 || '—'}
                                {prayer.isEndOverridden && (
                                  <span className="ml-1 text-[10px] font-sans font-medium text-[#B68D40]">
                                    ({isUrdu ? 'دستی' : 'Manual'})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="text-[10px] font-semibold tracking-wider text-[#15241E]/55 uppercase">
                                {t.qazaStartsCap}
                              </div>
                              <div
                                className={`font-mono-tabular text-xs sm:text-sm font-semibold mt-0.5 ${
                                  endingStatus.isEndingSoon ? 'text-amber-900' : 'text-[#7A5920]'
                                }`}
                                dir="ltr"
                              >
                                {prayer.qazaStarts12 || '—'}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Expandable jurisprudential & source accuracy details */}
                        {qazaEnabled && isExpanded && (
                          <div className="mt-3 rounded-xl bg-[#FAF8F4] border border-[#0B3B2B]/10 px-3.5 py-3 text-xs space-y-1.5 text-[#15241E]/80">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                              <span>
                                <strong className="text-[#0B3B2B]">{t.startsAtLabel}:</strong>{' '}
                                <span className="font-mono-tabular" dir="ltr">
                                  {prayer.astroStart12 || '—'}
                                </span>
                              </span>
                              <span>
                                <strong className="text-[#0B3B2B]">{t.sourceLabel}:</strong>{' '}
                                {isUrdu ? prayer.endSourceLabelUr : prayer.endSourceLabelEn}
                              </span>
                            </div>
                            <div>
                              <strong className="text-[#0B3B2B]">{t.ruleLabel}:</strong>{' '}
                              {isUrdu ? prayer.endRuleLabelUr : prayer.endRuleLabelEn}
                            </div>
                            {endNote && (
                              <p className="text-[11px] text-[#15241E]/70 leading-relaxed pt-0.5">
                                {endNote}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {(data.maghribMeta.status === 'cached' ||
                  (data.qazaConfig?.enabledOnPublic && data.qazaConfig.authorityVerifiedNote)) && (
                  <div className="px-5 py-2.5 bg-[#F3EFE6] border-t border-[#0B3B2B]/10 text-xs text-[#15241E]/75 space-y-1">
                    {data.maghribMeta.status === 'cached' && <div>{t.cachedNotice}</div>}
                    {data.qazaConfig?.enabledOnPublic && data.qazaConfig.authorityVerifiedNote && (
                      <div>{data.qazaConfig.authorityVerifiedNote}</div>
                    )}
                  </div>
                )}
              </section>
            </div>

            {/* RIGHT / SECONDARY COLUMN: Jumu'ah, Eid (when active), Announcements & Alerts */}
            <div className="lg:col-span-5 space-y-5">
              {/* Jumu'ah Prayer Card (prominent on Fridays, or when configured & shown all week) */}
              {data.jumuah.visible && (
                <section
                  aria-label="Jumu'ah prayer"
                  className={`rounded-2xl p-5 border ${
                    data.jumuah.isFriday
                      ? 'bg-[#F3EFE6] border-[#C9A24D]/60'
                      : 'bg-white border-[#0B3B2B]/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h2 className="font-display text-xl font-bold text-[#0B3B2B]">
                        {t.jumuahTitle}
                      </h2>
                      <div className="font-arabic text-lg font-semibold text-[#B68D40]">
                        جمعہ کی نماز
                      </div>
                    </div>
                    {data.jumuah.configured && (
                      <div
                        className="font-mono-tabular text-2xl font-bold text-[#0B3B2B]"
                        dir="ltr"
                      >
                        {data.jumuah.time12}
                      </div>
                    )}
                  </div>

                  {!data.jumuah.configured && (
                    <p className="mt-3 text-sm text-[#15241E]/75">{t.jumuahNotSet}</p>
                  )}

                  {(isUrdu ? data.jumuah.noteUr : data.jumuah.noteEn) && (
                    <p className="mt-3 text-sm text-[#15241E]/80 leading-relaxed">
                      {isUrdu ? data.jumuah.noteUr : data.jumuah.noteEn}
                    </p>
                  )}
                </section>
              )}

              {/* Eid Prayer Announcement (hidden when not active) */}
              {data.eid.isActive && (
                <section
                  aria-label="Eid prayer announcement"
                  className="rounded-2xl bg-[#0B3B2B] text-[#FAF8F4] p-5 border border-[#C9A24D]/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">
                        {data.eid.eidType === 'fitr' ? t.eidFitrTitle : t.eidAdhaTitle}
                      </h2>
                      <p className="font-arabic text-base text-[#F5E6C4]">
                        {data.eid.eidType === 'fitr' ? 'نمازِ عید الفطر' : 'نمازِ عید الاضحیٰ'}
                      </p>
                    </div>
                    {data.eid.prayerTime12 && (
                      <div className="font-mono-tabular text-2xl font-bold text-[#C9A24D]" dir="ltr">
                        {data.eid.prayerTime12}
                      </div>
                    )}
                  </div>
                  {data.eid.prayerDate && (
                    <p className="mt-2 text-sm text-[#F5E6C4]/90">{data.eid.prayerDate}</p>
                  )}
                  {(isUrdu ? data.eid.noteUr : data.eid.noteEn) && (
                    <p className="mt-2 text-sm text-[#FAF8F4]/85 leading-relaxed">
                      {isUrdu ? data.eid.noteUr : data.eid.noteEn}
                    </p>
                  )}
                </section>
              )}

              {/* Mosque Announcements & Notification Opt-in */}
              <section
                aria-label="Mosque announcements"
                className="rounded-2xl bg-white border border-[#0B3B2B]/10 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-[#0B3B2B]/10 flex items-center justify-between gap-3">
                  <h2
                    className={`text-base sm:text-lg font-semibold text-[#0B3B2B] ${
                      isUrdu ? 'font-arabic' : 'font-display text-xl'
                    }`}
                  >
                    {t.announcementsTitle}
                  </h2>
                </div>

                {data.announcements.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-[#15241E]/65">
                    {t.noAnnouncements}
                  </div>
                ) : (
                  <div className="divide-y divide-[#0B3B2B]/8">
                    {data.announcements.map((item) => (
                      <article key={item.id} className="px-5 py-4 space-y-1.5">
                        <div className="text-xs font-medium text-[#B68D40]">
                          {t.categories[item.category] || t.categories.general}
                          {item.start_date && (
                            <>
                              <span aria-hidden="true" className="mx-1.5">·</span>
                              <span className="tabular-nums text-[#15241E]/55">
                                {item.start_date}
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="text-sm sm:text-base font-semibold text-[#15241E]">
                          {isUrdu && item.title_ur ? item.title_ur : item.title_en}
                        </h3>
                        <p className="text-sm text-[#15241E]/75 leading-relaxed">
                          {isUrdu && item.body_ur ? item.body_ur : item.body_en}
                        </p>
                      </article>
                    ))}
                  </div>
                )}

                {/* Visitor Notification Subscription Control (opt-in only) */}
                <div className="px-5 py-4 bg-[#FAF8F4] border-t border-[#0B3B2B]/10 space-y-2.5">
                  <p className="text-xs text-[#15241E]/70 leading-relaxed">{t.alertsNote}</p>
                  <button
                    type="button"
                    onClick={handleToggleAlerts}
                    className={`w-full min-h-[44px] px-4 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      alertsSubscribed
                        ? 'bg-[#F3EFE6] border border-[#0B3B2B]/20 text-[#0B3B2B] hover:bg-[#EAE3D3]'
                        : 'bg-[#0B3B2B] text-[#FAF8F4] hover:bg-[#072A1E]'
                    }`}
                  >
                    {alertsSubscribed ? (
                      <>
                        <BellOff className="w-4 h-4" />
                        <span>{t.disableAlerts}</span>
                      </>
                    ) : (
                      <>
                        <Bell className="w-4 h-4" />
                        <span>{t.enableAlerts}</span>
                      </>
                    )}
                  </button>
                  {alertFeedback && (
                    <p className="text-xs text-[#B68D40] font-medium">{alertFeedback}</p>
                  )}
                </div>
              </section>
            </div>
          </motion.div>
        )}
      </main>

      {/* Annual PDF Schedule Modal */}
      <AnnualScheduleModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        language={language}
      />

      {/* iOS Safari Add-to-Home-Screen Guide */}
      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#FAF8F4] p-6 border border-[#0B3B2B]/15 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-bold text-[#0B3B2B]">
              Install Masjid-e-Bilal
            </h3>
            <p className="text-sm text-[#15241E]/80 leading-relaxed">
              1. Tap the <strong>Share</strong> icon in Safari.
              <br />
              2. Scroll down and select <strong>Add to Home Screen</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#0B3B2B] text-white text-sm font-medium cursor-pointer"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
