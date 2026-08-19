-- MAPL Tours — erase collected government ID numbers
-- Idempotent, safe to re-run.
--
-- The profile used to ask for a passport or driver's licence number and wrote
-- it to auth.users.raw_user_meta_data. Nothing ever read it: no booking, no
-- email, no driver handoff, no verification. Its only effect was ticking a box
-- on the profile's own checklist.
--
-- The field has been removed from the UI, which stops new numbers arriving but
-- does nothing about the ones already stored — and user metadata is embedded
-- in the JWT, so every one of those numbers is riding along inside an access
-- token in someone's browser. This deletes them.
--
-- Deliberately destructive and deliberately not reversible: an identifier that
-- no longer has a purpose should not be sitting in a token.

update auth.users
set raw_user_meta_data = raw_user_meta_data - 'identity_number'
where raw_user_meta_data ? 'identity_number';

-- Affected users get the smaller metadata on their next token refresh.
