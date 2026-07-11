# Orienteering App — project conventions

## Source of truth

`docs/design.md` is the reviewed design doc (eng + design review, 2026-07-11).
Verification rules, UI spec, copy table, and the task list live there. When
code and doc disagree, fix one of them in the same change.

## Hard constraints (do not "improve" these away)

- **Run screen is sport-pure:** no live GPS position dot, no bearing/distance
  hints. Compass toggle + manual rotation/north-lock only. GPS records
  silently for verification.
- **Trust rules exist exactly once** — in `packages/verification-core`.
  Never reimplement status logic in the app or edge function.
- **Clients never write status columns.** Raw payloads in, service-role
  verification out. RLS enforces this; keep it that way.
- **Offline-first:** every runner-facing flow must work in airplane mode from
  start flag to finish flag.
- **Statuses are re-runnable:** pure function of raw data + versioned tuning
  config. Never hand-edit a status.

## Testing

- Framework: Vitest (`npm test` at repo root runs verification-core).
- The trust surface (verification-core, sync, RLS) is test-mandatory;
  UI/admin flows are manual in v1 (design decision 5B).
- Copy strings must match the copy table in docs/design.md verbatim.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
