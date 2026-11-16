import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AnnualScheduleRow, Language } from '../types/timetable';
import { COPY, MONTH_NAMES_EN, MONTH_NAMES_UR } from '../utils/i18n';
import { formatTime24To12Client } from '../utils/karachiClock';

interface AnnualScheduleModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
}

export const AnnualScheduleModal: React.FC<AnnualScheduleModalProps> = ({
  open,
  onClose,
  language,
}) => {
  const [rows, setRows] = useState<AnnualScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const t = COPY[language];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch('/api/schedule/annual')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load annual schedule');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setRows(data.rows || []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const formatChangeDate = (month: number, day: number) => {
    const mName =
      language === 'ur' ? MONTH_NAMES_UR[month - 1] : MONTH_NAMES_EN[month - 1];
    return `${String(day).padStart(2, '0')} ${mName}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#072A1E]/55 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annual-schedule-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-[#FAF8F4] border border-[#0B3B2B]/15 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 bg-[#0B3B2B] text-[#FAF8F4]">
          <h2
            id="annual-schedule-title"
            className={`text-base sm:text-lg font-semibold ${language === 'ur' ? 'font-urdu' : 'font-display tracking-wide'}`}
          >
            {t.annualScheduleTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#F5E6C4] hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className={`px-5 py-3 bg-[#F3EFE6] border-b border-[#0B3B2B]/10 text-xs sm:text-sm text-[#15241E]/80 ${
            language === 'ur' ? 'font-urdu text-right' : ''
          }`}
          dir={language === 'ur' ? 'rtl' : 'ltr'}
        >
          {t.zuhrNotice}
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3">
          {loading && (
            <div className="py-12 text-center text-sm text-[#15241E]/60">
              Loading schedule...
            </div>
          )}
          {error && (
            <div className="py-8 text-center text-sm text-red-700">{error}</div>
          )}
          {!loading && !error && (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#FAF8F4] border-b border-[#0B3B2B]/15">
                <tr className="text-xs font-semibold text-[#0B3B2B]/75">
                  <th className="py-3 px-2">{t.dateCol}</th>
                  <th className="py-3 px-2">{t.fajrCol}</th>
                  <th className="py-3 px-2">{t.asrCol}</th>
                  <th className="py-3 px-2">{t.ishaCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0B3B2B]/8 text-sm">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#F3EFE6]/60 transition-colors">
                    <td className="py-2.5 px-2 font-medium text-[#15241E] tabular-nums">
                      {formatChangeDate(row.month, row.day)}
                    </td>
                    <td className="py-2.5 px-2 font-mono-tabular text-xs sm:text-sm text-[#0B3B2B]">
                      {row.fajr ? formatTime24To12Client(row.fajr) : '—'}
                    </td>
                    <td className="py-2.5 px-2 font-mono-tabular text-xs sm:text-sm text-[#0B3B2B]">
                      {row.asr ? formatTime24To12Client(row.asr) : '—'}
                    </td>
                    <td className="py-2.5 px-2 font-mono-tabular text-xs sm:text-sm text-[#0B3B2B]">
                      {row.isha ? formatTime24To12Client(row.isha) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
