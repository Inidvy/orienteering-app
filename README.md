# Orienteering App

A verified orienteering platform for permanent courses: physical flags with NFC
tags + QR fallback, per-leg timing, GPS-track verification, class-based
leaderboards (M/W × U14–O60), on a real georeferenced orienteering map.

**The trust story:** a run is `verified` only when every flag was physically
punched (NFC) AND a continuous GPS track covers the legs AND the claimed times
fit inside server-anchored time bounds. Anything less is shown, visibly
unranked. Unlike MapRun (GPS-only, spoofable) or plain QR codes
(photographable), verification here is layered — and the schema is ready for
cryptographic NTAG 424 DNA tags later.

**The sport stays pure:** the run screen shows the map, the course, your
elapsed time, and a compass. No live position dot, no bearing hints —
navigation is the sport.

## Repo layout

```
packages/verification-core/   the trust rules — pure TS, imported by BOTH the
                              mobile app (live provisional statuses) and the
                              Supabase edge function (authoritative statuses)
supabase/migrations/          Postgres/PostGIS schema + RLS write-authority
supabase/functions/           sync-run + reverify edge functions (thin I/O
                              wrappers — verifyRun() in core does the judging)
apps/mobile/                  Expo app (Android + iOS)      [shell scaffolded]
apps/admin-web/               flag/course admin             [scaffold pending]
docs/                         design doc, wireframe, test plan
```

## Development

```bash
npm install
npm test         # verification-core test suite
npm run typecheck
```

## Design doc

The full reviewed design (architecture, verification rules, UI spec, copy
table, test plan, task list) lives in [`docs/design.md`](docs/design.md).
Read it before touching the trust rules.

## Status

Pre-v1. Current critical path is physical: mount test flags (NTAG 213),
secure O-map distribution rights, run the punch-friction field test.
See [`TODOS.md`](TODOS.md) and the task list in the design doc.
