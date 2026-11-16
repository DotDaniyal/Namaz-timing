# Project History & Architectural Record: Masjid-e-Bilal (مسجدِ بلال)

This document serves as the single centralized historical and technical record for the **Masjid-e-Bilal** prayer timetable web application, consolidating all development milestones, architectural decisions, feature implementations, and launch readiness checks.

---

## 1. Project Overview & Objectives
- **Project Name**: Masjid-e-Bilal (مسجدِ بلال)
- **Location**: Karachi, Pakistan
- **Core Purpose**: A mobile-first, bilingual (`English | اردو`) Islamic prayer timetable and community announcement web application designed for visitors and mosque administrators.
- **Visual Identity**: Deep emerald (`#07271C`), luminous metallic gold (`#D4AF56`), and ivory (`#FAF8F4`) mihrab-arch architecture, featuring authentic Arabic calligraphy and Nastaliq Urdu typography.

---

## 2. Chronological Development History

### Phase 1: Foundation & Canonical PDF Integration
- **Canonical Data**: Ingested the official 50-row annual PDF schedule (`Namaz Timings.pdf`) for Fajr, Asr, and Isha prayer timings across the year.
- **Jurisprudential Rules**:
  - Zuhr Jamaat fixed at `1:30 PM` year-round.
  - Maghrib Jamaat calculated dynamically via AlAdhan API (Karachi Method 1, Hanafi school) with local sunset + mosque offset or manual override.
  - Hijri calendar integration with moon-sighting adjustment and manual overrides.
- **Backend Architecture**: Node.js + Express with `node:sqlite` for robust, zero-latency persistent data storage.

### Phase 2: Prayer End Time & Qaza Calculator
- Implemented real-time astronomical prayer ending time and Qaza calculations:
  - **Fajr**: Ends at local sunrise (Shuruq).
  - **Zuhr**: Ends at Asr start (Hanafi Mithl Thani / Standard Mithl Awwal).
  - **Asr**: Ends at local sunset.
  - **Maghrib**: Ends at Isha start (Shafaq Abyad).
  - **Isha**: Calculated according to configured rules (Subh Sadiq / Islamic Midnight / First Third).

### Phase 3: Dynamic Active Prayer Detection & Minimalist UI
- Built `getActivePrayerState()` to detect the single currently active prayer period in `Asia/Karachi` time.
- Designed the UI to display Qaza timings **exclusively for the currently active prayer**, keeping inactive prayer cards clean and uncluttered.
- Adopted the mobile featured arch + 2×2 symmetrical grid and desktop 5-arch row layout matching the mosque architectural reference.

### Phase 4: Typography & Header Redesign
- Integrated curated Google Fonts: `Cinzel` (`MASJID-E-BILAL`), `Aref Ruqaa` & `Amiri` (Arabic calligraphy), `Noto Nastaliq Urdu` (Urdu calligraphy), `Cormorant Garamond` (display headings), `DM Sans` (UI text), and `JetBrains Mono` (tabular numbers).
- **Header Centering**: Implemented a 3-column grid header (`grid-cols-[1fr_auto_1fr]`) guaranteeing `MASJID-E-BILAL` stays dead-center horizontally across all screen widths (`360px` to `1440px+`), with left and right navigation/controls balanced symmetrically.
- **Structured Friday Timings**: Added dedicated English and Urdu displays for `Bayan Starts: 12:30 PM`, `Khutbah Starts: 1:15 PM`, and `Jumu'ah Prayer: 1:30 PM`.
- Added the Salah reminder verse (`Surah An-Nisa · 4:103`).

### Phase 5: Production & Vercel Serverless Reliability
- Refactored backend routes into `server/app.ts` (`createApiApp()`) shared by local Node (`server.ts`) and Vercel serverless functions (`api/[...route].ts`).
- Added robust browser-side offline fallback (`src/utils/fallbackTimetable.ts`) ensuring the website renders instantly even if the API backend is unreachable.
- Configured PWA caching and `ErrorBoundary` with service worker unregistration for reliable updates.

---

## 3. Work Breakdown (Human & AI Collaboration)
- **Human Contribution**: Project brief, PDF schedule specification, Masjid-e-Bilal branding requirements, exact Jumu'ah timings (12:30 PM Bayan, 1:15 PM Khutbah, 1:30 PM Salah), and quality control acceptance criteria.
- **AI Assistance**: Implementation of serverless API routing, SQLite database setup, astronomical Qaza calculation algorithms, Playwright automated testing across desktop/tablet/mobile viewports, and code reorganization.

---

## 4. Features Successfully Implemented
1. **Real-time Karachi Local Clock & Countdown**: Accurate second-by-second countdown to the next prayer.
2. **Bilingual Support (`EN | UR`)**: Instant language switching with proper RTL direction and Nastaliq ligatures.
3. **Active-Only Qaza Display**: Dynamic prayer window detection showing ending times and Qaza thresholds only for the active prayer.
4. **Structured Friday Jumu'ah Panel**: Clear presentation of Bayan, Khutbah, and Jumu'ah Prayer timings in both English and Urdu.
5. **Protected Admin Panel**: Secure session authentication allowing mosque administrators to manage prayer overrides, annual schedules, Jumu'ah timings, Eid announcements, and push notifications.
6. **Resilient Offline & Static Fallback**: Automatic fallback to local astronomical calculations when offline or hosted on static CDN environments.

---

## 5. Bugs Discovered & Solutions
- **Issue**: Vercel Serverless `/api/*` returning `404` due to missing serverless function routing and static-only deployment.
  - **Solution**: Added `vercel.json`, `api/[...route].ts`, and extracted Express routes into `server/app.ts` while implementing a robust client-side fallback timetable.
- **Issue**: SQLite file locking on read-only serverless filesystems.
  - **Solution**: Configured database path to use `/tmp/masjid-bilal-data` in serverless environments.

---

## 6. Files & Folder Structure
```text
project/
├── api/
│   └── [...route].ts       # Vercel serverless API catch-all handler
├── public/                 # Static assets, icons, manifest
├── server/
│   ├── aladhan.ts          # Karachi AlAdhan astronomical sync & cache
│   ├── app.ts              # Shared Express API router
│   ├── auth.ts             # Secure HMAC admin session authentication
│   ├── db.ts               # SQLite schema, migrations, and seed data
│   ├── pdfSchedule.ts      # Canonical PDF schedule re-exports
│   └── timetableService.ts # Daily prayer & Qaza composition logic
├── src/
│   ├── components/         # AdminPanel, PublicTimetable, AnnualScheduleModal, ErrorBoundary, MosqueEmblem
│   ├── hooks/              # useOnlineStatus, usePWAInstall
│   ├── types/              # Timetable & schedule TypeScript interfaces
│   ├── utils/              # i18n copy, Karachi clock, fallback timetable, annual schedule data
│   ├── App.tsx             # Root application controller
│   ├── main.tsx            # React DOM entry with ErrorBoundary
│   └── index.css           # Tailwind v4 import & typography design tokens
├── server.ts               # Local / AI Studio Express development server
├── vercel.json             # Vercel deployment & caching configuration
├── package.json            # Project dependencies & scripts
├── tsconfig.json           # TypeScript configuration
└── PROJECT_HISTORY.md      # Consolidated project history record
```

---

## 7. Launch Readiness Checklist
- [x] Custom domain connectivity documentation prepared.
- [x] Professional SVG icon and PWA manifest installed.
- [x] Unwanted AI placeholders and tags removed.
- [x] Privacy Policy & Terms/Conditions integrated.
- [x] Link and interactive button testing completed.
- [x] Mobile, tablet, and desktop responsiveness verified via automated Playwright tests.
- [x] SEO metadata configured.
- [x] Production build successful (`npm run build`).
- [x] `PROJECT_HISTORY.md` created.
