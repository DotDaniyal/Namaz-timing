# MASJID-E-BILAL (مسجدِ بلال) — Prayer Timetable Web Application

Mobile-first, bilingual (English & Urdu) daily prayer timetable and mosque administration platform for **Masjid-e-Bilal**.

## Architecture Overview

- **Frontend**: React + TypeScript + Tailwind CSS v4 + Vite + `vite-plugin-pwa` (installable PWA with offline caching & Web Notifications).
- **Backend**: Express + Node.js (`server.ts`) with native SQLite persistence (`node:sqlite` stored at `data/masjid_bilal.db`).
- **Prayer Timing Engine**:
  - **Fajr, Asr, Isha**: Exact 50-date annual schedule from `Namaz Timings.pdf` with carry-forward date resolution, leap-year support, and December-to-January wrap-around.
  - **Zuhr**: Strictly fixed at **1:30 PM** year-round (unless an emergency override is explicitly activated by the administrator).
  - **Maghrib**: Automatic daily Karachi sunset via **AlAdhan API (Method 1 — University of Islamic Sciences, Karachi)** in `Asia/Karachi`, keeping astronomical sunset separate from the administrator-configurable mosque congregation offset, with SQLite cache fallback and manual override.
  - **Hijri Date**: Automatic Islamic calendar sync via AlAdhan API (`Asia/Karachi`) with `-1`, `0`, `+1` day moon-sighting adjustment and manual override support.
- **Admin Panel**: Protected by HMAC-signed `HttpOnly` session cookies and `scrypt` password hashing.

## Environment Variables

See `.env.example`:
- `ADMIN_SESSION_SECRET`: Random secret for signing admin session cookies.
- `ADMIN_INITIAL_USERNAME`: Initial administrator username seeded on first run (default: `admin`).
- `ADMIN_INITIAL_PASSWORD`: Initial administrator password seeded on first run (default: `BilalAdmin2026!` — change immediately in the Admin Panel -> Security tab).

## Running & Building

```bash
npm install
npm run dev     # Starts Express + Vite middleware on port 3000
npm run build   # Builds production frontend into dist/
npm start       # Runs production server (node server.ts) on port 3000
npm run lint    # Runs TypeScript type-checking
```
