-- Defense in depth for the unverified contact email (0009): the app already
-- validates the format client-side, but any hand-rolled client with a token
-- could store junk. Reject anything that isn't shaped like an email.
alter table profiles add constraint profiles_email_format
  check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
