import React from 'react';
import { X } from 'lucide-react';
import type { Language } from '../types/timetable';

interface LegalModalProps {
  type: 'privacy' | 'terms' | null;
  onClose: () => void;
  language: Language;
}

export const LegalModal: React.FC<LegalModalProps> = ({ type, onClose, language }) => {
  if (!type) return null;

  const isUrdu = language === 'ur';

  const content = {
    privacy: {
      titleEn: 'Privacy Policy',
      titleUr: 'رازداری کی پالیسی',
      bodyEn: `Masjid-e-Bilal respects your privacy. This website does not collect personally identifiable information from visitors. 
      
- Timetable Preferences: Your language preference and reduced motion setting are stored locally in your browser's localStorage.
- Optional Browser Notifications: If you opt in to receive mosque announcements and timing updates, your browser push token is stored securely solely for dispatching notifications published by the mosque administration. We never share or sell subscriber data.`,
      bodyUr: `مسجدِ بلال آپ کی رازداری کا احترام کرتی ہے۔ یہ ویب سائٹ زائرین کی ذاتی نوعیت کی معلومات اکٹھی نہیں کرتی۔

- ترجیحات: آپ کی زبان کی ترجیح اور دیگر ترتیبات صرف آپ کے براؤزر کے لوکل اسٹوریج میں محفوظ ہوتی ہیں۔
- اختیاری اطلاعات: اگر آپ مسجد کے اعلانات کے لیے نوٹیفیکیشنز کو فعال کرتے ہیں، تو آپ کا ٹوکن صرف مسجد انتظامیہ کے اعلانات بھیجنے کے لیے استعمال ہوتا ہے۔ آپ کا ڈیٹا کبھی کسی کے ساتھ شیئر نہیں کیا جاتا۔`,
    },
    terms: {
      titleEn: 'Terms & Conditions',
      titleUr: 'اصضوابط اور شرائط',
      bodyEn: `Welcome to the official website of Masjid-e-Bilal. By accessing and using this website, you agree to comply with the following terms:

- Accuracy of Timings: Daily prayer timings, Jamaat schedules, and Qaza indicators are calculated using official annual mosque schedules and AlAdhan astronomical calculations for Karachi. While utmost care is taken to ensure accuracy, visitors are advised to verify time changes with mosque announcements.
- Non-Commercial Use: All content, typography, and schedules provided on this site are intended for community use and spiritual benefit.`,
      bodyUr: `مسجدِ بلال کی آفیشل ویب سائٹ پر خوش آمدید۔ اس ویب سائٹ کو استعمال کرتے ہوئے آپ درج ذیل شرائط سے اتفاق کرتے ہیں:

- اوقات کی درستگی: روزانہ کے اوقاتِ نماز، جماعت کے اوقات اور قضا کی معلومات سالانہ نقشے اور فلکیاتی حساب کتاب کے تحت فراہم کی جاتی ہیں۔ درستگی کا پورا خیال رکھا جاتا ہے، تاہم زائرین کو مشورہ دیا جاتا ہے کہ کسی بھی تبدیلی کی صورت میں مسجد کے اعلانات سے رجوع کریں۔
- غیر تجارتی استعمال: اس ویب سائٹ پر فراہم کردہ تمام مواد اور اوقاتِ نماز صرف کمیونٹی کے فائدے اور دینی مقاصد کے لیے ہیں۔`,
    },
  }[type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#093224] text-[#F7F5EE] p-6 border border-[#D4AF56]/40 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
        dir={isUrdu ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#C9A24D]/20">
          <h3
            className={`font-display text-xl font-bold text-[#E2C16B] ${
              isUrdu ? 'font-urdu' : ''
            }`}
          >
            {isUrdu ? content.titleUr : content.titleEn}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#F5E6C4] hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className={`text-sm text-[#D7E6DF] leading-relaxed whitespace-pre-line max-h-[60dvh] overflow-y-auto pr-1 ${
            isUrdu ? 'font-urdu' : ''
          }`}
        >
          {isUrdu ? content.bodyUr : content.bodyEn}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-[#D4AF56] text-[#07271C] text-sm font-semibold cursor-pointer hover:bg-[#E2C16B] transition-colors"
        >
          {isUrdu ? 'بند کریں' : 'Close'}
        </button>
      </div>
    </div>
  );
};
