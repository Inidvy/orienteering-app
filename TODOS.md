# TODOS

Deferred work with context. Source: /plan-eng-review of the v1 design doc
(`~/.gstack/projects/OrientieeringAPP/janni-no-branch-design-20260710-235500.md`), 2026-07-11.

## 1. NTAG 424 DNA upgrade (cryptographic punches)

- **What:** Replace/augment NTAG 213 UID tags with NTAG 424 DNA; implement SDM/SUN validation (PICCData decryption + AES-CMAC, AN10922 key diversification) in the Supabase edge function; scripted APDU provisioning tool; golden-file oracle tests against Python `sdm-backend`.
- **Why:** Closes the v1 limitation that a skilled cheater can clone a 213 tag's UID; makes "verified" cryptographically unforgeable — the product's original differentiator.
- **Pros:** Schema is upgrade-ready (punch rows carry nullable `validation_payload`, decision D20-C) — no data migration, just tags + server code. Cross-runner counter-ordering (D19) also gets trustworthy counters.
- **Cons:** The project's hardest work item (budget days, not hours, on both provisioning and validation); needs a PC/SC USB reader (~€40, e.g. ACR1252U); no React Native 424 library exists — raw APDU work.
- **Context:** v1 ships NTAG 213 (decision D20-C, hybrid) because the crypto defends against an adversary that barely exists at club scale, while the mule attack (hand your phone to a friend) defeats any tag tech anyway. Key-management design (master key in Supabase secrets, UID diversification) is already written in the design doc's "Key management (post-v1)" section.
- **Depends on / blocked by:** v1 live; community big enough that clone-level cheating is plausible.

## 2. Replay viewer (Livelox-style)

- **What:** Multi-runner track replay animating over the georeferenced O-map with leg comparison. Start as a desktop web page reading the same API — not in-app.
- **Why:** Makes leaderboards feel alive ("watch how the fastest runner attacked leg 3"); half the original inspiration (Livelox/RouteGadget).
- **Pros:** All required data (PostGIS tracks, leg_splits) already lands in the right shape from v1; pure frontend work, zero schema risk.
- **Cons:** Meaningful UI/animation effort; pointless until several runners have shared courses.
- **Context:** Moved post-v1 in spec review round 1; the post-v1 success criterion ("two runners' tracks animating with leg comparison") is already written in the design doc.
- **Depends on / blocked by:** v1 live with real runs from more than one runner.

## 3. Course auto-generation

- **What:** Generate courses from the flag network under constraints: target length, leg-length spread, direction changes, no doglegs.
- **Why:** Original vision item ("create courses / autogenerate them"); turns a static flag network into endless fresh training.
- **Pros:** Verification-free feature — no trust surface; fun algorithm work; zero new infrastructure.
- **Cons:** Worthless below ~15-20 flags in one area; needs tuning before generated courses feel like real orienteering.
- **Context:** Deferred at office-hours; constraint sketch lives in the design doc's Open Questions 3.
- **Depends on / blocked by:** Enough mounted flags (trigger: ~15-20 in the area).
