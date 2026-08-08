-- Let each organisation say when its compliance tracking begins.
--
-- Two problems solved by one column.
--
-- 1. THE FORGETTING BUG. complianceApi.buildDeadlines() generated exactly two
--    periods: last month and this month. So an unmarked obligation vanished
--    the moment it turned two months old. A business that forgot April's PAYE
--    would find in June that April had quietly stopped existing — which is the
--    one thing a compliance calendar must never do, because an unremitted
--    month is precisely what you need it to keep showing you.
--
-- 2. THE COLD-START WALL OF RED. Simply generating every period instead would
--    open the module on a year of overdue rows for months the customer was not
--    even trading. Neither is acceptable, so the org states where to start.
--
-- Defaults to the month the organisation was created, which is right for
-- almost everyone and means nobody has to answer a question to get a working
-- calendar.
alter table public.org_compliance_prefs
  add column if not exists start_period text
  check (start_period is null or start_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

comment on column public.org_compliance_prefs.start_period is
  'YYYY-MM: the first period this rule is tracked from. Older periods are not generated, so a new customer does not open the module on months they were not trading.';
