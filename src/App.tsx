import { useCallback, useEffect, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { PublicTimetable } from './components/PublicTimetable';
import type { Language, TimetablePayload } from './types/timetable';

export default function App() {
  const [view, setView] = useState<'public' | 'admin'>('public');
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('masjid_lang');
      return saved === 'ur' ? 'ur' : 'en';
    } catch {
      return 'en';
    }
  });
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('masjid_reduce_motion');
      if (saved !== null) return saved === 'true';
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      return false;
    }
  });

  const [timetable, setTimetable] = useState<TimetablePayload | null>(() => {
    try {
      const cached = localStorage.getItem('masjid_cached_timetable');
      return cached ? (JSON.parse(cached) as TimetablePayload) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTimetable = useCallback(async () => {
    try {
      setError('');
      const res = await fetch('/api/timetable/today');
      if (!res.ok) throw new Error('Unable to load daily prayer timetable');
      const data = (await res.json()) as TimetablePayload;
      setTimetable(data);
      try {
        localStorage.setItem('masjid_cached_timetable', JSON.stringify(data));
      } catch {
        // Ignore storage quota errors
      }
    } catch (err) {
      setError((err as Error).message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTimetable();
    const interval = window.setInterval(fetchTimetable, 1000 * 60 * 15);
    return () => window.clearInterval(interval);
  }, [fetchTimetable]);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    try {
      localStorage.setItem('masjid_lang', lang);
    } catch {
      // ignore
    }
  };

  const handleToggleReduceMotion = () => {
    const next = !reduceMotion;
    setReduceMotion(next);
    try {
      localStorage.setItem('masjid_reduce_motion', String(next));
    } catch {
      // ignore
    }
  };

  if (view === 'admin') {
    return (
      <AdminPanel
        onBackToSite={() => setView('public')}
        onDataUpdated={fetchTimetable}
      />
    );
  }

  return (
    <PublicTimetable
      data={timetable}
      loading={loading}
      error={error}
      language={language}
      onLanguageChange={handleLanguageChange}
      reduceMotion={reduceMotion}
      onToggleReduceMotion={handleToggleReduceMotion}
      onOpenAdmin={() => setView('admin')}
      onRefresh={fetchTimetable}
    />
  );
}
