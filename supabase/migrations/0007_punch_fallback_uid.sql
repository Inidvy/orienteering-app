-- QR and manual fallback punches carry no NFC chip UID; the schema predated
-- the fallback methods. The verifier (_shared/verify.ts) already treats
-- tag_uid as optional (p.tag_uid ?? undefined).
alter table punches alter column tag_uid drop not null;
