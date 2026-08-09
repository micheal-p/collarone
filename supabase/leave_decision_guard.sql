-- Leave decisions: scope to the organisation, and stop self-approval.
--
-- decide_leave_request is SECURITY DEFINER — it bypasses RLS by design so an
-- approver can write a row they do not otherwise own. It checked
-- is_leave_approver() (am I AN approver?) and never which company the request
-- belongs to, then updated by caller-supplied id. Same shape as the four HR
-- functions fixed yesterday: an approver in one tenant could approve or reject
-- a request in another, given the id.
--
-- My own definer audit passed this function, wrongly. It matches
-- `decided_by = auth.uid()` and the audit read that as "scoped to the caller"
-- — but that is an ASSIGNMENT in the SET clause, not a predicate in the WHERE.
-- test/definer_org_scope.mjs is corrected in the same commit; a guard that
-- can be fooled by a SET clause is worse than none, because it is trusted.
--
-- Second fix: nobody approves their own leave. That is the whole point of an
-- approval. The fallback matters though — in a two-person company the owner
-- may be the only approver, and a rule that leaves them permanently unable to
-- take leave gets worked around by disabling the feature. So: refused, unless
-- you are genuinely the only person who could ever decide it.

create or replace function public.decide_leave_request(_id uuid, _decision text, _comment text)
returns public.leave_requests language plpgsql security definer set search_path = public as $$
declare
  row public.leave_requests;
  v_org uuid := public.my_org_id();
  v_requester uuid;
  v_other_approvers int;
begin
  if not public.is_leave_approver() then raise exception 'Not authorised to approve leave'; end if;
  if _decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  if v_org is null then raise exception 'Request not found or already decided'; end if;

  select user_id into v_requester
    from public.leave_requests
   where id = _id and org_id = v_org and status = 'pending';
  -- Same message for "not yours" and "does not exist": otherwise this becomes
  -- a way to test whether a given id is a real request in another company.
  if v_requester is null then raise exception 'Request not found or already decided'; end if;

  if v_requester = auth.uid() then
    select count(*) into v_other_approvers
      from public.profiles p
     where p.org_id = v_org
       and p.id <> auth.uid()
       and p.status = 'active'
       and ( p.role = 'super_admin'
          or exists (select 1 from jsonb_array_elements(p.suites) s
                     where s->>'key' = 'leave' and s->>'role' = 'manager') );
    if v_other_approvers > 0 then
      raise exception 'You cannot decide your own leave request. Ask another approver to review it.';
    end if;
    -- Sole approver: allowed, but the record says so plainly.
    _comment := trim(coalesce(_comment, '') || ' (self-approved: no other approver in the organisation)');
  end if;

  update public.leave_requests
     set status = _decision, decided_by = auth.uid(), decided_at = now(),
         decision_comment = coalesce(_comment, '')
   where id = _id and org_id = v_org and status = 'pending'
   returning * into row;
  if not found then raise exception 'Request not found or already decided'; end if;
  return row;
end;
$$;
grant execute on function public.decide_leave_request(uuid, text, text) to authenticated;

-- ---- leave needs its own suite-access helper --------------------------------
-- Leave managers could not see staff without ALSO holding the HR suite, which
-- meant granting the most sensitive suite in the product to someone whose job
-- is approving days off.
create or replace function public.has_leave_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"leave"}]'::jsonb);
$$;
grant execute on function public.has_leave_suite() to authenticated;
