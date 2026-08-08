-- Lock two functions added earlier today. Caught by test/definer_org_scope.mjs,
-- which is the audit written this morning after the HR hole — so the guard is
-- doing exactly the job it was built for, on its author.
--
-- Both are the SAME mistake, and one I had already written down: Postgres
-- grants EXECUTE to PUBLIC by default on a new function. Adding
-- `grant execute ... to service_role` does not remove that; only an explicit
-- revoke does. I granted and did not revoke.
--
-- queue_notification(org, kind, dedupe, recipient, subject, body) is the worse
-- of the two: it takes an arbitrary org and recipient and writes a row that the
-- health cron then EMAILS. Left callable by any authenticated user, it is a
-- way to send mail from Collarone's own domain, to anyone, with attacker-chosen
-- subject and body. A phishing primitive with our return address on it.
--
-- seed_org_leave_defaults(uuid) is the milder case — the same shape as
-- seed_ledger_accounts, which was fixed hours ago for the same reason.
--
-- Neither has a legitimate caller outside a trigger. Triggers are SECURITY
-- DEFINER and run as the owner, so revoking from callers does not affect them.

revoke execute on function public.queue_notification(uuid, text, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.seed_org_leave_defaults(uuid) from public, anon, authenticated;

grant execute on function public.queue_notification(uuid, text, text, uuid, text, text) to service_role;
grant execute on function public.seed_org_leave_defaults(uuid) to service_role;
