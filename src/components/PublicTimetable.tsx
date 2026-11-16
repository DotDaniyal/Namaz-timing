import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  Menu,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { Language, TimetablePayload } from '../types/timetable';
import { COPY, MONTH_NAMES_EN, MONTH_NAMES_UR } from '../utils/i18n';
import {
  computeNextPrayer,
  formatTime24ToUrduPhrase,
  getActivePrayerState,
  getKarachiNow,
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
  const [expandedActiveKey, setExpandedActiveKey] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleActivePrayerDetails = (key: string) => {
    setExpandedActiveKey((prev) => (prev === key ? null : key));
  };

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
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

  const qazaEnabled = Boolean(data?.qazaConfig?.enabledOnPublic);

  const activePrayerState = useMemo(() => {
    if (!data || !qazaEnabled) {
      return {
        activePrayer: null,
        endingStatus: { isInActiveWindow: false, isEndingSoon: false, remainingMinutes: 0 },
      };
    }
    return getActivePrayerState(
      data.prayers,
      clock,
      data.qazaConfig?.warningThresholdMinutes ?? 20,
      data.qazaConfig?.ishaEndRule,
    );
  }, [data, qazaEnabled, clock]);

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

  const activePrayer = qazaEnabled ? activePrayerState.activePrayer : null;
  const upcomingPrayer = countdown?.nextPrayer || null;
  const featuredMobilePrayer = activePrayer || upcomingPrayer || data?.prayers[0] || null;
  const remainingMobilePrayers = useMemo(() => {
    if (!data) return [];
    if (!featuredMobilePrayer) return data.prayers;
    return data.prayers.filter((p) => p.key !== featuredMobilePrayer.key);
  }, [data, featuredMobilePrayer]);

  const sunriseDisplay = data?.qazaConfig?.astronomicalSnapshot?.sunrise12 || '—';
  const jumuahNoteText = data ? (isUrdu ? data.jumuah.noteUr : data.jumuah.noteEn) : '';

  return (
    <div
      className={`min-h-dvh islamic-emerald-bg text-[#F7F5EE] flex flex-col ${
        reduceMotion ? 'reduce-motion' : ''
      }`}
      dir={isUrdu ? 'rtl' : 'ltr'}
    >
      {/* Centered-Brand 3-Column Header (Always keeps MASJID-E-BILAL horizontally centered) */}
      <header className="sticky top-0 z-30 bg-[#07271C]/95 backdrop-blur-md border-b border-[#C9A24D]/25">
        <div
          className="max-w-6xl mx-auto px-3 sm:px-6 h-[68px] sm:h-[76px] grid grid-cols-[1fr_auto_1fr] items-center gap-2"
          dir="ltr"
        >
          {/* LEFT: Mobile Menu Trigger + Desktop Left Navigation */}
          <div className="justify-self-start flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#C9A24D]/25 bg-[#0A3828] text-[#E2C16B] hover:border-[#D4AF56] transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <nav
              aria-label="Primary navigation left"
              className="hidden md:flex items-center gap-1"
            >
              <button
                type="button"
                onClick={() => scrollToSection('section-timings')}
                className={`min-h-[40px] px-2.5 rounded-lg text-xs lg:text-sm font-medium text-[#D7E6DF] hover:text-[#E2C16B] hover:bg-[#0A3828]/80 transition-colors cursor-pointer whitespace-nowrap ${
                  isUrdu ? 'font-urdu leading-none' : ''
                }`}
              >
                {t.navTimings}
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('section-jumuah')}
                className={`min-h-[40px] px-2.5 rounded-lg text-xs lg:text-sm font-medium text-[#D7E6DF] hover:text-[#E2C16B] hover:bg-[#0A3828]/80 transition-colors cursor-pointer whitespace-nowrap ${
                  isUrdu ? 'font-urdu leading-none' : ''
                }`}
              >
                {t.navJumuah}
              </button>
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className={`min-h-[40px] px-2.5 rounded-lg text-xs lg:text-sm font-medium text-[#D7E6DF] hover:text-[#E2C16B] hover:bg-[#0A3828]/80 transition-colors cursor-pointer whitespace-nowrap ${
                  isUrdu ? 'font-urdu leading-none' : ''
                }`}
              >
                {t.navSchedule}
              </button>
            </nav>
          </div>

          {/* CENTER: Pure Centered MASJID-E-BILAL & Calligraphy Emblem Stack */}
          <div className="justify-self-center text-center min-w-0 px-1">
            <h1 className="font-masjid text-[15px] min-[390px]:text-base sm:text-xl md:text-2xl font-bold tracking-[0.11em] sm:tracking-[0.14em] text-[#F7F5EE] whitespace-nowrap leading-none">
              MASJID-E-BILAL
            </h1>
            <div
              className="font-calligraphy text-sm sm:text-lg text-[#D4AF56] leading-tight mt-0.5 whitespace-nowrap"
              dir="rtl"
            >
              مسجدِ بلال
            </div>
          </div>

          {/* RIGHT: Desktop Right Nav + Language Switch + Admin & Utility Controls */}
          <div className="justify-self-end flex items-center gap-1 sm:gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => scrollToSection('section-notices')}
              className={`hidden md:inline-flex items-center min-h-[40px] px-2.5 rounded-lg text-xs lg:text-sm font-medium text-[#D7E6DF] hover:text-[#E2C16B] hover:bg-[#0A3828]/80 transition-colors cursor-pointer whitespace-nowrap ${
                isUrdu ? 'font-urdu leading-none' : ''
              }`}
            >
              {t.navNotices}
            </button>

            {/* Reduced motion toggle (Desktop large screens) */}
            <button
              type="button"
              onClick={onToggleReduceMotion}
              title={reduceMotion ? t.standardMotion : t.reduceMotion}
              aria-label={reduceMotion ? t.standardMotion : t.reduceMotion}
              className={`hidden lg:flex min-h-[40px] px-2.5 items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                reduceMotion
                  ? 'border-[#D4AF56] bg-[#0E4734] text-[#E2C16B]'
                  : 'border-[#C9A24D]/25 bg-[#0A3828] text-[#B7CFC5] hover:text-[#F7F5EE]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className={`whitespace-nowrap ${isUrdu ? 'font-urdu leading-none' : ''}`}>
                {reduceMotion ? t.reduceMotion : t.standardMotion}
              </span>
            </button>

            {/* Language Switch: English | اردو */}
            <div
              className="flex items-center p-0.5 sm:p-1 rounded-xl bg-[#0A3828] border border-[#C9A24D]/25"
              role="group"
              aria-label="Language switch"
            >
              <button
                type="button"
                onClick={() => onLanguageChange('en')}
                className={`min-h-[34px] px-2 sm:px-2.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  language === 'en'
                    ? 'bg-[#D4AF56] text-[#07271C]'
                    : 'text-[#B7CFC5] hover:text-[#F7F5EE]'
                }`}
              >
                <span className="sm:hidden">EN</span>
                <span className="hidden sm:inline">English</span>
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange('ur')}
                className={`min-h-[34px] px-2 sm:px-2.5 rounded-lg text-[11px] sm:text-xs font-arabic font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  language === 'ur'
                    ? 'bg-[#D4AF56] text-[#07271C]'
                    : 'text-[#B7CFC5] hover:text-[#F7F5EE]'
                }`}
              >
                اردو
              </button>
            </div>

            {/* PWA Install Button (Desktop/Tablet) */}
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                aria-label="Install Masjid-e-Bilal app"
                className="hidden sm:flex min-h-[40px] px-2.5 items-center gap-1.5 rounded-xl bg-[#D4AF56] text-[#07271C] text-xs font-semibold hover:bg-[#E2C16B] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Install</span>
              </button>
            )}
            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                aria-label="Install app on iOS"
                className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-[#C9A24D]/25 bg-[#0A3828] text-[#E2C16B] cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
            )}

            {/* Admin Panel Access Icon (Visible sm+; available inside Mobile Menu on <sm so header stays uncrowded) */}
            <button
              type="button"
              onClick={onOpenAdmin}
              aria-label={t.adminAccess}
              title={t.adminAccess}
              className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-[#C9A24D]/25 bg-[#0A3828] text-[#E2C16B]/85 hover:text-[#F7F5EE] hover:border-[#D4AF56]/60 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Responsive Navigation Drawer (keeps mosque branding centered on mobile) */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden border-t border-[#C9A24D]/20 bg-[#062218]/98 px-4 py-3 space-y-1.5 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => scrollToSection('section-timings')}
                className={`w-full min-h-[44px] px-3 rounded-xl flex items-center justify-between text-sm font-medium text-[#F7F5EE] hover:bg-[#0A3828] transition-colors cursor-pointer ${
                  isUrdu ? 'font-urdu' : ''
                }`}
              >
                <span>{t.navTimings}</span>
                <ChevronRight className={`w-4 h-4 text-[#D4AF56] ${isUrdu ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('section-jumuah')}
                className={`w-full min-h-[44px] px-3 rounded-xl flex items-center justify-between text-sm font-medium text-[#F7F5EE] hover:bg-[#0A3828] transition-colors cursor-pointer ${
                  isUrdu ? 'font-urdu' : ''
                }`}
              >
                <span>{t.navJumuah}</span>
                <ChevronRight className={`w-4 h-4 text-[#D4AF56] ${isUrdu ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowScheduleModal(true);
                }}
                className={`w-full min-h-[44px] px-3 rounded-xl flex items-center justify-between text-sm font-medium text-[#F7F5EE] hover:bg-[#0A3828] transition-colors cursor-pointer ${
                  isUrdu ? 'font-urdu' : ''
                }`}
              >
                <span>{t.navSchedule}</span>
                <CalendarDays className="w-4 h-4 text-[#D4AF56]" />
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('section-notices')}
                className={`w-full min-h-[44px] px-3 rounded-xl flex items-center justify-between text-sm font-medium text-[#F7F5EE] hover:bg-[#0A3828] transition-colors cursor-pointer ${
                  isUrdu ? 'font-urdu' : ''
                }`}
              >
                <span>{t.navNotices}</span>
                <ChevronRight className={`w-4 h-4 text-[#D4AF56] ${isUrdu ? 'rotate-180' : ''}`} />
              </button>

              <div className="pt-1.5 border-t border-white/10 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onToggleReduceMotion();
                    setMobileMenuOpen(false);
                  }}
                  className={`flex-1 min-h-[44px] px-3 rounded-xl border border-[#C9A24D]/25 bg-[#0A3828] inline-flex items-center justify-center gap-2 text-xs font-medium text-[#D7E6DF] cursor-pointer ${
                    isUrdu ? 'font-urdu' : ''
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF56]" />
                  <span>{reduceMotion ? t.reduceMotion : t.standardMotion}</span>
                </button>

                {!isInstalled && isInstallable && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      install();
                    }}
                    className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#D4AF56] text-[#07271C] inline-flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install</span>
                  </button>
                )}

                {!isInstalled && !isInstallable && isIOS && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowIOSGuide(true);
                    }}
                    className="flex-1 min-h-[44px] px-3 rounded-xl border border-[#C9A24D]/35 bg-[#0A3828] text-[#E2C16B] inline-flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAdmin();
                  }}
                  className={`flex-1 min-h-[44px] px-3 rounded-xl border border-[#C9A24D]/35 bg-[#0A3828] inline-flex items-center justify-center gap-2 text-xs font-semibold text-[#E2C16B] cursor-pointer ${
                    isUrdu ? 'font-urdu' : ''
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{t.adminAccess}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content Container */}
      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-5 sm:pt-7 pb-8 flex-1 space-y-6">
        {!isOnline && (
          <div
            className={`rounded-xl border border-[#D4AF56]/40 bg-[#0A3828] px-4 py-3 text-xs sm:text-sm text-[#F7F5EE] ${
              isUrdu ? 'font-urdu' : ''
            }`}
          >
            {isUrdu
              ? 'آف لائن موڈ — محفوظ شدہ اوقاتِ نماز دکھائے جا رہے ہیں۔'
              : 'Offline mode — showing last saved prayer timetable.'}
          </div>
        )}

        {loading && !data && (
          <div className="rounded-2xl bg-[#093224] border border-[#C9A24D]/20 p-10 text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full border-2 border-[#D4AF56]/25 border-t-[#D4AF56] animate-spin" />
            <p className={`text-sm text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}>
              {isUrdu ? 'اوقاتِ نماز لوڈ ہو رہے ہیں...' : 'Loading Masjid-e-Bilal timetable...'}
            </p>
          </div>
        )}

        {error && !data && (
          <div className="rounded-2xl bg-[#093224] border border-red-400/40 p-6 text-center space-y-3">
            <p className="text-sm text-red-200">{error}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-xl bg-[#D4AF56] text-[#07271C] text-sm font-semibold cursor-pointer"
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
            className="space-y-6"
          >
            {/* HERO DATE + LUMINOUS GOLD LIVE KARACHI CLOCK & NEXT PRAYER COUNTDOWN */}
            <section
              aria-label="Current dates, Karachi local time, and next prayer countdown"
              className="pb-4 border-b border-[#C9A24D]/20 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <MosqueEmblem className="hidden sm:block w-12 h-12 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm sm:text-base text-[#D7E6DF]">
                    {data.date.hijri.day > 0 && (
                      <>
                        <span className="font-display text-base sm:text-lg font-bold text-[#F7F5EE] tracking-wide">
                          {data.date.hijri.day} {data.date.hijri.monthEn} {data.date.hijri.year} AH
                        </span>
                        <span aria-hidden="true" className="text-[#D4AF56]">·</span>
                      </>
                    )}
                    <span className={isUrdu ? 'font-urdu text-sm sm:text-base' : ''}>
                      {weekdayText}،{' '}
                      {isUrdu ? data.date.formattedGregorianUr : data.date.formattedGregorianEn}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-[#B7CFC5]">
                    {data.date.hijri.monthAr && (
                      <span className="font-arabic text-base text-[#D4AF56]" dir="rtl">
                        {data.date.hijri.day} {data.date.hijri.monthAr} {data.date.hijri.year} هـ
                      </span>
                    )}
                    {(data.date.hijri.manualOverrideEnabled ||
                      data.date.hijri.adjustmentDays !== 0) && (
                      <span className={`text-[#D4AF56] ${isUrdu ? 'font-urdu' : ''}`}>
                        · {data.date.hijri.manualOverrideEnabled ? t.hijriManual : t.hijriAdjusted}
                      </span>
                    )}
                    {qazaEnabled && (
                      <span className={isUrdu ? 'font-urdu' : ''}>
                        ·{' '}
                        {activePrayer
                          ? `${t.activePeriodPrefix}: ${
                              isUrdu ? activePrayer.nameUr : activePrayer.nameEn
                            }`
                          : t.noActivePeriod}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`${isUrdu ? 'sm:text-left' : 'sm:text-right'} shrink-0 space-y-0.5`}
                dir="ltr"
              >
                <div className="font-mono-tabular text-3xl sm:text-4xl font-semibold tracking-wide text-[#E2C16B] leading-none">
                  {clock.formattedTime12}
                </div>
                {countdown?.nextPrayer && (
                  <div className="text-xs sm:text-sm text-[#D7E6DF] flex items-center sm:justify-end gap-1.5 flex-wrap">
                    <span className={isUrdu ? 'font-urdu' : ''}>
                      {countdown.isTomorrow ? t.tomorrowFajr : t.nextPrayer}:
                    </span>
                    <span
                      className={`font-semibold text-white ${
                        isUrdu ? 'font-urdu' : 'font-display text-base'
                      }`}
                    >
                      {isUrdu ? countdown.nextPrayer.nameUr : countdown.nextPrayer.nameEn}
                    </span>
                    <span className="font-mono-tabular text-[#E2C16B]">
                      · {String(countdown.hours).padStart(2, '0')}:
                      {String(countdown.minutes).padStart(2, '0')}:
                      {String(countdown.seconds).padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* TIMETABLE SECTION ANCHOR */}
            <div id="section-timings" className="scroll-mt-24 space-y-5">
              {/* MOBILE LAYOUT (< lg): Featured Full-Width Arch + 2x2 Symmetrical Arch Grid */}
              <section aria-label="Mobile prayer timetable" className="lg:hidden space-y-3.5">
                {featuredMobilePrayer &&
                  (() => {
                    const prayer = featuredMobilePrayer;
                    const isActive = qazaEnabled && activePrayer?.key === prayer.key;
                    const endingStatus = isActive
                      ? activePrayerState.endingStatus
                      : { isInActiveWindow: false, isEndingSoon: false, remainingMinutes: 0 };
                    const isExpanded = isActive && expandedActiveKey === prayer.key;
                    const endNote = isUrdu ? prayer.endNoteUr : prayer.endNoteEn;
                    const displayEnd12 =
                      isActive && endingStatus.effectiveEnd12
                        ? endingStatus.effectiveEnd12
                        : prayer.endTime12;

                    return (
                      <div
                        className={`rounded-t-[36px] rounded-b-2xl border px-5 pt-5 pb-5 transition-colors shadow-lg ${
                          isActive && endingStatus.isEndingSoon
                            ? 'bg-[#2C240E]/90 border-amber-400'
                            : isActive
                              ? 'bg-[#0E4734] border-[#D4AF56]'
                              : 'bg-[#0C3E2D] border-[#D4AF56]/80'
                        }`}
                      >
                        <div className="text-center space-y-1">
                          <div className="font-arabic text-2xl font-bold text-[#D4AF56]" dir="rtl">
                            {prayer.nameAr}
                          </div>
                          <h2
                            className={`text-[#F7F5EE] leading-tight ${
                              isUrdu
                                ? 'font-urdu text-2xl font-bold'
                                : 'font-display text-3xl font-bold tracking-wide'
                            }`}
                          >
                            {isUrdu ? prayer.nameUr : prayer.nameEn}
                          </h2>
                          <div
                            className={`flex items-center justify-center gap-2 flex-wrap font-semibold ${
                              isUrdu
                                ? 'font-urdu text-xs'
                                : 'text-[11px] tracking-[0.14em] uppercase'
                            }`}
                          >
                            <span className="text-[#D4AF56]">
                              {isActive ? t.currentPrayerCap : t.upcomingNextCap}
                            </span>
                            {isActive && endingStatus.isEndingSoon && (
                              <span className="text-amber-300">
                                · {t.endingSoon} {endingStatus.remainingMinutes}{' '}
                                {isUrdu ? 'منٹ' : 'min'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="my-4 border-t border-white/12" />

                        {/* Active Prayer Only: Show JAMAAT TIME | PRAYER ENDS | QAZA STARTS + Details */}
                        {isActive ? (
                          <div className="space-y-3.5">
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div>
                                <div
                                  className={`font-semibold text-[#B7CFC5] ${
                                    isUrdu
                                      ? 'font-urdu text-[11px]'
                                      : 'text-[10px] tracking-wider uppercase'
                                  }`}
                                >
                                  {t.jamaatTimeCap}
                                </div>
                                <div
                                  className="font-mono-tabular text-base sm:text-lg font-semibold text-white mt-1"
                                  dir="ltr"
                                >
                                  {prayer.time12}
                                </div>
                              </div>

                              <div>
                                <div
                                  className={`font-semibold text-[#B7CFC5] ${
                                    isUrdu
                                      ? 'font-urdu text-[11px]'
                                      : 'text-[10px] tracking-wider uppercase'
                                  }`}
                                >
                                  {t.prayerEndsCap}
                                </div>
                                <div
                                  className={`font-mono-tabular text-base sm:text-lg font-semibold mt-1 ${
                                    endingStatus.isEndingSoon ? 'text-amber-300' : 'text-[#E2C16B]'
                                  }`}
                                  dir="ltr"
                                >
                                  {displayEnd12 || '—'}
                                </div>
                              </div>

                              <div>
                                <div
                                  className={`font-semibold text-[#B7CFC5] ${
                                    isUrdu
                                      ? 'font-urdu text-[11px]'
                                      : 'text-[10px] tracking-wider uppercase'
                                  }`}
                                >
                                  {t.qazaStartsCap}
                                </div>
                                <div
                                  className={`font-mono-tabular text-base sm:text-lg font-semibold mt-1 ${
                                    endingStatus.isEndingSoon ? 'text-amber-300' : 'text-[#F7F5EE]'
                                  }`}
                                  dir="ltr"
                                >
                                  {displayEnd12 || '—'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className={`text-[11px] text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}>
                                {isUrdu ? prayer.sourceLabelUr : prayer.sourceLabelEn}
                                {prayer.isEndOverridden && (
                                  <span className="text-[#D4AF56]">
                                    {' '}
                                    · {isUrdu ? 'دستی ترمیم' : 'Manual End'}
                                  </span>
                                )}
                              </span>

                              <button
                                type="button"
                                onClick={() => toggleActivePrayerDetails(prayer.key)}
                                aria-expanded={isExpanded}
                                className={`min-h-[44px] px-3 inline-flex items-center gap-1.5 rounded-xl border border-[#C9A24D]/35 bg-[#07271C]/60 text-xs font-semibold text-[#E2C16B] hover:border-[#D4AF56] transition-colors cursor-pointer ${
                                  isUrdu ? 'font-urdu' : ''
                                }`}
                              >
                                <span>{isExpanded ? t.detailsHide : t.detailsShow}</span>
                                <ChevronDown
                                  className={`w-4 h-4 transition-transform ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            </div>

                            {isExpanded && (
                              <div
                                className={`rounded-xl bg-[#07271C]/75 border border-[#C9A24D]/25 px-3.5 py-3 text-xs space-y-1.5 text-[#D7E6DF] ${
                                  isUrdu ? 'font-urdu' : ''
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                                  <span>
                                    <strong className="text-[#E2C16B]">{t.startsAtLabel}:</strong>{' '}
                                    <span className="font-mono-tabular" dir="ltr">
                                      {prayer.astroStart12 || '—'}
                                    </span>
                                  </span>
                                  <span>
                                    <strong className="text-[#E2C16B]">{t.sourceLabel}:</strong>{' '}
                                    {isUrdu ? prayer.endSourceLabelUr : prayer.endSourceLabelEn}
                                  </span>
                                </div>
                                <div>
                                  <strong className="text-[#E2C16B]">{t.ruleLabel}:</strong>{' '}
                                  {isUrdu ? prayer.endRuleLabelUr : prayer.endRuleLabelEn}
                                </div>
                                {endNote && (
                                  <p className="text-[11px] text-[#B7CFC5] leading-relaxed pt-0.5">
                                    {endNote}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Non-active featured fallback: Jamaat time only, NO Qaza */
                          <div className="text-center space-y-1">
                            <div className={`text-xs text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}>
                              {t.jamaatTime}
                            </div>
                            <div
                              className="font-mono-tabular text-3xl font-semibold text-white"
                              dir="ltr"
                            >
                              {prayer.time12}
                            </div>
                            <div
                              className={`text-[11px] text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}
                            >
                              {isUrdu ? prayer.sourceLabelUr : prayer.sourceLabelEn}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* Symmetrical 2x2 Arch Grid for the 4 inactive prayers (Qaza completely hidden) */}
                <div className="grid grid-cols-2 gap-3">
                  {remainingMobilePrayers.map((prayer) => {
                    const isNext =
                      countdown?.nextPrayer?.key === prayer.key && !countdown.isTomorrow;

                    return (
                      <div
                        key={prayer.key}
                        className={`rounded-t-[30px] rounded-b-2xl border px-3.5 pt-4 pb-4 text-center flex flex-col justify-between transition-colors ${
                          isNext
                            ? 'bg-[#0C3E2D] border-[#D4AF56]'
                            : 'bg-[#093224]/95 border-[#C9A24D]/20'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-arabic text-lg font-bold text-[#D4AF56]" dir="rtl">
                            {prayer.nameAr}
                          </div>
                          <div
                            className={`text-[#F7F5EE] leading-tight ${
                              isUrdu
                                ? 'font-urdu text-xl font-bold'
                                : 'font-display text-2xl font-bold'
                            }`}
                          >
                            {isUrdu ? prayer.nameUr : prayer.nameEn}
                          </div>
                          <div
                            className={`min-h-[16px] font-semibold text-[#D4AF56] ${
                              isUrdu
                                ? 'font-urdu text-[11px]'
                                : 'text-[10px] tracking-wider uppercase'
                            }`}
                          >
                            {isNext ? t.upcomingNextCap : ''}
                          </div>
                        </div>

                        <div className="my-2.5 border-t border-white/10" />

                        <div className="space-y-0.5">
                          <div
                            className={`text-[11px] text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}
                          >
                            {t.jamaatTime}
                          </div>
                          <div
                            className="font-mono-tabular text-xl font-semibold text-white"
                            dir="ltr"
                          >
                            {prayer.time12}
                          </div>
                          {prayer.key === 'maghrib' &&
                          prayer.sunsetTime12 &&
                          prayer.status !== 'manual' ? (
                            <div
                              className={`text-[10px] text-[#B7CFC5]/85 tabular-nums ${
                                isUrdu ? 'font-urdu' : ''
                              }`}
                            >
                              {t.sunsetLabel}:{' '}
                              <span className="font-mono-tabular" dir="ltr">
                                {prayer.sunsetTime12}
                              </span>
                            </div>
                          ) : prayer.effectiveFrom && !prayer.isOverridden ? (
                            <div
                              className={`text-[10px] text-[#B7CFC5]/80 ${
                                isUrdu ? 'font-urdu' : ''
                              }`}
                            >
                              {isUrdu ? 'نافذ از' : 'From'}{' '}
                              {formatEffectiveMonthDay(
                                prayer.effectiveFrom.month,
                                prayer.effectiveFrom.day,
                              )}
                            </div>
                          ) : (
                            <div
                              className={`text-[10px] text-[#B7CFC5]/80 ${
                                isUrdu ? 'font-urdu' : ''
                              }`}
                            >
                              {isUrdu ? prayer.sourceLabelUr : prayer.sourceLabelEn}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* DESKTOP LAYOUT (>= lg): Exact 5-Arch Horizontal Row + Active Prayer Qaza Bar */}
              <section aria-label="Desktop prayer timetable" className="hidden lg:block space-y-4">
                <div className="grid grid-cols-5 gap-3.5">
                  {data.prayers.map((prayer) => {
                    const isActive = qazaEnabled && activePrayer?.key === prayer.key;
                    const isNext =
                      countdown?.nextPrayer?.key === prayer.key && !countdown.isTomorrow;
                    const isSoon = isActive && activePrayerState.endingStatus.isEndingSoon;

                    return (
                      <div
                        key={prayer.key}
                        className={`rounded-t-[44px] rounded-b-2xl border px-4 py-6 text-center flex flex-col justify-between transition-colors ${
                          isSoon
                            ? 'bg-[#2C240E]/90 border-amber-400 shadow-lg'
                            : isActive
                              ? 'bg-[#0E4734] border-[#D4AF56] shadow-lg'
                              : isNext
                                ? 'bg-[#0C3E2D] border-[#D4AF56]/80'
                                : 'bg-[#093224]/95 border-[#C9A24D]/22'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="font-arabic text-2xl font-bold text-[#D4AF56]" dir="rtl">
                            {prayer.nameAr}
                          </div>
                          <div
                            className={`text-[#F7F5EE] leading-tight ${
                              isUrdu
                                ? 'font-urdu text-2xl font-bold'
                                : 'font-display text-3xl font-bold tracking-wide'
                            }`}
                          >
                            {isUrdu ? prayer.nameUr : prayer.nameEn}
                          </div>
                          <div
                            className={`min-h-[18px] font-semibold ${
                              isUrdu
                                ? 'font-urdu text-xs'
                                : 'text-[11px] tracking-[0.12em] uppercase'
                            }`}
                          >
                            {isActive ? (
                              <span className={isSoon ? 'text-amber-300' : 'text-[#D4AF56]'}>
                                {t.currentPrayerCap}
                              </span>
                            ) : isNext ? (
                              <span className="text-[#D4AF56]">{t.upcomingNextCap}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="my-4 border-t border-white/12" />

                        <div className="space-y-1">
                          <div className={`text-xs text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}>
                            {t.jamaatTime}
                          </div>
                          <div
                            className="font-mono-tabular text-2xl font-semibold text-white"
                            dir="ltr"
                          >
                            {prayer.time12}
                          </div>
                          <div
                            className={`text-[11px] text-[#B7CFC5]/80 ${
                              isUrdu ? 'font-urdu' : ''
                            }`}
                          >
                            {prayer.key === 'maghrib' &&
                            prayer.sunsetTime12 &&
                            prayer.status !== 'manual' ? (
                              <>
                                {t.sunsetLabel}:{' '}
                                <span className="font-mono-tabular" dir="ltr">
                                  {prayer.sunsetTime12}
                                </span>
                              </>
                            ) : isUrdu ? (
                              prayer.sourceLabelUr
                            ) : (
                              prayer.sourceLabelEn
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Active Prayer Only Qaza & End-Time Bar */}
                {qazaEnabled &&
                  activePrayer &&
                  (() => {
                    const endingStatus = activePrayerState.endingStatus;
                    const isExpanded = expandedActiveKey === activePrayer.key;
                    const endNote = isUrdu ? activePrayer.endNoteUr : activePrayer.endNoteEn;
                    const displayEnd12 = endingStatus.effectiveEnd12 || activePrayer.endTime12;

                    return (
                      <div
                        className={`rounded-2xl border px-6 py-4 transition-colors ${
                          endingStatus.isEndingSoon
                            ? 'bg-[#2C240E]/90 border-amber-400'
                            : 'bg-[#0A3828] border-[#D4AF56]/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-6">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span
                                className={`font-bold text-white ${
                                  isUrdu ? 'font-urdu text-lg' : 'font-display text-2xl'
                                }`}
                              >
                                {isUrdu ? activePrayer.nameUr : activePrayer.nameEn}
                              </span>
                              <span className="font-arabic text-lg font-bold text-[#D4AF56]" dir="rtl">
                                {activePrayer.nameAr}
                              </span>
                              <span
                                className={`font-semibold text-[#D4AF56] ${
                                  isUrdu ? 'font-urdu text-xs' : 'text-xs tracking-wider uppercase'
                                }`}
                              >
                                · {t.activeNow}
                              </span>
                              {endingStatus.isEndingSoon && (
                                <span
                                  className={`text-xs font-semibold text-amber-300 ${
                                    isUrdu ? 'font-urdu' : ''
                                  }`}
                                >
                                  · {t.endingSoon} {endingStatus.remainingMinutes}{' '}
                                  {isUrdu ? 'منٹ' : 'min'}
                                </span>
                              )}
                            </div>
                            <div className={`text-xs text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}>
                              {isUrdu ? activePrayer.endRuleLabelUr : activePrayer.endRuleLabelEn}
                            </div>
                          </div>

                          <div className="flex items-center gap-8">
                            <div className="text-center">
                              <div
                                className={`font-semibold text-[#B7CFC5] ${
                                  isUrdu
                                    ? 'font-urdu text-[11px]'
                                    : 'text-[10px] tracking-wider uppercase'
                                }`}
                              >
                                {t.jamaatTimeCap}
                              </div>
                              <div
                                className="font-mono-tabular text-lg font-semibold text-white"
                                dir="ltr"
                              >
                                {activePrayer.time12}
                              </div>
                            </div>
                            <div className="text-center">
                              <div
                                className={`font-semibold text-[#B7CFC5] ${
                                  isUrdu
                                    ? 'font-urdu text-[11px]'
                                    : 'text-[10px] tracking-wider uppercase'
                                }`}
                              >
                                {t.prayerEndsCap}
                              </div>
                              <div
                                className={`font-mono-tabular text-lg font-semibold ${
                                  endingStatus.isEndingSoon ? 'text-amber-300' : 'text-[#E2C16B]'
                                }`}
                                dir="ltr"
                              >
                                {displayEnd12 || '—'}
                              </div>
                            </div>
                            <div className="text-center">
                              <div
                                className={`font-semibold text-[#B7CFC5] ${
                                  isUrdu
                                    ? 'font-urdu text-[11px]'
                                    : 'text-[10px] tracking-wider uppercase'
                                }`}
                              >
                                {t.qazaStartsCap}
                              </div>
                              <div
                                className={`font-mono-tabular text-lg font-semibold ${
                                  endingStatus.isEndingSoon ? 'text-amber-300' : 'text-[#F7F5EE]'
                                }`}
                                dir="ltr"
                              >
                                {displayEnd12 || '—'}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleActivePrayerDetails(activePrayer.key)}
                              aria-expanded={isExpanded}
                              className={`min-h-[44px] px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-[#C9A24D]/35 bg-[#07271C]/60 text-xs font-semibold text-[#E2C16B] hover:border-[#D4AF56] transition-colors cursor-pointer ${
                                isUrdu ? 'font-urdu' : ''
                              }`}
                            >
                              <span>{isExpanded ? t.detailsHide : t.detailsShow}</span>
                              <ChevronDown
                                className={`w-4 h-4 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div
                            className={`mt-3 pt-3 border-t border-white/10 text-xs text-[#D7E6DF] flex flex-wrap items-center justify-between gap-3 ${
                              isUrdu ? 'font-urdu' : ''
                            }`}
                          >
                            <span>
                              <strong className="text-[#E2C16B]">{t.startsAtLabel}:</strong>{' '}
                              <span className="font-mono-tabular" dir="ltr">
                                {activePrayer.astroStart12 || '—'}
                              </span>
                            </span>
                            <span>
                              <strong className="text-[#E2C16B]">{t.sourceLabel}:</strong>{' '}
                              {isUrdu
                                ? activePrayer.endSourceLabelUr
                                : activePrayer.endSourceLabelEn}
                            </span>
                            {endNote && (
                              <p className="w-full text-[11px] text-[#B7CFC5]">{endNote}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
              </section>
            </div>

            {/* SUNRISE (TULU), ANNUAL SCHEDULE & STRUCTURED FRIDAY PRAYER SECTION */}
            <section
              id="section-jumuah"
              aria-label="Sunrise, Annual Schedule, and Jumu'ah Friday Prayer"
              className="scroll-mt-24 space-y-4"
            >
              {/* Compact Sunrise & Annual Schedule Utility Strip */}
              <div className="rounded-2xl bg-[#093224] border border-[#C9A24D]/25 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-start">
                <div className="space-y-0.5">
                  <div className={`text-xs text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}>
                    {t.sunriseTulu}
                  </div>
                  <div className="font-mono-tabular text-xl font-semibold text-white" dir="ltr">
                    {sunriseDisplay}
                  </div>
                </div>

                <div className={`text-xs text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}>
                  {t.zuhrNotice}
                </div>

                <button
                  type="button"
                  onClick={() => setShowScheduleModal(true)}
                  className={`min-h-[44px] px-4 inline-flex items-center gap-2 rounded-xl border border-[#C9A24D]/35 bg-[#0A3828] text-xs font-semibold text-[#E2C16B] hover:border-[#D4AF56] transition-colors cursor-pointer shrink-0 ${
                    isUrdu ? 'font-urdu' : ''
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>{t.annualScheduleBtn}</span>
                  <ChevronRight className={`w-4 h-4 ${isUrdu ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Dedicated Structured Friday / Jumu'ah Prayer Panel */}
              <div className="rounded-2xl bg-[#093224]/95 border border-[#D4AF56]/40 p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 pb-3 border-b border-[#C9A24D]/20">
                  <div>
                    <div className="font-calligraphy text-lg sm:text-xl text-[#D4AF56]" dir="rtl">
                      صلاة الجمعة المباركة
                    </div>
                    <h2
                      className={`text-[#F7F5EE] font-bold ${
                        isUrdu
                          ? 'font-urdu text-xl sm:text-2xl'
                          : 'font-display text-2xl sm:text-3xl tracking-wide'
                      }`}
                    >
                      {t.jumuahTitle}
                    </h2>
                  </div>
                  {jumuahNoteText && (
                    <p
                      className={`text-xs sm:text-sm text-[#B7CFC5] ${
                        isUrdu ? 'font-urdu' : ''
                      }`}
                    >
                      {jumuahNoteText}
                    </p>
                  )}
                </div>

                {data.jumuah.configured ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* Bayan Starts */}
                    <div className="rounded-xl bg-[#07271C]/75 border border-[#C9A24D]/25 px-4 py-3.5 text-center space-y-1">
                      <div
                        className={`text-xs text-[#B7CFC5] ${
                          isUrdu ? 'font-urdu text-sm' : 'font-medium uppercase tracking-wider'
                        }`}
                      >
                        {t.bayanStartsLabel}
                      </div>
                      {isUrdu ? (
                        <div className="font-urdu text-lg sm:text-xl font-bold text-[#F7F5EE]">
                          {formatTime24ToUrduPhrase(data.jumuah.bayanTime24)}
                        </div>
                      ) : (
                        <div
                          className="font-mono-tabular text-xl sm:text-2xl font-semibold text-[#F7F5EE]"
                          dir="ltr"
                        >
                          {data.jumuah.bayanTime12}
                        </div>
                      )}
                    </div>

                    {/* Khutbah Starts */}
                    <div className="rounded-xl bg-[#07271C]/75 border border-[#C9A24D]/25 px-4 py-3.5 text-center space-y-1">
                      <div
                        className={`text-xs text-[#B7CFC5] ${
                          isUrdu ? 'font-urdu text-sm' : 'font-medium uppercase tracking-wider'
                        }`}
                      >
                        {t.khutbahStartsLabel}
                      </div>
                      {isUrdu ? (
                        <div className="font-urdu text-lg sm:text-xl font-bold text-[#F7F5EE]">
                          {formatTime24ToUrduPhrase(data.jumuah.khutbahTime24)}
                        </div>
                      ) : (
                        <div
                          className="font-mono-tabular text-xl sm:text-2xl font-semibold text-[#F7F5EE]"
                          dir="ltr"
                        >
                          {data.jumuah.khutbahTime12}
                        </div>
                      )}
                    </div>

                    {/* Jumu'ah Prayer Jamaat */}
                    <div className="rounded-xl bg-[#0E4734]/90 border border-[#D4AF56]/60 px-4 py-3.5 text-center space-y-1">
                      <div
                        className={`text-xs text-[#E2C16B] ${
                          isUrdu ? 'font-urdu text-sm' : 'font-semibold uppercase tracking-wider'
                        }`}
                      >
                        {t.jumuahPrayerLabel}
                      </div>
                      {isUrdu ? (
                        <div className="font-urdu text-lg sm:text-xl font-bold text-[#E2C16B]">
                          {formatTime24ToUrduPhrase(data.jumuah.time24)}
                        </div>
                      ) : (
                        <div
                          className="font-mono-tabular text-xl sm:text-2xl font-semibold text-[#E2C16B]"
                          dir="ltr"
                        >
                          {data.jumuah.time12}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className={`text-sm text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}>
                    {t.jumuahNotSet}
                  </p>
                )}
              </div>
            </section>

            {(data.maghribMeta.status === 'cached' ||
              (qazaEnabled && data.qazaConfig.authorityVerifiedNote)) && (
              <div
                className={`rounded-xl bg-[#093224]/90 border border-[#C9A24D]/20 px-4 py-2.5 text-xs text-[#B7CFC5] text-center space-y-1 ${
                  isUrdu ? 'font-urdu' : ''
                }`}
              >
                {data.maghribMeta.status === 'cached' && <div>{t.cachedNotice}</div>}
                {qazaEnabled && data.qazaConfig.authorityVerifiedNote && (
                  <div>{data.qazaConfig.authorityVerifiedNote}</div>
                )}
              </div>
            )}

            {/* EID PRAYER (when active) & MOSQUE ANNOUNCEMENTS + OPT-IN ALERTS */}
            <div
              id="section-notices"
              className="scroll-mt-24 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
            >
              {data.eid.isActive && (
                <section
                  aria-label="Eid prayer announcement"
                  className="lg:col-span-5 rounded-2xl bg-[#0E4734] border border-[#D4AF56]/60 p-5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2
                        className={`font-bold text-white ${
                          isUrdu ? 'font-urdu text-lg' : 'font-display text-2xl'
                        }`}
                      >
                        {data.eid.eidType === 'fitr' ? t.eidFitrTitle : t.eidAdhaTitle}
                      </h2>
                      <p className="font-arabic text-base text-[#D4AF56]" dir="rtl">
                        {data.eid.eidType === 'fitr' ? 'صلاة عيد الفطر' : 'صلاة عيد الأضحى'}
                      </p>
                    </div>
                    {data.eid.prayerTime12 && (
                      <div className="font-mono-tabular text-2xl font-bold text-[#E2C16B]" dir="ltr">
                        {data.eid.prayerTime12}
                      </div>
                    )}
                  </div>
                  {data.eid.prayerDate && (
                    <p className={`text-sm text-[#D7E6DF] ${isUrdu ? 'font-urdu' : ''}`}>
                      {data.eid.prayerDate}
                    </p>
                  )}
                  {(isUrdu ? data.eid.noteUr : data.eid.noteEn) && (
                    <p
                      className={`text-sm text-[#F7F5EE]/90 leading-relaxed ${
                        isUrdu ? 'font-urdu' : ''
                      }`}
                    >
                      {isUrdu ? data.eid.noteUr : data.eid.noteEn}
                    </p>
                  )}
                </section>
              )}

              <section
                aria-label="Mosque announcements"
                className={`${
                  data.eid.isActive ? 'lg:col-span-7' : 'lg:col-span-12'
                } rounded-2xl bg-[#093224] border border-[#C9A24D]/25 overflow-hidden`}
              >
                <div className="px-5 py-4 border-b border-[#C9A24D]/20 flex items-center justify-between gap-3">
                  <h2
                    className={`font-bold text-[#F7F5EE] ${
                      isUrdu ? 'font-urdu text-lg sm:text-xl' : 'font-display text-2xl'
                    }`}
                  >
                    {t.announcementsTitle}
                  </h2>
                  <span className="font-arabic text-base text-[#D4AF56]" dir="rtl">
                    إعلانات المسجد
                  </span>
                </div>

                {data.announcements.length === 0 ? (
                  <div className={`px-5 py-5 text-sm text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}>
                    {t.noAnnouncements}
                  </div>
                ) : (
                  <div className="divide-y divide-white/10">
                    {data.announcements.map((item) => (
                      <article key={item.id} className="px-5 py-4 space-y-1.5">
                        <div
                          className={`text-xs font-medium text-[#D4AF56] ${
                            isUrdu ? 'font-urdu' : ''
                          }`}
                        >
                          {t.categories[item.category] || t.categories.general}
                          {item.start_date && (
                            <>
                              <span aria-hidden="true" className="mx-1.5">
                                ·
                              </span>
                              <span className="font-mono-tabular text-[#B7CFC5]" dir="ltr">
                                {item.start_date}
                              </span>
                            </>
                          )}
                        </div>
                        <h3
                          className={`font-semibold text-[#F7F5EE] ${
                            isUrdu ? 'font-urdu text-base sm:text-lg' : 'font-display text-xl'
                          }`}
                        >
                          {isUrdu && item.title_ur ? item.title_ur : item.title_en}
                        </h3>
                        <p
                          className={`text-sm text-[#D7E6DF] leading-relaxed ${
                            isUrdu ? 'font-urdu' : ''
                          }`}
                        >
                          {isUrdu && item.body_ur ? item.body_ur : item.body_en}
                        </p>
                      </article>
                    ))}
                  </div>
                )}

                {/* Visitor Notification Subscription Control (opt-in only) */}
                <div className="px-5 py-4 bg-[#07271C]/70 border-t border-[#C9A24D]/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p
                    className={`text-xs text-[#B7CFC5] leading-relaxed ${
                      isUrdu ? 'font-urdu' : ''
                    }`}
                  >
                    {t.alertsNote}
                  </p>
                  <button
                    type="button"
                    onClick={handleToggleAlerts}
                    className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 ${
                      isUrdu ? 'font-urdu' : ''
                    } ${
                      alertsSubscribed
                        ? 'bg-[#0A3828] border border-[#D4AF56]/40 text-[#E2C16B] hover:bg-[#0E4734]'
                        : 'bg-[#D4AF56] text-[#07271C] hover:bg-[#E2C16B]'
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
                </div>
                {alertFeedback && (
                  <p
                    className={`px-5 pb-3 text-xs text-[#E2C16B] font-medium ${
                      isUrdu ? 'font-urdu' : ''
                    }`}
                  >
                    {alertFeedback}
                  </p>
                )}
              </section>
            </div>

            {/* DIGNIFIED QURANIC QUOTATION ON TIMELY SALAH */}
            <section
              aria-label="Quranic reminder on appointed times of prayer"
              className="rounded-2xl bg-[#093224]/90 border border-[#C9A24D]/25 px-5 sm:px-8 py-6 text-center space-y-3"
            >
              <p
                className="font-calligraphy text-2xl sm:text-3xl text-[#E2C16B] leading-relaxed"
                dir="rtl"
              >
                {t.quranQuoteAr}
              </p>
              <p
                className={`max-w-2xl mx-auto text-[#F7F5EE]/90 ${
                  isUrdu
                    ? 'font-urdu text-sm sm:text-base'
                    : 'font-display italic text-lg sm:text-xl'
                }`}
              >
                “{t.quranQuoteTrans}”
              </p>
              <div
                className={`text-xs text-[#B7CFC5] tracking-wider ${
                  isUrdu ? 'font-urdu' : 'uppercase'
                }`}
              >
                {t.quranQuoteRef}
              </div>
            </section>
          </motion.div>
        )}
      </main>

      {/* CLEAN MOSQUE FOOTER */}
      <footer className="border-t border-[#C9A24D]/20 bg-[#062218]/90">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-start">
          <div className="flex items-center gap-3">
            <MosqueEmblem className="w-8 h-8 shrink-0" />
            <div>
              <div className="flex items-baseline gap-2 flex-wrap justify-center sm:justify-start">
                <span className="font-masjid text-sm font-bold tracking-[0.12em] text-[#F7F5EE]">
                  MASJID-E-BILAL
                </span>
                <span className="font-calligraphy text-base text-[#D4AF56]" dir="rtl">
                  مسجدِ بلال
                </span>
              </div>
              <p className={`text-xs text-[#B7CFC5] ${isUrdu ? 'font-urdu' : ''}`}>
                {isUrdu
                  ? `${t.karachiLabel} · ${t.qazaPolicyCaption}`
                  : `${t.karachiLabel} · ${t.qazaPolicyCaption}`}
              </p>
            </div>
          </div>

          <div
            className={`flex flex-wrap items-center justify-center gap-4 text-xs text-[#D7E6DF] ${
              isUrdu ? 'font-urdu' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => scrollToSection('section-timings')}
              className="hover:text-[#E2C16B] transition-colors cursor-pointer"
            >
              {t.navTimings}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('section-jumuah')}
              className="hover:text-[#E2C16B] transition-colors cursor-pointer"
            >
              {t.navJumuah}
            </button>
            <button
              type="button"
              onClick={() => setShowScheduleModal(true)}
              className="hover:text-[#E2C16B] transition-colors cursor-pointer"
            >
              {t.navSchedule}
            </button>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="text-[#E2C16B] hover:underline transition-colors cursor-pointer"
            >
              {t.adminAccess}
            </button>
          </div>
        </div>
      </footer>

      {/* Annual PDF Schedule Modal */}
      <AnnualScheduleModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        language={language}
      />

      {/* iOS Safari Add-to-Home-Screen Guide */}
      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#093224] text-[#F7F5EE] p-6 border border-[#D4AF56]/40 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-bold text-[#E2C16B]">
              Install Masjid-e-Bilal
            </h3>
            <p className="text-sm text-[#D7E6DF] leading-relaxed">
              1. Tap the <strong>Share</strong> icon in Safari.
              <br />
              2. Scroll down and select <strong>Add to Home Screen</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#D4AF56] text-[#07271C] text-sm font-semibold cursor-pointer"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
