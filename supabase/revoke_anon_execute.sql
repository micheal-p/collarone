-- ============================================================================
-- Collarone — unauthenticated callers cannot invoke privileged functions
--
-- A SECURITY DEFINER function bypasses RLS by design. 160 of them in this
-- schema were executable by `anon`, the role PostgREST uses for a request
-- carrying no session — which means anyone on the internet holding the
-- publishable key could call them.
--
-- Being fair about the actual risk, because it matters for how this is
-- described: they were probed as the anon role and they return nothing. Every
-- one scopes internally on my_org_id()/auth.uid(), both null without a
-- session, so the queries inside match no rows. This was a MISSING LAYER, not
-- an open door, and nothing is known to have leaked.
--
-- It is still worth closing. The whole set is one forgotten `if not
-- is_manager() then raise` away from being an open door, and that check lives
-- in 160 separate function bodies. A grant is one line and cannot be
-- forgotten halfway through a function.
--
-- WHY IT HAPPENED: Postgres grants EXECUTE to PUBLIC on every new function,
-- and Supabase adds a default-privileges rule granting EXECUTE to anon and
-- authenticated for anything created in this schema. So `revoke ... from
-- public`, which looks like the careful thing to write, leaves the explicit
-- anon grant untouched. Verified on this database.
--
-- WHAT IS REVOKED, and what is deliberately left alone:
--
--   Revoked — VOLATILE, non-trigger, SECURITY DEFINER functions. These are the
--   ones that DO something: generate_payroll_run, ledger_post_entry,
--   decide_leave_request, record_stock_movement. 60 of them.
--
--   Left alone — STABLE/IMMUTABLE predicates (is_hr_manager, same_org,
--   has_payroll_suite and friends). They are referenced inside RLS policy
--   expressions, which are evaluated as the CALLING role, so revoking EXECUTE
--   would make every policy that mentions one throw for anon — taking down the
--   public storefront and the public invoice page. They also return false for
--   anon and disclose nothing, so there is no reason to touch them.
--
--   Left alone — trigger functions. EXECUTE is not consulted when a trigger
--   fires, so a grant on one is irrelevant either way.
--
--   Left alone — the public API, listed explicitly below. These exist to be
--   called without a session and are the storefront, careers and offer pages.
--
-- Written as a loop rather than 60 statements so that re-running it catches
-- any function added since. test/anon_execute.mjs fails the build if a new
-- privileged function ever becomes anon-callable.
--
-- Idempotent; safe to re-run.
-- ============================================================================

do $$
declare
  fn record;
  -- Functions an unauthenticated visitor is SUPPOSED to reach. Adding a name
  -- here is a deliberate decision that the function is safe with no session:
  -- it must validate its own token or input and must never trust an argument
  -- to identify the caller's organisation.
  public_api text[] := array[
    'public_decide_offer',            -- accept/decline a job offer from an emailed token
    'public_place_order',             -- storefront checkout
    'public_submit_application',      -- careers page application
    'public_submit_contact_message',  -- storefront contact form
    'public_submit_lead'              -- storefront lead capture
  ];
  -- Functions no browser ever calls: cron sweeps, platform administration and
  -- internal helpers invoked from inside other functions. They run under the
  -- service key from client/api/*, or as nested calls where the definer's own
  -- rights apply and no grant is consulted at all.
  --
  -- They need their own list because of a mistake worth recording. The loop
  -- below grants `authenticated` back after revoking from PUBLIC — necessary,
  -- or signed-in users lose every function at once. Applied blanket, that
  -- HANDED authenticated a set of functions it never had, platform_delete_org
  -- among them: closing an anon hole while opening a wider one for anyone with
  -- a login. test/definer_org_scope.mjs caught it before it shipped.
  server_only text[] := array[
    'advance_billing_lifecycle',   -- billing sweep, from /api/health
    'apply_confirmed_renewal',     -- Paystack callback, from /api/platform-pay
    'attendance_apply_punch',      -- wall device, from /api/punch
    'generate_recurring_invoices', -- nightly sweep, from /api/health
    'platform_delete_org',         -- platform administration, from /api/admin
    'queue_notification',          -- called from inside other functions
    'seed_ledger_accounts',        -- called from inside other functions
    'seed_org_leave_defaults',     -- called from inside other functions
    'visitors_autoclose_all',      -- watchdog sweep, from /api/watchdog
    'watchdog_autoclose_all'       -- watchdog sweep, from /api/watchdog
  ];
  revoked int := 0;
  locked  int := 0;
begin
  for fn in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef                                   -- bypasses RLS
      and p.provolatile = 'v'                           -- does something
      and p.prorettype <> 'trigger'::regtype::oid       -- not a trigger
      and not (p.proname = any(public_api))
  loop
    -- Both grants have to go. PUBLIC is Postgres's default; anon is Supabase's.
    -- Removing only one leaves the function reachable through the other.
    execute format('revoke all on function public.%I(%s) from public', fn.proname, fn.args);
    execute format('revoke all on function public.%I(%s) from anon', fn.proname, fn.args);
    -- Put back what the application actually needs, because revoking from
    -- PUBLIC would otherwise take these away from signed-in users too — but
    -- only for functions a browser calls. A cron sweep or a platform-admin
    -- action reaches the database through the service key and has no business
    -- being callable by every logged-in user.
    if fn.proname = any(server_only) then
      execute format('revoke all on function public.%I(%s) from authenticated', fn.proname, fn.args);
      locked := locked + 1;
    else
      execute format('grant execute on function public.%I(%s) to authenticated', fn.proname, fn.args);
    end if;
    execute format('grant execute on function public.%I(%s) to service_role', fn.proname, fn.args);
    revoked := revoked + 1;
  end loop;
  raise notice 'anon EXECUTE revoked on % function(s); % of them are service-role only', revoked, locked;
end $$;

-- Stop the next one being born open. Supabase's default-privileges rule is
-- what granted anon in the first place; this removes it for functions created
-- in this schema from now on. Existing grants are unaffected, which is why the
-- loop above still has to run.
alter default privileges in schema public revoke execute on functions from anon;
