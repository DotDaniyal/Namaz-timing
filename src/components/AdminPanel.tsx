import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Compass,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Megaphone,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Sun,
  Trash2,
} from 'lucide-react';
import type { AnnouncementItem, AnnualScheduleRow, TimetablePayload } from '../types/timetable';
import { MONTH_NAMES_EN } from '../utils/i18n';
import { formatTime24To12Client } from '../utils/karachiClock';
import { MosqueEmblem } from './MosqueEmblem';

const ADMIN_TOKEN_KEY = 'masjid_admin_token';

function getStoredAdminToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredAdminToken(token: string) {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredAdminToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers, credentials: 'include' });
}

interface AdminPanelProps {
  onBackToSite: () => void;
  onDataUpdated: () => void;
}

type AdminTab =
  | 'overview'
  | 'schedule'
  | 'maghrib'
  | 'qaza'
  | 'jumuah_eid'
  | 'hijri'
  | 'announcements'
  | 'security';

interface AdminOverview {
  timetable: TimetablePayload;
  settings: {
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
  };
  overrides: Array<{ prayer_name: string; override_time: string | null; is_active: number }>;
  schedule: AnnualScheduleRow[];
  hijriSettings: {
    adjustment_days: number;
    manual_override_enabled: number;
    manual_hijri_day: number | null;
    manual_hijri_month_en: string | null;
    manual_hijri_month_ar: string | null;
    manual_hijri_year: number | null;
    cached_hijri_day: number | null;
    cached_hijri_month_en: string | null;
    cached_hijri_month_ar: string | null;
    cached_hijri_year: number | null;
  };
  qazaSettings: {
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
  };
  announcements: AnnouncementItem[];
  eid: {
    is_active: number;
    eid_type: 'fitr' | 'adha';
    prayer_date: string;
    prayer_time: string;
    note_en: string;
    note_ur: string;
  };
  activeSubscribers: number;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToSite, onDataUpdated }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Override edit states
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({});

  // Schedule add/edit state
  const [newMonth, setNewMonth] = useState(1);
  const [newDay, setNewDay] = useState(1);
  const [newFajr, setNewFajr] = useState('');
  const [newAsr, setNewAsr] = useState('');
  const [newIsha, setNewIsha] = useState('');
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editRowData, setEditRowData] = useState<{
    month: number;
    day: number;
    fajr: string;
    asr: string;
    isha: string;
  }>({ month: 1, day: 1, fajr: '', asr: '', isha: '' });

  // Maghrib state
  const [maghribAuto, setMaghribAuto] = useState(true);
  const [maghribOffset, setMaghribOffset] = useState(0);
  const [maghribManual, setMaghribManual] = useState('');
  const [karachiCity, setKarachiCity] = useState('Karachi');
  const [karachiCountry, setKarachiCountry] = useState('Pakistan');

  // Jumu'ah & Eid state
  const [jumuahTime, setJumuahTime] = useState('');
  const [jumuahAllWeek, setJumuahAllWeek] = useState(false);
  const [jumuahNoteEn, setJumuahNoteEn] = useState('');
  const [jumuahNoteUr, setJumuahNoteUr] = useState('');

  const [eidActive, setEidActive] = useState(false);
  const [eidType, setEidType] = useState<'fitr' | 'adha'>('fitr');
  const [eidDate, setEidDate] = useState('');
  const [eidTime, setEidTime] = useState('');
  const [eidNoteEn, setEidNoteEn] = useState('');
  const [eidNoteUr, setEidNoteUr] = useState('');

  // Hijri state
  const [hijriAdj, setHijriAdj] = useState(0);
  const [hijriManualEnabled, setHijriManualEnabled] = useState(false);
  const [hijriManualDay, setHijriManualDay] = useState('');
  const [hijriManualMonthEn, setHijriManualMonthEn] = useState('');
  const [hijriManualMonthAr, setHijriManualMonthAr] = useState('');
  const [hijriManualYear, setHijriManualYear] = useState('');

  // Prayer Ending & Qaza state
  const [qazaEnabled, setQazaEnabled] = useState(true);
  const [qazaPolicy, setQazaPolicy] = useState<'hanafi' | 'standard'>('hanafi');
  const [zuhrEndRule, setZuhrEndRule] = useState<'asr_hanafi' | 'asr_standard'>('asr_hanafi');
  const [ishaEndRule, setIshaEndRule] = useState<'subh_sadiq' | 'islamic_midnight' | 'first_third'>(
    'subh_sadiq',
  );
  const [qazaWarnMin, setQazaWarnMin] = useState(20);
  const [manualEndInputs, setManualEndInputs] = useState<Record<string, string>>({
    fajr: '',
    zuhr: '',
    asr: '',
    maghrib: '',
    isha: '',
  });
  const [authorityNote, setAuthorityNote] = useState('');

  // Announcements state
  const [editingAnnId, setEditingAnnId] = useState<number | null>(null);
  const [annTitleEn, setAnnTitleEn] = useState('');
  const [annTitleUr, setAnnTitleUr] = useState('');
  const [annBodyEn, setAnnBodyEn] = useState('');
  const [annBodyUr, setAnnBodyUr] = useState('');
  const [annCategory, setAnnCategory] = useState<'important' | 'timing' | 'jumuah' | 'eid' | 'general'>('general');
  const [annPublished, setAnnPublished] = useState(true);
  const [annStartDate, setAnnStartDate] = useState('');
  const [annExpiryDate, setAnnExpiryDate] = useState('');
  const [annSendPush, setAnnSendPush] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const notify = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 4000);
  };

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await adminFetch('/api/admin/overview');
      if (res.status === 401) {
        setStoredAdminToken('');
        setAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error('Failed to load admin overview');
      const data = (await res.json()) as AdminOverview;
      setOverview(data);

      // Populate form controls
      const ovMap: Record<string, string> = {};
      for (const p of data.timetable.prayers) {
        ovMap[p.key] = p.time24 || '';
      }
      setOverrideInputs(ovMap);

      setMaghribAuto(data.settings.maghrib_auto_enabled === 1);
      setMaghribOffset(data.settings.maghrib_offset_minutes || 0);
      setMaghribManual(data.settings.maghrib_manual_override || '');
      setKarachiCity(data.settings.karachi_city || 'Karachi');
      setKarachiCountry(data.settings.karachi_country || 'Pakistan');

      setJumuahTime(data.settings.jumuah_time || '');
      setJumuahAllWeek(data.settings.jumuah_show_all_week === 1);
      setJumuahNoteEn(data.settings.jumuah_note_en || '');
      setJumuahNoteUr(data.settings.jumuah_note_ur || '');

      setEidActive(data.eid.is_active === 1);
      setEidType(data.eid.eid_type || 'fitr');
      setEidDate(data.eid.prayer_date || '');
      setEidTime(data.eid.prayer_time || '');
      setEidNoteEn(data.eid.note_en || '');
      setEidNoteUr(data.eid.note_ur || '');

      setHijriAdj(data.hijriSettings.adjustment_days || 0);
      setHijriManualEnabled(data.hijriSettings.manual_override_enabled === 1);
      setHijriManualDay(
        data.hijriSettings.manual_hijri_day ? String(data.hijriSettings.manual_hijri_day) : '',
      );
      setHijriManualMonthEn(data.hijriSettings.manual_hijri_month_en || '');
      setHijriManualMonthAr(data.hijriSettings.manual_hijri_month_ar || '');
      setHijriManualYear(
        data.hijriSettings.manual_hijri_year ? String(data.hijriSettings.manual_hijri_year) : '',
      );

      if (data.qazaSettings) {
        setQazaEnabled(data.qazaSettings.enabled_on_public === 1);
        setQazaPolicy(data.qazaSettings.jurisprudence_policy || 'hanafi');
        setZuhrEndRule(data.qazaSettings.zuhr_end_rule || 'asr_hanafi');
        setIshaEndRule(data.qazaSettings.isha_end_rule || 'subh_sadiq');
        setQazaWarnMin(data.qazaSettings.warning_threshold_minutes ?? 20);
        setManualEndInputs({
          fajr: data.qazaSettings.manual_override_fajr_end || '',
          zuhr: data.qazaSettings.manual_override_zuhr_end || '',
          asr: data.qazaSettings.manual_override_asr_end || '',
          maghrib: data.qazaSettings.manual_override_maghrib_end || '',
          isha: data.qazaSettings.manual_override_isha_end || '',
        });
        setAuthorityNote(data.qazaSettings.authority_verified_note || '');
      }
    } catch (err) {
      notify('err', (err as Error).message);
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    adminFetch('/api/admin/session')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setAuthenticated(true);
          setAdminUsername(data.username || 'admin');
          loadOverview();
        } else {
          setStoredAdminToken('');
        }
      })
      .finally(() => setAuthChecked(true));
  }, [loadOverview]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLoginError(json.error || 'Authentication failed');
        return;
      }
      if (json.token) {
        setStoredAdminToken(json.token);
      }
      setAuthenticated(true);
      setAdminUsername(json.username);
      setLoginPassword('');
      await loadOverview();
    } catch {
      setLoginError('Network error while signing in');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await adminFetch('/api/admin/logout', { method: 'POST' });
    setStoredAdminToken('');
    setAuthenticated(false);
    setOverview(null);
  };

  const refreshAfterMutation = async (msg: string) => {
    notify('ok', msg);
    await loadOverview();
    onDataUpdated();
  };

  const handleSaveOverride = async (prayerName: string, isActive: boolean) => {
    const res = await adminFetch('/api/admin/overrides', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prayerName,
        overrideTime: overrideInputs[prayerName],
        isActive,
      }),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to update override');
    await refreshAfterMutation(
      isActive ? `Updated ${prayerName} override` : `Reset ${prayerName} to default rule`,
    );
  };

  const handleResetAllOverrides = async () => {
    const res = await adminFetch('/api/admin/overrides/reset-all', { method: 'POST' });
    if (!res.ok) return notify('err', 'Failed to reset overrides');
    await refreshAfterMutation('All prayer overrides reset to default schedule');
  };

  const handleAddScheduleRow = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminFetch('/api/admin/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: newMonth,
        day: newDay,
        fajr: newFajr || null,
        asr: newAsr || null,
        isha: newIsha || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to add schedule entry');
    setNewFajr('');
    setNewAsr('');
    setNewIsha('');
    await refreshAfterMutation('Annual schedule date saved');
  };

  const handleUpdateScheduleRow = async (id: number) => {
    const res = await adminFetch(`/api/admin/schedule/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: editRowData.month,
        day: editRowData.day,
        fajr: editRowData.fajr || null,
        asr: editRowData.asr || null,
        isha: editRowData.isha || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to update entry');
    setEditingRowId(null);
    await refreshAfterMutation('Schedule entry updated');
  };

  const handleDeleteScheduleRow = async (id: number) => {
    const res = await adminFetch(`/api/admin/schedule/${id}`, { method: 'DELETE' });
    if (!res.ok) return notify('err', 'Failed to delete schedule entry');
    await refreshAfterMutation('Schedule entry deleted');
  };

  const handleRestorePdf = async () => {
    const res = await adminFetch('/api/admin/schedule/restore-pdf', { method: 'POST' });
    if (!res.ok) return notify('err', 'Failed to restore PDF schedule');
    await refreshAfterMutation('Original Namaz Timings.pdf schedule restored');
  };

  const handleSaveMaghrib = async (resetToAuto = false) => {
    const res = await adminFetch('/api/admin/maghrib', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        autoEnabled: maghribAuto,
        offsetMinutes: maghribOffset,
        manualOverride: maghribManual || null,
        karachiCity,
        karachiCountry,
        resetToAuto,
      }),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to update Maghrib settings');
    await refreshAfterMutation(
      resetToAuto ? 'Maghrib reset to automatic Karachi sunset' : 'Maghrib settings saved',
    );
  };

  const handleRefreshMaghribApi = async () => {
    const res = await adminFetch('/api/admin/maghrib/refresh', { method: 'POST' });
    if (!res.ok) return notify('err', 'Failed to refresh AlAdhan API');
    await refreshAfterMutation('Karachi AlAdhan sunset & Hijri data refreshed');
  };

  const handleSaveJumuah = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminFetch('/api/admin/jumuah', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jumuahTime,
        showAllWeek: jumuahAllWeek,
        noteEn: jumuahNoteEn,
        noteUr: jumuahNoteUr,
      }),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to save Jumuah settings');
    await refreshAfterMutation("Jumu'ah prayer settings saved");
  };

  const handleSaveEid = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminFetch('/api/admin/eid', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isActive: eidActive,
        eidType,
        prayerDate: eidDate,
        prayerTime: eidTime,
        noteEn: eidNoteEn,
        noteUr: eidNoteUr,
      }),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to save Eid announcement');
    await refreshAfterMutation('Eid prayer settings saved');
  };

  const handleSaveHijri = async (resetToApi = false) => {
    const res = await adminFetch('/api/admin/hijri', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adjustmentDays: hijriAdj,
        manualOverrideEnabled: hijriManualEnabled,
        manualHijriDay: hijriManualDay ? Number(hijriManualDay) : null,
        manualHijriMonthEn: hijriManualMonthEn || null,
        manualHijriMonthAr: hijriManualMonthAr || null,
        manualHijriYear: hijriManualYear ? Number(hijriManualYear) : null,
        resetToApi,
      }),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to save Hijri settings');
    await refreshAfterMutation(
      resetToApi ? 'Hijri date reset to AlAdhan API' : 'Hijri date settings updated',
    );
  };

  const handleSaveQaza = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminFetch('/api/admin/qaza', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabledOnPublic: qazaEnabled,
        jurisprudencePolicy: qazaPolicy,
        zuhrEndRule,
        ishaEndRule,
        warningThresholdMinutes: qazaWarnMin,
        manualFajrEnd: manualEndInputs.fajr || null,
        manualZuhrEnd: manualEndInputs.zuhr || null,
        manualAsrEnd: manualEndInputs.asr || null,
        manualMaghribEnd: manualEndInputs.maghrib || null,
        manualIshaEnd: manualEndInputs.isha || null,
        authorityVerifiedNote: authorityNote,
      }),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to save Prayer Ending & Qaza settings');
    await refreshAfterMutation('Prayer Ending & Qaza settings saved');
  };

  const handleResetQazaOverride = async (prayerName?: string) => {
    const res = await adminFetch('/api/admin/qaza/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prayerName ? { prayerName } : {}),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to restore automatic calculation');
    await refreshAfterMutation(
      prayerName
        ? `Restored automatic ending time for ${prayerName}`
        : 'All prayer ending times restored to automatic calculation',
    );
  };

  const resetAnnouncementForm = () => {
    setEditingAnnId(null);
    setAnnTitleEn('');
    setAnnTitleUr('');
    setAnnBodyEn('');
    setAnnBodyUr('');
    setAnnCategory('general');
    setAnnPublished(true);
    setAnnStartDate('');
    setAnnExpiryDate('');
    setAnnSendPush(false);
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = editingAnnId
      ? `/api/admin/announcements/${editingAnnId}`
      : '/api/admin/announcements';
    const method = editingAnnId ? 'PUT' : 'POST';
    const res = await adminFetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleEn: annTitleEn,
        titleUr: annTitleUr,
        bodyEn: annBodyEn,
        bodyUr: annBodyUr,
        category: annCategory,
        isPublished: annPublished,
        startDate: annStartDate || null,
        expiryDate: annExpiryDate || null,
        sendPush: annSendPush,
      }),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to save announcement');
    resetAnnouncementForm();
    await refreshAfterMutation(editingAnnId ? 'Announcement updated' : 'Announcement saved');
  };

  const handleDeleteAnnouncement = async (id: number) => {
    const res = await adminFetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
    if (!res.ok) return notify('err', 'Failed to delete announcement');
    await refreshAfterMutation('Announcement deleted');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminFetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const json = await res.json();
    if (!res.ok) return notify('err', json.error || 'Failed to update password');
    setCurrentPassword('');
    setNewPassword('');
    notify('ok', 'Administrator password updated');
  };

  if (!authChecked) {
    return (
      <div className="min-h-dvh islamic-lattice-bg flex items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-[#0B3B2B]/20 border-t-[#0B3B2B] animate-spin" />
      </div>
    );
  }

  // LOGIN VIEW
  if (!authenticated) {
    return (
      <div className="min-h-dvh islamic-lattice-bg flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white border border-[#0B3B2B]/12 shadow-lg p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBackToSite}
              className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-medium text-[#0B3B2B] hover:text-[#B68D40] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Timetable</span>
            </button>
            <MosqueEmblem className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-[#0B3B2B]">
              Administrator Sign In
            </h1>
            <p className="text-sm text-[#15241E]/65">
              MASJID-E-BILAL · Timetable & Announcement Management
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-username" className="block text-xs font-semibold text-[#15241E]">
                Username
              </label>
              <input
                id="admin-username"
                type="text"
                autoComplete="username"
                required
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3.5 text-sm text-[#15241E] focus:outline-none focus:ring-2 focus:ring-[#0B3B2B]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="block text-xs font-semibold text-[#15241E]">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] pl-3.5 pr-12 text-sm text-[#15241E] focus:outline-none focus:ring-2 focus:ring-[#0B3B2B]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#0B3B2B]/65 hover:text-[#0B3B2B] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-800">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full min-h-[46px] rounded-xl bg-[#0B3B2B] text-[#FAF8F4] text-sm font-semibold hover:bg-[#072A1E] disabled:opacity-60 transition-colors cursor-pointer"
            >
              {loggingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // AUTHENTICATED ADMIN DASHBOARD
  const tabs: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Timings', icon: <Clock className="w-4 h-4" /> },
    { id: 'schedule', label: 'Annual PDF', icon: <Calendar className="w-4 h-4" /> },
    { id: 'maghrib', label: 'Maghrib', icon: <Sun className="w-4 h-4" /> },
    { id: 'qaza', label: 'Ending & Qaza', icon: <Compass className="w-4 h-4" /> },
    { id: 'jumuah_eid', label: "Jumu'ah & Eid", icon: <Moon className="w-4 h-4" /> },
    { id: 'hijri', label: 'Hijri Date', icon: <Calendar className="w-4 h-4" /> },
    { id: 'announcements', label: 'Notices', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'security', label: 'Security', icon: <KeyRound className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-dvh islamic-lattice-bg pb-12">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-30 bg-[#0B3B2B] text-[#FAF8F4] border-b border-[#C9A24D]/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToSite}
              className="min-h-[44px] px-3 inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Public Site</span>
            </button>
            <div className="min-w-0">
              <div className="font-display text-lg font-bold truncate">
                Masjid-e-Bilal Admin
              </div>
              <div className="text-[11px] text-[#F5E6C4]/75 truncate">
                Signed in as {adminUsername}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[44px] px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-[#C9A24D]/40 text-xs font-medium text-[#F5E6C4] hover:bg-white/10 cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Tab Bar */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-2.5 overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#C9A24D] text-[#072A1E]'
                    : 'text-[#FAF8F4]/80 hover:bg-white/10'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-5">
        {toast && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium border ${
              toast.type === 'ok'
                ? 'bg-[#0B3B2B] text-[#FAF8F4] border-[#C9A24D]/50'
                : 'bg-red-50 text-red-900 border-red-200'
            }`}
          >
            {toast.text}
          </div>
        )}

        {loadingOverview && !overview && (
          <div className="p-10 text-center text-sm text-[#15241E]/65">Loading dashboard...</div>
        )}

        {overview && activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Quick Status Summary */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-4 space-y-1">
                <div className="text-xs font-medium text-[#15241E]/60">Today in Karachi</div>
                <div className="text-base font-semibold text-[#0B3B2B]">
                  {overview.timetable.date.formattedGregorianEn}
                </div>
                <div className="text-xs text-[#B68D40]">
                  {overview.timetable.date.hijri.day} {overview.timetable.date.hijri.monthEn}{' '}
                  {overview.timetable.date.hijri.year} AH
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-4 space-y-1">
                <div className="text-xs font-medium text-[#15241E]/60">Maghrib Automation</div>
                <div className="text-base font-semibold text-[#0B3B2B]">
                  {overview.timetable.maghribMeta.status === 'live'
                    ? 'AlAdhan Live Sync'
                    : overview.timetable.maghribMeta.status === 'cached'
                      ? 'Using Cached Sunset'
                      : overview.timetable.maghribMeta.status === 'manual'
                        ? 'Manual Override Active'
                        : 'Awaiting Sync'}
                </div>
                <div className="text-xs text-[#15241E]/65 font-mono-tabular">
                  Sunset: {overview.timetable.maghribMeta.sunsetTime12 || '—'} · Offset:{' '}
                  {overview.settings.maghrib_offset_minutes} min
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-4 space-y-1">
                <div className="text-xs font-medium text-[#15241E]/60">
                  Announcements & Subscribers
                </div>
                <div className="text-base font-semibold text-[#0B3B2B]">
                  {overview.announcements.filter((a) => a.is_published === 1).length} Published
                </div>
                <div className="text-xs text-[#15241E]/65">
                  {overview.activeSubscribers} active browser alert subscribers
                </div>
              </div>
            </section>

            {/* Quick Prayer Timing Overrides */}
            <section className="rounded-2xl bg-white border border-[#0B3B2B]/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#0B3B2B]/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#0B3B2B]">
                    Active Prayer Timings & Quick Overrides
                  </h2>
                  <p className="text-xs text-[#15241E]/65">
                    Zuhr defaults to 1:30 PM year-round. Overrides take immediate effect until reset.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetAllOverrides}
                  className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-[#0B3B2B]/20 text-xs font-semibold text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All Overrides</span>
                </button>
              </div>

              <div className="divide-y divide-[#0B3B2B]/8">
                {overview.timetable.prayers.map((prayer) => (
                  <div
                    key={prayer.key}
                    className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#15241E]">{prayer.nameEn}</span>
                        <span className="font-arabic text-[#0B3B2B]">{prayer.nameUr}</span>
                        {prayer.isOverridden && (
                          <span className="text-xs font-semibold text-[#B68D40]">
                            · Override Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#15241E]/60">
                        Active: {prayer.time12} ({prayer.sourceLabelEn})
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="time"
                        value={overrideInputs[prayer.key] || ''}
                        onChange={(e) =>
                          setOverrideInputs((prev) => ({
                            ...prev,
                            [prayer.key]: e.target.value,
                          }))
                        }
                        className="min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-mono-tabular"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveOverride(prayer.key, true)}
                        className="min-h-[44px] px-4 rounded-xl bg-[#0B3B2B] text-white text-xs font-semibold hover:bg-[#072A1E] cursor-pointer"
                      >
                        Apply Override
                      </button>
                      {prayer.isOverridden && (
                        <button
                          type="button"
                          onClick={() => handleSaveOverride(prayer.key, false)}
                          className="min-h-[44px] px-3.5 rounded-xl border border-[#0B3B2B]/20 text-xs font-semibold text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: ANNUAL TIMETABLE (Namaz Timings.pdf) */}
        {overview && activeTab === 'schedule' && (
          <div className="space-y-5">
            <section className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#0B3B2B]">
                    Add Annual Change Date
                  </h2>
                  <p className="text-xs text-[#15241E]/65">
                    Leave a prayer blank if it remains unchanged on that date.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRestorePdf}
                  className="min-h-[44px] px-4 inline-flex items-center gap-1.5 rounded-xl border border-[#B68D40] text-xs font-semibold text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Original PDF Schedule</span>
                </button>
              </div>

              <form onSubmit={handleAddScheduleRow} className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold mb-1">Month</label>
                  <select
                    value={newMonth}
                    onChange={(e) => setNewMonth(Number(e.target.value))}
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-2.5 text-sm"
                  >
                    {MONTH_NAMES_EN.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Day</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={newDay}
                    onChange={(e) => setNewDay(Number(e.target.value))}
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Fajr</label>
                  <input
                    type="time"
                    value={newFajr}
                    onChange={(e) => setNewFajr(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-2.5 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Asr</label>
                  <input
                    type="time"
                    value={newAsr}
                    onChange={(e) => setNewAsr(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-2.5 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Isha</label>
                  <input
                    type="time"
                    value={newIsha}
                    onChange={(e) => setNewIsha(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-2.5 text-sm font-mono-tabular"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[44px] px-4 rounded-xl bg-[#0B3B2B] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#072A1E] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Save Date</span>
                </button>
              </form>
            </section>

            <section className="rounded-2xl bg-white border border-[#0B3B2B]/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#0B3B2B]/10">
                <h3 className="font-semibold text-[#0B3B2B]">
                  Annual Change Dates ({overview.schedule.length} entries)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-[#FAF8F4] border-b border-[#0B3B2B]/10 text-xs font-semibold text-[#0B3B2B]">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Fajr</th>
                      <th className="py-3 px-4">Asr</th>
                      <th className="py-3 px-4">Isha</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0B3B2B]/8">
                    {overview.schedule.map((row) => {
                      const isEditing = editingRowId === row.id;
                      return (
                        <tr key={row.id} className="hover:bg-[#FAF8F4]/60">
                          <td className="py-2.5 px-4 font-medium">
                            {isEditing ? (
                              <div className="flex gap-1.5">
                                <select
                                  value={editRowData.month}
                                  onChange={(e) =>
                                    setEditRowData((d) => ({ ...d, month: Number(e.target.value) }))
                                  }
                                  className="rounded-lg border px-2 py-1 text-xs"
                                >
                                  {MONTH_NAMES_EN.map((m, i) => (
                                    <option key={m} value={i + 1}>
                                      {m.slice(0, 3)}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min={1}
                                  max={31}
                                  value={editRowData.day}
                                  onChange={(e) =>
                                    setEditRowData((d) => ({ ...d, day: Number(e.target.value) }))
                                  }
                                  className="w-14 rounded-lg border px-2 py-1 text-xs"
                                />
                              </div>
                            ) : (
                              `${String(row.day).padStart(2, '0')} ${MONTH_NAMES_EN[row.month - 1]}`
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono-tabular">
                            {isEditing ? (
                              <input
                                type="time"
                                value={editRowData.fajr}
                                onChange={(e) =>
                                  setEditRowData((d) => ({ ...d, fajr: e.target.value }))
                                }
                                className="rounded-lg border px-2 py-1 text-xs"
                              />
                            ) : row.fajr ? (
                              formatTime24To12Client(row.fajr)
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono-tabular">
                            {isEditing ? (
                              <input
                                type="time"
                                value={editRowData.asr}
                                onChange={(e) =>
                                  setEditRowData((d) => ({ ...d, asr: e.target.value }))
                                }
                                className="rounded-lg border px-2 py-1 text-xs"
                              />
                            ) : row.asr ? (
                              formatTime24To12Client(row.asr)
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono-tabular">
                            {isEditing ? (
                              <input
                                type="time"
                                value={editRowData.isha}
                                onChange={(e) =>
                                  setEditRowData((d) => ({ ...d, isha: e.target.value }))
                                }
                                className="rounded-lg border px-2 py-1 text-xs"
                              />
                            ) : row.isha ? (
                              formatTime24To12Client(row.isha)
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateScheduleRow(row.id)}
                                  className="px-3 py-1.5 rounded-lg bg-[#0B3B2B] text-white text-xs font-medium cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRowId(null)}
                                  className="px-3 py-1.5 rounded-lg border text-xs cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRowId(row.id);
                                    setEditRowData({
                                      month: row.month,
                                      day: row.day,
                                      fajr: row.fajr || '',
                                      asr: row.asr || '',
                                      isha: row.isha || '',
                                    });
                                  }}
                                  className="px-3 py-1.5 rounded-lg border border-[#0B3B2B]/20 text-xs font-medium text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteScheduleRow(row.id)}
                                  aria-label="Delete schedule row"
                                  className="p-1.5 rounded-lg text-red-700 hover:bg-red-50 cursor-pointer inline-flex items-center"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: MAGHRIB AUTOMATION */}
        {overview && activeTab === 'maghrib' && (
          <section className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-[#0B3B2B]">
                  Automatic Karachi Maghrib Settings
                </h2>
                <p className="text-xs text-[#15241E]/65">
                  Daily astronomical sunset via AlAdhan Method 1 (University of Islamic Sciences,
                  Karachi) + configurable mosque congregation offset.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRefreshMaghribApi}
                className="min-h-[44px] px-4 inline-flex items-center gap-1.5 rounded-xl border border-[#0B3B2B]/20 text-xs font-semibold text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh API Now</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl bg-[#FAF8F4] border border-[#0B3B2B]/10 p-4">
              <div>
                <div className="text-xs text-[#15241E]/60">Today's Karachi Sunset</div>
                <div className="font-mono-tabular text-lg font-bold text-[#0B3B2B]">
                  {overview.timetable.maghribMeta.sunsetTime12 || 'Unavailable'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#15241E]/60">Mosque Offset</div>
                <div className="font-mono-tabular text-lg font-bold text-[#0B3B2B]">
                  {maghribOffset >= 0 ? `+${maghribOffset}` : maghribOffset} min
                </div>
              </div>
              <div>
                <div className="text-xs text-[#15241E]/60">Displayed Maghrib Jamaat</div>
                <div className="font-mono-tabular text-lg font-bold text-[#B68D40]">
                  {overview.timetable.maghribMeta.jamaatTime12 || '—'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3.5 rounded-xl border border-[#0B3B2B]/15 cursor-pointer">
                <input
                  type="checkbox"
                  checked={maghribAuto}
                  onChange={(e) => setMaghribAuto(e.target.checked)}
                  className="w-5 h-5 accent-[#0B3B2B]"
                />
                <div>
                  <div className="text-sm font-semibold text-[#15241E]">
                    Automatic Daily Sunset Calculation
                  </div>
                  <div className="text-xs text-[#15241E]/60">
                    Uncheck only to hold a fixed manual Maghrib time
                  </div>
                </div>
              </label>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Congregation Offset After Sunset (minutes)
                </label>
                <input
                  type="number"
                  min={-30}
                  max={60}
                  value={maghribOffset}
                  onChange={(e) => setMaghribOffset(Number(e.target.value))}
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-mono-tabular"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">City</label>
                <input
                  type="text"
                  value={karachiCity}
                  onChange={(e) => setKarachiCity(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Country</label>
                <input
                  type="text"
                  value={karachiCountry}
                  onChange={(e) => setKarachiCountry(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                />
              </div>

              {!maghribAuto && (
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Manual Maghrib Time
                  </label>
                  <input
                    type="time"
                    value={maghribManual}
                    onChange={(e) => setMaghribManual(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-mono-tabular"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleSaveMaghrib(false)}
                className="min-h-[44px] px-5 rounded-xl bg-[#0B3B2B] text-white text-sm font-semibold hover:bg-[#072A1E] cursor-pointer"
              >
                Save Maghrib Settings
              </button>
              <button
                type="button"
                onClick={() => handleSaveMaghrib(true)}
                className="min-h-[44px] px-4 rounded-xl border border-[#0B3B2B]/20 text-sm font-medium text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer"
              >
                Reset to Automatic Mode
              </button>
            </div>
          </section>
        )}

        {/* TAB 4: PRAYER ENDING & QAZA SETTINGS */}
        {overview && activeTab === 'qaza' && (
          <form onSubmit={handleSaveQaza} className="space-y-5">
            <section className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 max-w-2xl">
                  <h2 className="font-display text-xl font-bold text-[#0B3B2B]">
                    Prayer Ending & Qaza Settings
                  </h2>
                  <p className="text-xs text-[#15241E]/70 leading-relaxed">
                    Uses daily Karachi astronomical boundaries (AlAdhan Method 1 · University of
                    Islamic Sciences, Karachi) to calculate when each prayer&apos;s valid window ends
                    and Qaza begins. PDF Jamaat timings (Fajr, Asr, Isha) and fixed 1:30 PM Zuhr
                    remain completely unchanged. Please verify selected rules with the mosque&apos;s
                    appointed religious authority.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshMaghribApi}
                  className="min-h-[44px] px-4 inline-flex items-center gap-1.5 rounded-xl border border-[#0B3B2B]/20 text-xs font-semibold text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Refresh Astronomical Data</span>
                </button>
              </div>

              {/* Source & Fetch Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-[#FAF8F4] border border-[#0B3B2B]/10 p-4 text-xs">
                <div>
                  <div className="text-[#15241E]/60">Astronomical Source</div>
                  <div className="font-semibold text-[#0B3B2B] mt-0.5">
                    {overview.timetable.qazaConfig.astronomicalSource === 'aladhan'
                      ? 'AlAdhan Karachi (Method 1)'
                      : overview.timetable.qazaConfig.astronomicalSource === 'cached'
                        ? 'Cached Astronomical Snapshot'
                        : 'Unavailable'}
                  </div>
                </div>
                <div>
                  <div className="text-[#15241E]/60">Last API Sync</div>
                  <div className="font-mono-tabular font-semibold text-[#0B3B2B] mt-0.5">
                    {overview.timetable.qazaConfig.astronomicalFetchedAt || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[#15241E]/60">Qaza Config Updated</div>
                  <div className="font-mono-tabular font-semibold text-[#0B3B2B] mt-0.5">
                    {overview.qazaSettings?.updated_at || overview.timetable.qazaConfig.updatedAt || '—'}
                  </div>
                </div>
              </div>

              {/* Enable Toggle + Policy Rules */}
              <div className="space-y-4">
                <label className="flex items-center gap-3 p-3.5 rounded-xl border border-[#0B3B2B]/15 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qazaEnabled}
                    onChange={(e) => setQazaEnabled(e.target.checked)}
                    className="w-5 h-5 accent-[#0B3B2B]"
                  />
                  <div>
                    <div className="text-sm font-semibold text-[#15241E]">
                      Display Prayer Ending & Qaza times on Public Homepage
                    </div>
                    <div className="text-xs text-[#15241E]/60">
                      Shows JAMAAT TIME, PRAYER ENDS, QAZA STARTS, and expandable accuracy details
                    </div>
                  </div>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Jurisprudential Policy
                    </label>
                    <select
                      value={qazaPolicy}
                      onChange={(e) => {
                        const nextPolicy = e.target.value as 'hanafi' | 'standard';
                        setQazaPolicy(nextPolicy);
                        setZuhrEndRule(nextPolicy === 'hanafi' ? 'asr_hanafi' : 'asr_standard');
                      }}
                      className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                    >
                      <option value="hanafi">Hanafi Fiqh (Default for Masjid-e-Bilal)</option>
                      <option value="standard">Standard / Jamhur Fiqh (Shafi&apos;i, Maliki, Hanbali)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Zuhr Ending & Qaza Rule
                    </label>
                    <select
                      value={zuhrEndRule}
                      onChange={(e) =>
                        setZuhrEndRule(e.target.value as 'asr_hanafi' | 'asr_standard')
                      }
                      className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                    >
                      <option value="asr_hanafi">
                        Hanafi Asr Start (Mithl Thani · 2x Shadow)
                      </option>
                      <option value="asr_standard">
                        Standard Asr Start (Mithl Awwal · 1x Shadow)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Isha Ending & Qaza Rule
                    </label>
                    <select
                      value={ishaEndRule}
                      onChange={(e) =>
                        setIshaEndRule(
                          e.target.value as 'subh_sadiq' | 'islamic_midnight' | 'first_third',
                        )
                      }
                      className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                    >
                      <option value="subh_sadiq">
                        Subh Sadiq (Next Fajr Start — Hanafi Qaza Boundary)
                      </option>
                      <option value="islamic_midnight">
                        Islamic Midnight (Half-night Preferred Window)
                      </option>
                      <option value="first_third">First Third of Night</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Approaching-End Warning Threshold (minutes, 0–90)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={qazaWarnMin}
                      onChange={(e) => setQazaWarnMin(Number(e.target.value))}
                      className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-[#F3EFE6]/70 border border-[#0B3B2B]/10 px-4 py-3 text-xs text-[#15241E]/80 space-y-1">
                  <div>
                    <strong className="text-[#0B3B2B]">Fixed Astronomical Rules:</strong> Fajr ends
                    at Local Sunrise (Shuruq); Asr ends at Local Sunset; Maghrib ends at Isha Start
                    (Shafaq Abyad, Karachi Method 1).
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Religious Authority Verification Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={authorityNote}
                    onChange={(e) => setAuthorityNote(e.target.value)}
                    placeholder="e.g., Ending times verified under Hanafi jurisprudence by Masjid Imam."
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                  />
                </div>
              </div>
            </section>

            {/* Daily Astronomical Snapshot */}
            <section className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-5 space-y-3">
              <h3 className="font-semibold text-[#0B3B2B] text-sm">
                Today&apos;s AlAdhan Karachi Astronomical Reference ({overview.timetable.date.karachiIso})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                {[
                  {
                    label: 'Fajr (Subh Sadiq)',
                    val: overview.timetable.qazaConfig.astronomicalSnapshot.fajrStart12,
                  },
                  {
                    label: 'Sunrise (Shuruq)',
                    val: overview.timetable.qazaConfig.astronomicalSnapshot.sunrise12,
                  },
                  {
                    label: 'Dhuhr Start',
                    val: overview.timetable.qazaConfig.astronomicalSnapshot.dhuhrStart12,
                  },
                  {
                    label: 'Asr (Hanafi 2x)',
                    val: overview.timetable.qazaConfig.astronomicalSnapshot.asrHanafi12,
                  },
                  {
                    label: 'Asr (Standard 1x)',
                    val: overview.timetable.qazaConfig.astronomicalSnapshot.asrStandard12,
                  },
                  {
                    label: 'Local Sunset',
                    val: overview.timetable.qazaConfig.astronomicalSnapshot.sunset12,
                  },
                  {
                    label: 'Isha Start',
                    val: overview.timetable.qazaConfig.astronomicalSnapshot.ishaStart12,
                  },
                  {
                    label: 'Islamic Midnight',
                    val: overview.timetable.qazaConfig.astronomicalSnapshot.midnight12,
                  },
                  {
                    label: 'First Third Night',
                    val: overview.timetable.qazaConfig.astronomicalSnapshot.firstThird12,
                  },
                  {
                    label: 'Next Day Fajr',
                    val: overview.timetable.qazaConfig.astronomicalSnapshot.nextFajrStart12,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl bg-[#FAF8F4] border border-[#0B3B2B]/10 px-3 py-2"
                  >
                    <div className="text-[11px] text-[#15241E]/60">{item.label}</div>
                    <div className="font-mono-tabular text-sm font-semibold text-[#0B3B2B] mt-0.5">
                      {item.val || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Calculated End Times & Manual Overrides */}
            <section className="rounded-2xl bg-white border border-[#0B3B2B]/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#0B3B2B]/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[#0B3B2B]">
                    Daily Calculated Endings & Optional Manual Overrides
                  </h3>
                  <p className="text-xs text-[#15241E]/65">
                    Leave override blank for automatic AlAdhan calculation. Manual overrides are
                    explicitly labeled on the public timetable and never treated as automated rules.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleResetQazaOverride()}
                  className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-[#0B3B2B]/20 text-xs font-semibold text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore All Automatic Calculations</span>
                </button>
              </div>

              <div className="divide-y divide-[#0B3B2B]/8">
                {overview.timetable.prayers.map((prayer) => (
                  <div
                    key={prayer.key}
                    className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#15241E]">{prayer.nameEn}</span>
                        <span className="font-arabic text-[#0B3B2B]">{prayer.nameUr}</span>
                        {prayer.isEndOverridden && (
                          <span className="text-xs font-semibold text-[#B68D40]">
                            · Manual Override Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#15241E]/70 flex flex-wrap gap-x-3 gap-y-0.5 font-mono-tabular">
                        <span>Jamaat: {prayer.time12}</span>
                        <span>Ends: {prayer.endTime12 || '—'}</span>
                        <span>Qaza: {prayer.qazaStarts12 || '—'}</span>
                      </div>
                      <div className="text-[11px] text-[#15241E]/55">
                        {prayer.endRuleLabelEn} · {prayer.endSourceLabelEn}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="time"
                        aria-label={`Manual end time override for ${prayer.nameEn}`}
                        value={manualEndInputs[prayer.key] || ''}
                        onChange={(e) =>
                          setManualEndInputs((prev) => ({
                            ...prev,
                            [prayer.key]: e.target.value,
                          }))
                        }
                        className="min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-mono-tabular"
                      />
                      {(prayer.isEndOverridden || manualEndInputs[prayer.key]) && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualEndInputs((prev) => ({ ...prev, [prayer.key]: '' }));
                            handleResetQazaOverride(prayer.key);
                          }}
                          className="min-h-[44px] px-3.5 rounded-xl border border-[#0B3B2B]/20 text-xs font-semibold text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer"
                        >
                          Restore Auto
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5 py-4 bg-[#FAF8F4] border-t border-[#0B3B2B]/10 flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-xl bg-[#0B3B2B] text-white text-sm font-semibold hover:bg-[#072A1E] cursor-pointer"
                >
                  Save Ending & Qaza Settings
                </button>
              </div>
            </section>
          </form>
        )}

        {/* TAB 4: JUMU'AH & EID */}
        {overview && activeTab === 'jumuah_eid' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <form
              onSubmit={handleSaveJumuah}
              className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-5 space-y-4"
            >
              <div>
                <h2 className="font-display text-xl font-bold text-[#0B3B2B]">
                  Jumu'ah Prayer Settings
                </h2>
                <p className="text-xs text-[#15241E]/65">
                  Jumu'ah timing is managed independently from Zuhr (1:30 PM).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Jumu'ah Jamaat Time</label>
                <input
                  type="time"
                  value={jumuahTime}
                  onChange={(e) => setJumuahTime(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-mono-tabular"
                />
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-[#0B3B2B]/12 cursor-pointer">
                <input
                  type="checkbox"
                  checked={jumuahAllWeek}
                  onChange={(e) => setJumuahAllWeek(e.target.checked)}
                  className="w-5 h-5 accent-[#0B3B2B]"
                />
                <span className="text-sm text-[#15241E]">
                  Display Jumu'ah card on all days of the week (otherwise Fridays only)
                </span>
              </label>

              <div>
                <label className="block text-xs font-semibold mb-1">Note (English)</label>
                <input
                  type="text"
                  value={jumuahNoteEn}
                  onChange={(e) => setJumuahNoteEn(e.target.value)}
                  placeholder="e.g., Khutbah starts at 1:15 PM"
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Note (Urdu / اردو)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={jumuahNoteUr}
                  onChange={(e) => setJumuahNoteUr(e.target.value)}
                  placeholder="مثال: خطبہ جمعہ 1:15 بجے شروع ہوگا"
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-arabic"
                />
              </div>

              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#0B3B2B] text-white text-sm font-semibold hover:bg-[#072A1E] cursor-pointer"
              >
                Save Jumu'ah Settings
              </button>
            </form>

            <form
              onSubmit={handleSaveEid}
              className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-5 space-y-4"
            >
              <div>
                <h2 className="font-display text-xl font-bold text-[#0B3B2B]">
                  Eid Prayer Announcement
                </h2>
                <p className="text-xs text-[#15241E]/65">
                  Hidden from public homepage whenever disabled.
                </p>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-[#0B3B2B]/12 cursor-pointer">
                <input
                  type="checkbox"
                  checked={eidActive}
                  onChange={(e) => setEidActive(e.target.checked)}
                  className="w-5 h-5 accent-[#0B3B2B]"
                />
                <span className="text-sm font-semibold text-[#15241E]">
                  Publish Eid Prayer Section on Homepage
                </span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Eid Type</label>
                  <select
                    value={eidType}
                    onChange={(e) => setEidType(e.target.value as 'fitr' | 'adha')}
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                  >
                    <option value="fitr">Eid-ul-Fitr</option>
                    <option value="adha">Eid-ul-Adha</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Eid Prayer Time</label>
                  <input
                    type="time"
                    value={eidTime}
                    onChange={(e) => setEidTime(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-mono-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Eid Date Label</label>
                <input
                  type="text"
                  value={eidDate}
                  onChange={(e) => setEidDate(e.target.value)}
                  placeholder="e.g., 1st Shawwal · Wednesday"
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Additional Info (English)</label>
                <input
                  type="text"
                  value={eidNoteEn}
                  onChange={(e) => setEidNoteEn(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Additional Info (Urdu)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={eidNoteUr}
                  onChange={(e) => setEidNoteUr(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-arabic"
                />
              </div>

              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#0B3B2B] text-white text-sm font-semibold hover:bg-[#072A1E] cursor-pointer"
              >
                Save Eid Announcement
              </button>
            </form>
          </div>
        )}

        {/* TAB 5: HIJRI DATE MANAGEMENT */}
        {overview && activeTab === 'hijri' && (
          <section className="rounded-2xl bg-white border border-[#0B3B2B]/10 p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold text-[#0B3B2B]">
                Islamic Hijri Date & Moon-Sighting Correction
              </h2>
              <p className="text-xs text-[#15241E]/65">
                Current API Hijri Date:{' '}
                {overview.hijriSettings.cached_hijri_day}{' '}
                {overview.hijriSettings.cached_hijri_month_en}{' '}
                {overview.hijriSettings.cached_hijri_year} AH
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#15241E]">
                Quick Day Adjustment (-1, 0, +1 Day)
              </div>
              <div className="flex items-center gap-2">
                {[-1, 0, 1].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setHijriAdj(val)}
                    className={`min-h-[44px] px-5 rounded-xl text-sm font-semibold border cursor-pointer ${
                      hijriAdj === val
                        ? 'bg-[#0B3B2B] text-white border-[#0B3B2B]'
                        : 'bg-[#FAF8F4] text-[#15241E] border-[#0B3B2B]/20'
                    }`}
                  >
                    {val > 0 ? `+${val} Day` : val === 0 ? '0 (No Adjustment)' : `${val} Day`}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-[#0B3B2B]/10 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hijriManualEnabled}
                  onChange={(e) => setHijriManualEnabled(e.target.checked)}
                  className="w-5 h-5 accent-[#0B3B2B]"
                />
                <span className="text-sm font-semibold text-[#15241E]">
                  Override Hijri Date Manually (Local Ruet-e-Hilal / Moon Sighting)
                </span>
              </label>

              {hijriManualEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Hijri Day (1-30)</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={hijriManualDay}
                      onChange={(e) => setHijriManualDay(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Month (English)</label>
                    <input
                      type="text"
                      value={hijriManualMonthEn}
                      onChange={(e) => setHijriManualMonthEn(e.target.value)}
                      placeholder="e.g., Jumada al-Ula"
                      className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Month (Arabic)</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={hijriManualMonthAr}
                      onChange={(e) => setHijriManualMonthAr(e.target.value)}
                      placeholder="جمادى الأولى"
                      className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-arabic"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Hijri Year</label>
                    <input
                      type="number"
                      value={hijriManualYear}
                      onChange={(e) => setHijriManualYear(e.target.value)}
                      placeholder="1448"
                      className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleSaveHijri(false)}
                className="min-h-[44px] px-5 rounded-xl bg-[#0B3B2B] text-white text-sm font-semibold hover:bg-[#072A1E] cursor-pointer"
              >
                Save Hijri Date Settings
              </button>
              <button
                type="button"
                onClick={() => handleSaveHijri(true)}
                className="min-h-[44px] px-4 rounded-xl border border-[#0B3B2B]/20 text-sm font-medium text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer"
              >
                Reset to API Date
              </button>
            </div>
          </section>
        )}

        {/* TAB 6: ANNOUNCEMENTS & NOTIFICATIONS */}
        {overview && activeTab === 'announcements' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <form
              onSubmit={handleSaveAnnouncement}
              className="lg:col-span-5 rounded-2xl bg-white border border-[#0B3B2B]/10 p-5 space-y-3.5"
            >
              <h2 className="font-display text-xl font-bold text-[#0B3B2B]">
                {editingAnnId ? 'Edit Announcement' : 'Create Announcement'}
              </h2>

              <div>
                <label className="block text-xs font-semibold mb-1">Category</label>
                <select
                  value={annCategory}
                  onChange={(e) =>
                    setAnnCategory(
                      e.target.value as 'important' | 'timing' | 'jumuah' | 'eid' | 'general',
                    )
                  }
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                >
                  <option value="important">Important Announcement</option>
                  <option value="timing">Prayer Timing Update</option>
                  <option value="jumuah">Jumu'ah Announcement</option>
                  <option value="eid">Eid Announcement</option>
                  <option value="general">General Mosque Info</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Title (English)</label>
                <input
                  type="text"
                  required
                  value={annTitleEn}
                  onChange={(e) => setAnnTitleEn(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Title (Urdu / اردو)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={annTitleUr}
                  onChange={(e) => setAnnTitleUr(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm font-arabic"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Message (English)</label>
                <textarea
                  required
                  rows={3}
                  value={annBodyEn}
                  onChange={(e) => setAnnBodyEn(e.target.value)}
                  className="w-full rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] p-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Message (Urdu / اردو)</label>
                <textarea
                  rows={3}
                  dir="rtl"
                  value={annBodyUr}
                  onChange={(e) => setAnnBodyUr(e.target.value)}
                  className="w-full rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] p-3 text-sm font-arabic"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Start Date</label>
                  <input
                    type="date"
                    value={annStartDate}
                    onChange={(e) => setAnnStartDate(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={annExpiryDate}
                    onChange={(e) => setAnnExpiryDate(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-2.5 text-xs"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={annPublished}
                  onChange={(e) => setAnnPublished(e.target.checked)}
                  className="w-4 h-4 accent-[#0B3B2B]"
                />
                <span className="text-sm">Publish on public homepage</span>
              </label>

              {annPublished && (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={annSendPush}
                    onChange={(e) => setAnnSendPush(e.target.checked)}
                    className="w-4 h-4 accent-[#0B3B2B]"
                  />
                  <span className="text-sm">Dispatch browser alert to subscribed visitors</span>
                </label>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 min-h-[44px] rounded-xl bg-[#0B3B2B] text-white text-sm font-semibold hover:bg-[#072A1E] cursor-pointer"
                >
                  {editingAnnId ? 'Update Announcement' : 'Save Announcement'}
                </button>
                {editingAnnId && (
                  <button
                    type="button"
                    onClick={resetAnnouncementForm}
                    className="min-h-[44px] px-4 rounded-xl border text-sm cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <section className="lg:col-span-7 rounded-2xl bg-white border border-[#0B3B2B]/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#0B3B2B]/10">
                <h3 className="font-semibold text-[#0B3B2B]">
                  All Announcements ({overview.announcements.length})
                </h3>
              </div>

              {overview.announcements.length === 0 ? (
                <div className="p-6 text-sm text-[#15241E]/60">No announcements created yet.</div>
              ) : (
                <div className="divide-y divide-[#0B3B2B]/8">
                  {overview.announcements.map((item) => (
                    <div key={item.id} className="p-5 flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-[#B68D40]">
                          {item.category.toUpperCase()} ·{' '}
                          {item.is_published === 1 ? 'Published' : 'Draft'}
                          {item.expiry_date ? ` · Expires ${item.expiry_date}` : ''}
                        </div>
                        <div className="font-semibold text-[#15241E]">{item.title_en}</div>
                        <div className="text-sm text-[#15241E]/75">{item.body_en}</div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAnnId(item.id);
                            setAnnTitleEn(item.title_en);
                            setAnnTitleUr(item.title_ur || '');
                            setAnnBodyEn(item.body_en);
                            setAnnBodyUr(item.body_ur || '');
                            setAnnCategory(item.category);
                            setAnnPublished(item.is_published === 1);
                            setAnnStartDate(item.start_date || '');
                            setAnnExpiryDate(item.expiry_date || '');
                          }}
                          className="px-3 py-1.5 rounded-lg border border-[#0B3B2B]/20 text-xs font-medium text-[#0B3B2B] hover:bg-[#F3EFE6] cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(item.id)}
                          aria-label="Delete announcement"
                          className="p-2 rounded-lg text-red-700 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 7: SECURITY */}
        {overview && activeTab === 'security' && (
          <form
            onSubmit={handleChangePassword}
            className="max-w-md rounded-2xl bg-white border border-[#0B3B2B]/10 p-6 space-y-4"
          >
            <h2 className="font-display text-xl font-bold text-[#0B3B2B]">
              Change Administrator Password
            </h2>
            <div>
              <label className="block text-xs font-semibold mb-1">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                New Password (minimum 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#0B3B2B]/20 bg-[#FAF8F4] px-3 text-sm"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-[#0B3B2B] text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#072A1E] cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Update Password</span>
            </button>
          </form>
        )}
      </main>
    </div>
  );
};
