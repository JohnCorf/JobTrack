# JobTrack — v1

"Open the app, complete today's job, send the summary."

A mobile-first Progressive Web App for self-employed mechanics and tradespeople to record a day's work: travel time, labour time, parts, photos, and notes — finishing in one beautifully formatted, shareable job summary.

## Run it locally

No build step — it's plain HTML/CSS/JS. From this folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

Or use any static file server (`npx serve`, VS Code Live Server, etc.).

## Deploy it

Upload the whole folder as-is to any static host (Netlify, Vercel, GitHub Pages, S3, your own server). No server-side code is required — everything runs and stores data in the browser.

## Install on a phone

- **iPhone (Safari):** open the site → Share → *Add to Home Screen*.
- **Android (Chrome):** open the site → menu (⋮) → *Install app* / *Add to Home Screen*.

Once installed it launches full-screen, works offline, and behaves like a native app.

## How it works

- **Data:** each job is saved to `localStorage` on the device when finished. An in-progress job is also saved as a draft, so closing the app mid-job resumes exactly where you left off. Nothing leaves the device in v1 — see "Version 2 ideas" below for cloud sync.
- **Offline:** a service worker (`sw.js`) caches the app shell on first load, so it keeps working with no signal — handy in a workshop or on the road.
- **Voice notes:** uses the browser's built-in Speech Recognition API (Chrome/Safari on supported devices). If unavailable, the sheet falls back to typing.
- **PDF export:** generated on-device with a bundled copy of jsPDF (`vendor/jspdf.umd.min.js`) — no network call needed.
- **Photos:** captured or picked via the native camera/photo picker and stored as part of the job record.

## File structure

```
index.html        Screen templates + app shell
styles.css         Design system (tokens, layout, components)
app.js             State machine, timers, storage, actions
manifest.json      PWA manifest (name, icons, theme)
sw.js              Service worker (offline caching)
vendor/            Bundled jsPDF for offline PDF export
icons/             App icons (192px, 512px)
```

## Extending it

The spec calls for this to stay easy to grow into v2 (customer/vehicle history, invoicing, Xero, cloud sync, etc.) without a rewrite:

- `Store` in `app.js` is the only place that touches storage — swapping `localStorage` for a cloud API later means changing one module.
- Each screen is a `<template>` in `index.html` plus a `wireX()` function in `app.js` — new screens follow the same pattern.
- The job object shape (`customer`, `vehicle`, `parts`, `photos`, …) is the natural schema for a future backend.

## What's deliberately not here (v1)

Customer database, invoicing, accounting integrations, calendar/bookings, employee management, stock control, dashboards, analytics, payments. Per the spec, every one of these is a v2+ decision — v1 stays focused on getting through today's job as fast as possible.
