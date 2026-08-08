# Collarone — Module Professionalization Review

**Board outcome, for founder sign-off. Nothing in here is built yet.**
**Date: 6 August 2026**

---

## How to read this document

Fifteen modules were assessed by a designer and then challenged by a review board. The board's job was to check the designer's claims against the actual code, throw out anything that was enterprise theatre, and add anything a real Nigerian SME hits in week one that the designer missed. **What survived is what you're being asked to approve.**

Three phrases recur and are worth defining once:

- **Row-level permission rules (RLS)** — the database's own security layer. It decides, per row, whether the person asking is allowed to see or change it. When it's wrong, the browser can reach data the screen never shows.
- **Database function (RPC)** — a piece of logic that lives in the database and that the app calls by name. Some of these run with elevated privilege ("security definer"), which means the permission rules do *not* apply inside them. Those are the dangerous ones.
- **Demo parity** — whether `/try/<suite>` behaves the same as the paid product. Where it doesn't, prospects see errors or blank numbers on a sales surface.

Every plan item carries a rough size:

- **S** — under a day
- **M** — a few days
- **L** — a week or more

---

## 0. Verification pass — read this before acting on any security item

The board agents read the source, but they read migration files in isolation. Several
security claims were checked by hand afterwards against the *final* state of the schema
(a later migration can redefine an earlier policy, and the last definition wins). Results:

| Claim | Verdict | Detail |
|---|---|---|
| Leave suite lets one tenant read another tenant's leave requests | **FALSE — ignore it** | `leave.sql` really does have an unscoped policy, but `leave_multitenancy.sql:63` redefines `req_read` with `same_org(org_id)`. The later migration wins. This is roadmap item 1 below; it should be struck. |
| HR's four elevated functions are not organisation-scoped | **TRUE** | `hr_update_employee`, `hr_set_probation`, `hr_confirm_employee`, `hr_finalize_exit` are SECURITY DEFINER, so table policies never apply to them, and none checked the target's org. Fix written in `supabase/hr_rpc_org_scope.sql` — **committed but NOT yet applied to the live database.** |
| The automation cron endpoint is unauthenticated | **TRUE, and live right now** | `automations-run.js:298` reads `if (secret && ...)` — when `CRON_SECRET` is unset the check is skipped entirely. `CRON_SECRET` appears nowhere in `deploy/`, `.github/` or `server/`, so it is almost certainly unset in production. Anyone who knows the URL can trigger writes across every tenant. Fail-open. |
| Any employee can edit their own attendance record | **TRUE** | `attendance.sql:54` grants `for all` where `employee_id = auth.uid()`, so an employee can UPDATE their own clock-in/out directly through the API. Attendance feeds payroll hours. Organisation-scoped, so not cross-tenant. |
| Any employee can read every document in the org | **TRUE** | `storage_tenant_isolation.sql` scopes reads by organisation but not by role, so `employee-documents` and `hr-letters` are readable by any authenticated colleague — including other people's warning and query letters. Within-tenant only. |

**The lesson for future audits:** never conclude a policy is missing from one file. Grep every
migration for the policy name and read the last one.

## 1. Scoreboard

Scores are the **board's revised numbers**, not the designer's. An asterisk marks a score the board moved. Overall is a straight average. Weakest first.

| # | Module | Easy to use | Fast | Bug-free | Data safe | Works well | Help | Updates | Light | **Overall** |
|---|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Automation** | 6 | 4* | 3 | **1*** | 2* | 4 | 5 | 5 | **3.8** |
| 2 | **Buying & Procurement** | 5 | 5 | 3 | 6* | 4 | 3 | 3 | 5* | **4.3** |
| 3 | **Documents** | 4* | 6 | 4 | **3** | 5* | 3* | 4* | 6 | **4.4** |
| 4 | **Task & Report** | 6 | 5 | 3 | 4* | 5 | 5 | 4* | 4* | **4.5** |
| 5 | **Visitors** | 6 | 5 | 4* | 4* | 5 | 3 | 4 | 6 | **4.6** |
| 6 | **Inventory & Assets** | 4* | 5 | 4 | 4* | 5 | 5 | 6 | 6 | **4.9** |
| 7 | **Finance** | 5* | 6 | 3* | 5* | 4 | 5 | 6 | 6 | **5.0** |
| 8 | **HR & Staff** | 5* | 5 | 5 | **2*** | 7 | 6 | 6 | 6 | **5.3** |
| 9 | **Projects** | 5 | 5 | 4 | 6* | 4* | 6 | 6 | 6 | **5.3** |
| 10 | **Invoicing & Trade Docs** | 5* | 5 | 5 | **3*** | 7 | 4* | n/a* | 8* | **5.3** |
| 11 | **Time & Attendance** | 7 | 5 | 5* | **2*** | 5 | 7 | 6 | 6 | **5.4** |
| 12 | **CRM** | 6 | 5 | 6* | 7 | 6 | 4 | 6 | 6 | **5.8** |
| 13 | **Compliance Calendar** | 7 | 8 | 4* | 7* | 3 | 6 | 3 | 8* | **5.8** |
| 14 | **Leave Management** | 6 | 8* | 3* | 6* | 4* | 4* | 8 | 8 | **5.9** |
| 15 | **Payroll & Benefits** | 6 | 7 | 5 | 5* | 6 | 5 | n/a* | 8 | **6.0** |

**"Updates" was struck for Payroll and Trade Docs.** The board's position: how often you ship is not something a paying customer experiences, and scoring it invites you to build a changelog page instead of fixing proration. Treat it as noise wherever it appears.

**Read the "Data safe" column first.** Four modules score 3 or below, and three of those (Automation 1, HR 2, Attendance 2) are live holes that a competent person with a browser console could exploit today. Those are not backlog items.

---

## 2. Module by module

---

### 1. Automation — 3.8 (weakest)

**Board verdict.** The design thinking here is the best in the whole codebase — a fenced list of allowed actions, an event cursor, a no-loop rule, and honest "coming soon" cards that name their real dependency. The execution is a demo. On the production box **nothing schedules the sweep at all**: `server/index.js` has exactly one timer (the 30-minute watchdog) and there is no crontab or systemd timer anywhere in `deploy/` or `ops/`. Custom rules only execute when somebody happens to load the public status page. Meanwhile every database error is swallowed and reported to the customer as "found 0", so a broken query and a clean bill of health look identical on screen.

Worse, the review of this module uncovered something outside it: **the entire Leave suite is un-tenanted.** `is_leave_approver()` has no organisation check at all, so any leave manager or owner in any tenant can read every other tenant's leave requests — including the free-text reason field, which is where staff write medical detail. That is a reportable data breach and it jumped to the front of the whole roadmap.

**Top gaps**

- `https://collarone.app/api/automations-run` is an **unauthenticated endpoint that writes to every tenant** — the auth gate reads `if (secret && ...)`, and `CRON_SECRET` is never written by the deploy script, so the gate is off in production.
- Cross-tenant leak: the pending-leave check queries `leave_requests` with no organisation filter, so every org's banner counts the whole platform's pending leave.
- All six checks are **on by default** — the moment a customer is granted the suite, six automations start writing banners and tasks nobody asked for.
- The email action can never send: the code imports the Resend sender directly while the codebase has standardised on SendGrid, so it fires `Bearer undefined`, the error is swallowed, and the screen reports "ran 3× today" for zero emails.
- The rules screen tells the customer "rules run within a few minutes of the trigger." Best case today is a daily job on a fallback deployment. Realistic case is never.
- No timezone anywhere. Date maths is UTC while Nigeria is UTC+1, so daily boundaries roll over at 1am Lagos time.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | **Fix the Leave suite tenancy breach first, before anything else.** Add an organisation check inside `is_leave_approver()`, add `org_id` to leave requests/balances/types/holidays, rewrite all four permission rules to include it, and narrow holiday write so one tenant can't edit the table that drives everyone's working-day maths. | **M** |
| 2 | Close the public write endpoint: hard-require `CRON_SECRET`, generate it in `deploy.sh`, refuse to boot without it, and audit every other file the server mounts for the same `if (secret && ...)` pattern. | **S** |
| 3 | Ship every check **off by default** — a missing settings row must mean disabled, with an explicit "Turn on" and a one-line preview. Do this *before* item 4 or the day the clock becomes real you get a mass incident. | **S** |
| 4 | Give production a clock: one timer in `server/index.js` for the daily sweep, one every five minutes for rules, and **delete** the rules trigger from the public health endpoint. Set `TZ=Africa/Lagos` on the service. | **S** |
| 5 | Stop reporting failures as an all-clear: capture the error on all seven database calls, wrap each check and the per-org loop in its own try/catch, and render "Last check failed — reason" in red instead of "found 0". | **S** |
| 6 | Scope the leave query, and add one test that greps every admin query in the sweep and fails on any that lacks an organisation filter. This guards a whole category, not one line. | **S** |
| 7 | Route the email action through the single sender, and write failures to a `last_error` column instead of swallowing them. | **S** |
| 8 | Freeze AI drafting behind an off flag, and replace the real staff names/IDs sent to OpenAI with opaque tokens mapped back locally. Update `chatKnowledge.js` in the same commit. | **S** |
| 9 | Take the money out of the banner (drop the ₦ total and invoice numbers) and add a dedupe key so a standing condition raises one banner, not one a day forever — today automation noise evicts your dunning banners. | **S** |
| 10 | Tag automation-created tasks with a visible "Automated" badge and cap each check at ~20 items plus a summary task, so a 500-contact import can't bury someone's queue or look like the MD assigned 40 tasks at 2am. | **S** |
| 11 | Give a rule a pulse: `last_ran_at` and `last_error` on the row, plus a "Test run" button. Turns "why didn't my rule fire?" from unanswerable into self-serve. | **M** |
| 12 | Make rules editable, show "X of 25 rules used", and block save at the cap — today the 26th rule saves, says "is live", and is dead on arrival. | **M** |
| 13 | Fix the demo: add the four rules routes, add them to the parity test, and drop the dead tour selector. A prospect clicking "New rule" currently gets a raw developer error string. | **S** |
| 14 | Small sharp edges: resolve a fallback creator so a rule doesn't die silently when its author is deleted; clamp the config numbers; keep config fields visible-but-disabled when off. | **S** |
| 15 | Skip any org whose account is read-only or suspended — the sweep currently keeps working for people who stopped paying. | **S** |

---

### 2. Buying & Procurement — 4.3

**Board verdict.** This module built the easy half — a request form and a status column — and skipped the half that creates value: a purchase order the supplier can act on, and stock landing in Inventory when goods arrive. It also ships two **visibly dead buttons** and a demo that shows a dash where every naira figure should be.

The board's key correction: those two "big builds" are already 80% built somewhere else. `supabase/trade_documents.sql` already has per-org document numbering, a supplier link straight to this module's vendors table, a line-items array, VAT columns, and a branch that writes stock movements for a goods-received note — all rendered by a document-type-generic PDF endpoint that already knows more document types than the database allows. Adding a purchase order is a constraint change, a prefix, a map entry and a button. **Two weeks became six to eight days.**

**Top gaps**

- The demo shows **"—" in the Total column on every row**, in a suite whose entire pitch is "money is not spent without a yes". Live data computes it, so this never shows up in your own testing.
- The Edit button on a request calls a function whose result is never rendered. Clicking it does absolutely nothing, silently. Vendors have no edit path at all.
- Deletes report success when they were refused — the delete call has no `.select()`, so a blocked delete returns no error and the app flashes "Request deleted." over a row that is still there.
- The confirm dialog promises to remove an "approval history" that does not exist anywhere in the schema.
- **A manager can silently change the amount on an already-approved request** and the badge still reads "Approved", with the approver's name never displayed. The designer missed this; it's a bigger integrity hole than the VAT trap.
- The VAT field is a raw decimal defaulting to 0.075. Type 7.5 (the rate everyone knows) and you get an 850% total, with no database constraint stopping it.
- Zero indexes on a shared multi-tenant table. Zero filter, search or sort, while eighteen other suite files have all three.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | Fix the money in the demo today — compute the total on both seeded rows and in create/patch, then add procurement to the parity test and extend that test to check seeded rows carry the fields the table reads. | **S** |
| 2 | Kill every action that lies: delete or wire the dead Edit button, add `.select()` to both deletes and fail with a plain message on zero rows, gate the Delete button to manager-or-own-pending, rewrite the confirm copy, and add a shared error translator. | **S** |
| 3 | **Issue a real Purchase Order by reusing the trade-documents engine** — add `'po'` to two constraints, a prefix, one entry in the PDF metadata map, and widen document read so a procurement-only tenant can see its own PO. Send it via a WhatsApp deep link first, email second. | **M** |
| 4 | Close the loop into stock: "Mark received" creates a goods-received note through the same engine with stock linking on, which already inserts the stock movements. | **M** |
| 5 | Lock the money: constraints on VAT rate / unit cost / quantity, a real state machine in the approval function, and **block amount edits once approved**. Relabel the field "VAT %" showing 7.5. | **S** |
| 6 | Show who said yes — `approved_by`/`approved_at` already exist and are rendered nowhere. Record who decided on every transition, add a rejection reason, render "Approved by Bola, 06 Aug". Highest trust-per-hour item here. | **S** |
| 7 | Emit events so approvals reach people — copy the pattern from tasks. Today you can approve ₦1.8m and the requester finds out by re-opening the tab. | **S** |
| 8 | Give the manager "what's waiting on me": status chips defaulting to Pending, text search, sortable columns. Reuse the filter bar eighteen other files already have. | **S** |
| 9 | Four indexes, cap the fetch at 200, drop the dead department join, stop the full refetch after every action, add a double-click guard on Approve. | **S** |
| 10 | Make vendors editable, add `contact_name` to the allowed fields, and add bank name / account number / TIN or RC number — a Nigerian SME pays by transfer and withholds tax. | **S** |
| 11 | Add purchase requests to the permission probe test (vendors is covered, the table holding the approvals and the naira figures is not), and verify in production that the read-only and support-block triggers actually attached to these tables. | **S** |
| 12 | Add a "cancelled" status and a Withdraw action, so a requester whose approved order is no longer needed doesn't have to delete the record and the approval trail with it. | **S** |
| 13 | CSV export of the filtered list — what the accountant and the bank ask for monthly. | **S** |
| 14 | One-attribute mobile fix: put the right-align class on the action cell so buttons pin top-right like every other suite. | **S** |
| 15 | Write the help that is currently wrong (the generic "click any row to edit" is false here) and give the empty states a working button. | **S** |

---

### 3. Documents — 4.4

**Board verdict.** Documents is sold as a **paid add-on whose one-line pitch is "control who sees what"** — and control who sees what does not exist below the table layer. The storage rules scope files to the organisation and nothing else: **any employee, including one with no Documents grant at all, can list the organisation's folder from the browser console and download every file in it.** That includes every warning letter, query letter, confirmation letter and customer invoice. The header comment in the schema justifies this by claiming paths are "unguessable UUIDs"; the code builds them from a timestamp and the filename, and listing makes the point moot anyway.

The board also caught that the designer's proposed fix **would not have fixed it** — a privileged function that returns a *path* mints nothing while the browser still signs the URL under its own session.

Separately: the flagship Letters engine files each letter as "Restricted" and grants the employee permission — but Documents is a separately-provisioned paid suite, so **the employee usually cannot open the app at all.** HR thinks the employee has their confirmation letter. The employee has nothing.

**Top gaps**

- Bucket-wide read on `org-documents` and `hr-letters` for every authenticated employee. "Restricted" is decorative.
- The signature image used on company letterheads sits in a **world-readable, cross-tenant-writable** bucket — that is a letter-forgery and invoice-forgery path, not just a leak.
- Signatures prove nothing about content: the signature row stores no version, and uploading a new version rewrites the file in place. Sign v1, upload v2, record still says "Adaeze signed this document."
- Filed invoice PDFs default to org-wide visibility, so every Documents holder reads every customer invoice — prices, parties, totals — with no Trade Docs grant. The same file also always fails its version insert (missing a required column) and swallows the error.
- Letters say "Letter issued, filing in the background" on the line *after* a fire-and-forget call whose failure is discarded. We tell the user it worked before we know.
- The demo 404s on Signatures. A prospect clicking it gets a raw error toast.
- Expiry dates can be set and are then never displayed anywhere. Half a feature.
- The unescaped logo/signature attributes in the letterhead renderer were **written down in a previous plan and never fixed.**

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | **Close the read hole properly** — a server-side download route using the service key that re-checks the document permission and mints a 60-second link, then **drop authenticated read on both buckets entirely**. Serve an employee's own letter through the same route. Extend the storage test to assert neither bucket has any read policy for authenticated users. | **M** |
| 2 | Unbreak the prospect demo: add the signatures routes seeded with one signed and one awaiting row, honour the expiry field in the demo patch, and add them to the parity test (which currently has zero Documents rows). | **S** |
| 3 | Fix invoice filing — three lines: set visibility to restricted, add the missing organisation id to the version insert (currently violates a not-null constraint on every call and is swallowed), and write the missing first version row. | **S** |
| 4 | Stop lying about filing: await the file operation in its own try/catch, offer "Retry filing" on failure, and store the resulting document id so the register links to the filed copy. | **S** |
| 5 | **Give the employee their own letter** — a "My letters" list in HR self-service reading the letters they already have permission to read. Today HR issues a letter and the employee sees nothing at all. | **S** |
| 6 | Give letters a PDF: a "Print / Save as PDF" button rendering the existing document into a hidden frame. The print styles already exist. An SME cannot attach an `.html` file to a bank email. | **S** |
| 7 | Make letter reference numbers unique and server-issued — two HR users issuing on the same day currently both produce `HR/CONF/2026/007`, and a bank rejecting a duplicate reference reads as incompetence. | **S** |
| 8 | Bind signatures to what was signed: stamp the version on the signature, re-check it at signing time, block a new version upload on a signed document, add a guard trigger against tampering with the file path, and stop signatures cascading away when a document is deleted. | **M** |
| 9 | Make deletion real — remove the storage objects before deleting the row. The dialog promises "permanently removed"; today the bytes survive and you keep paying for them. | **S** |
| 10 | Translate errors and pre-check uploads (size before upload, progress bar, cancel). A four-minute upload on mobile data that ends in "The object exceeded the maximum allowed size" costs the customer real money. | **S** |
| 11 | Fix the phone: a mobile breakpoint for the folder sidebar (there is currently none), collapse five of the seven row buttons into a kebab, and add field labels to the card view. | **S** |
| 12 | Stop offering buttons that fail — hide Edit/Delete/Access unless manager or creator. Conversely, let any Documents holder create a folder; in a 10-person company only the owner is a manager and everyone else is dumping into an unfoldered pile. | **S** |
| 13 | Surface expiry: a column with a red pill under 14 days and amber under 60, plus a filter row. The column, the index and the sweep all already exist. This is the two-hour change that gives a Nigerian SME a reason to open the module on a Monday. | **S** |
| 14 | Escape the two unescaped attributes in the letterhead renderer and allow-list the image payload server-side. Fifteen minutes, and it has been ignored once already. | **S** |
| 15 | Cheap hygiene in one commit: cap the document fetch, one honest line under the Visibility selector explaining who can open the file, fix the tour step that points at an element this screen never renders, and log one event from the download route so "who opened the salary schedule" is answerable. | **S** |
| 16 | **Last, and cancellable:** a tokenised external share link, reusing the invoice share pattern. "Send this to my bank" is the real job — but it is worth nothing on top of a vault whose permissions are decorative. | **M** |

---

### 4. Task & Report — 4.5

**Board verdict.** Comments are **completely dead on the paid path** and work perfectly in the demo we show prospects — a routing bug where the generic `/tasks` handler swallows every nested route. Posting a comment lands in the create-task branch and returns "Title is required." Separately, **every auto-raised recurring and automation task silently vanishes** from the queue and the statistics of the manager who scheduled it, because the machine-created insert omits the department, and supervisors only see rows in their own department.

The board's headline correction: the designer priced a two-line routing fix at two engineering weeks. It's two guard clauses, a matcher reorder, one field added to two inserts, and a backfill — **under three hours.** Quoting two weeks is how a fixable module sits broken for a quarter.

The board also added the thing that actually ends a customer relationship here: **there is no record of who moved a task to Done or when.** When the manager says "you never did this" and the staff member says "I marked it done last Tuesday", the product cannot referee — which is precisely what the manager is paying for.

**Top gaps**

- Comments dead in production, working in the demo. Expanding any row also silently re-downloads the entire task table.
- Recurring and automation tasks are invisible to the manager who created them (and, when there's no assignee, to literally everyone but the owner).
- Any employee can list and download **every task attachment in the company** — contracts, schedules, letters — because storage is scoped to the organisation only.
- A Sales supervisor can read Finance's task reports and comment threads, and can update or delete a Finance task by id that they are not even allowed to see.
- An assignee can push their own deadline, downgrade their own priority, and rename the task their boss gave them.
- Staff cannot create a task at all — the permission rules allow it, the button is simply only rendered for supervisors.
- Zero useful indexes; unbounded fetch that silently truncates rather than erroring, so counts quietly go wrong.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | Unshadow the nested task routes (two guard clauses plus a reorder). Also kills the accidental full-table refetch on every row expand. | **S** |
| 2 | Stamp the department on machine-created tasks in both places, then backfill. Every recurring task a paying manager scheduled has been silently absent from their queue. | **S** |
| 3 | One migration closing the cross-department holes: add the department check to report read, comment read, task update and task delete. | **S** |
| 4 | Scope task attachments to the task rather than the organisation. The path already includes the task id; the permission rule just never used it. | **S** |
| 5 | Six indexes, and wrap the permission helper calls so they evaluate once per query rather than once per candidate row. | **S** |
| 6 | Bound the lists so counts stop lying — default to open tasks with a cap, a separate toggle for completed, and an on-screen "showing first N" when the cap is hit. | **S** |
| 7 | Notify on assignment, in the core product, not in the paid Automation suite. Staff currently learn they were given work only by opening a suite they don't open. | **S** |
| 8 | Task permalink plus WhatsApp share, so the notifications in item 7 have somewhere to land. WhatsApp is the channel this market actually reads. | **S** |
| 9 | Split assignee rights from owner rights: a trigger that stops a mere assignee changing anything but status, and Edit shown only to supervisors and the creator. | **S** |
| 10 | **Record status changes as a system entry in the comment thread** ("Ada moved this to Done"). One insert, no new table, and it gives the manager a referee. | **S** |
| 11 | Fix the Protected/unlock toggle so an unlocked supervisor isn't offered Edit on another department's task. | **S** |
| 12 | Translate errors at the boundary so no database string reaches a customer. | **S** |
| 13 | Fix department at the source: a department picker for supervisors, and server-side default from the assignee's profile — otherwise cross-department assignment keeps minting orphan rows every week. | **S** |
| 14 | Let staff create their own tasks (forced to self, own department, server-side). The permission rules already allow it; the button is the only thing missing. | **S** |
| 15 | Harden report attachments: size and type check before upload, clean up objects on a failed insert, and remove the task's storage folder on delete. | **S** |
| 16 | Deliver what the suite tile promises — a per-assignee progress table plus CSV. If this changes what we claim Tasks does, `chatKnowledge.js` lands in the same commit. | **M** |
| 17 | The two filters people actually use: an "Overdue" chip with a live count and an "Assigned to me" toggle. | **S** |
| 18 | Mobile card labels and the right-align class on the action cell. Staff here are phone-only. | **S** |
| 19 | Make the recurring sweep survivable: lift it out of the swallow-all catch, order the query so no tenant starves behind the cap, and catch up on a missed run instead of losing that week permanently. | **S** |
| 20 | One real permission test file plus eight lines extending the demo parity test to run against the live router, not just the demo one. | **M** |

---

### 5. Visitors — 4.6

**Board verdict.** Four role views and a code/QR gate pass are a genuinely smart skeleton. But **the module is architected around pre-registration, which is the 20% case.** The button literally says "Walk-in / New visit" and the form behind it demands a future arrival time, generates a code, and ends on a gate pass — there is no path where a person standing at the desk right now gets logged and marked inside in one action. For a Nigerian front desk, most traffic is unannounced. That is what makes a receptionist abandon the app in week one and go back to the paper book, and **not one of the twenty-six gaps named it.**

Second: **"host alerts" is sold in the suite description and in the demo tour, and there is not one line of code behind it.** No trigger, no notification, no email. That is a refund conversation.

Third: the sweep is unauthenticated-adjacent in the same family as Automation — an unguarded privileged function lets *any* signed-in user in the org, with no Visitors grant, flip every expected visit to no-show. And it runs on **every page load** as part of the normal code path.

**Top gaps**

- No walk-in flow, in a walk-in market.
- "Host alerts" advertised, zero implementation.
- Nobody is ever checked out — no end-of-day job, so "Currently inside" and the overstay tab rot into noise within weeks.
- The ban is decorative: no unique constraint on phone, so a walk-in creates a fresh visitor row every time. Banning row #1 leaves rows #2–#5 clean. (And a weekly contractor accumulates 40 unrelated records.)
- The access code is shown once on the success screen and is unrecoverable after that — though WhatsApp delivery does exist, which the designer under-credited.
- The check-in confirmation blanks the screen with no success message, which is exactly why guards tap it twice — and the update has no state precondition, so a double-tap overwrites the check-in time.
- The demo has **no visitors routes at all**; one toggle in Platform Control serves a prospect a completely broken sandbox.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | **Build the host alert or delete the sentence — this week, no third option.** A trigger on check-in writing an event to the notification bell plus an outbox row. The pattern already exists elsewhere; this is half a day of copying. If it hasn't landed by Friday, strip the claim from the suite description and the demo tour the same day. | **S** |
| 2 | **Ship the one-tap walk-in.** A "Visitor is here now" toggle that prefills the time, hides the date field, creates and checks in, and lands on a confirmed screen. This is the job. | **M** |
| 3 | Fix the visitor identity model — unique on organisation+phone, upsert instead of insert on walk-ins, and a trigger blocking a banned visitor. The ban is unenforceable in principle without this, and repeat-visitor history (what an estate actually buys) doesn't exist. | **M** |
| 4 | Close the three server-side authorisation holes in one migration: guard the no-show function and the stats function, split the visit-update rule so a staff member can't mark their own guest inside or set a badge number, and add a status precondition so a double-tap can't overwrite the check-in time. | **M** |
| 5 | Auto-checkout and scheduled no-show hung off the watchdog that **already runs every 30 minutes** for attendance. Without this the "currently inside" number is noise by month two. | **M** |
| 6 | Repair the gate loop: accept the refresh callback both callers already pass, show a green confirmed state with a "Next visitor" button instead of blanking the screen, and flash success. | **S** |
| 7 | Make the code retrievable — extract the gate pass into a component and open it from a "Resend pass" action on any expected or no-show visit. This also solves the "late visitor is a dead end" problem for free. | **S** |
| 8 | Stop printing a promise the backend ignores — either enforce the 24-hour code expiry or delete the line from the printed pass. | **S** |
| 9 | Speak Nigerian English, not database errors, and escape the search term so a comma in a name stops throwing a raw parser error at the desk. | **S** |
| 10 | Stop the full-page spinner on every action (it replaces the table at the busiest minute of the day), default the log to 30 days, and add five indexes. | **S** |
| 11 | Two settings, not five: configurable access points ("Gate 3") and overstay hours ("my contractors are legitimately here all day"). | **S** |
| 12 | Hardcode Lagos time in the stats function and match it on the client, so the dashboard and the desk stop disagreeing before 8am. | **S** |
| 13 | The small dead ends together: let a host cancel their own visit, block past-dated pre-registration, show a chooser on multiple phone matches, and add the Flagged tab the demo tour already sells. | **S** |
| 14 | One guard instead of two days of demo work: make Platform Control refuse to enable a demo suite with no routes, and fix the invalid seeded role. | **S** |
| 15 | Capture what a Nigerian gate writes down — ID type, ID number, plate number (the code already accepts and silently discards two of these) plus a one-line consent sentence. Plain columns, no photos, no retention job. | **S** |
| 16 | Mobile pass on the visits table — field labels and the right-align class. A guard works on a phone. | **S** |
| 17 | "Print who is inside" muster roll. Sequenced last deliberately: before item 5 lands it would list people who went home hours ago. | **S** |

---

### 6. Inventory & Assets — 4.9

**Board verdict.** Honest bones and genuinely good permission rules, wrapped around four things that must be fixed before anything else ships: **stock can go negative**, the "Adjustment" movement type **can only ever add** (so shrinkage inflates stock), **custody photos and company signature images land in a world-readable, cross-tenant-writable bucket**, and there is **no way to edit an item you typed wrong** — only delete, which cascades away the movement ledger and every custody record.

The board added two the designer missed, both of which put a wrong number in front of a human making a buying decision: **"On hand" and "Out with staff" sit side by side reading as additive when takeouts have already been deducted**, and the **low-stock alarm renders for read-only staff** who have no button to clear it (and fires for every new item, because both sides default to zero).

**Top gaps**

- Negative stock on the first ever stock-out of a fresh item. The demo clamps it at zero, so this never appears in your own testing.
- "Adjustment" adds when it should be able to subtract.
- Custody photos and trade-doc signature images in a public bucket that any authenticated user of any tenant can overwrite or delete.
- No item edit; delete destroys the audit ledger.
- Asset status badges render completely unstyled in production, because the only file injecting that CSS is a dead export nothing imports.
- Managers hold direct write on stock levels, so quantities can be changed around the ledger.
- Multi-warehouse is fully built in the database and **never shown in the UI** — "what is in the Aba warehouse" is unanswerable.
- Stock take runs one round trip per line and, on partial failure, closes the modal and destroys an hour of counting.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | Stop stock going negative and stop Adjustment lying: check on-hand before an out or transfer with a plain message, stop the negative insert, **remove "Adjustment" from the dropdown entirely** (stock take already corrects in both directions), reconcile existing negatives, add a constraint, and mirror it all in the demo. | **M** |
| 2 | Get custody photos **and trade-doc signatures** out of the public bucket into a private org-scoped one, serve via signed URLs, and sweep the existing objects across. File the wider public-bucket write problem as a Website Builder ticket. | **M** |
| 3 | Make a typo survivable: add item edit reusing the pattern the assets modal already has, and replace hard delete with archive, blocking delete outright once movements exist. | **M** |
| 4 | Drop the direct write policy on stock levels — the movement function is the only writer. | **S** |
| 5 | Fix the permanent red alarm: require a reorder level above zero, hide the banner from read-only staff, and make it click through to the filtered list. | **S** |
| 6 | Rename "On hand" to "On shelf" and "Out with staff" to "Also out with staff", plus one line defining on-shelf / available / reserved / out-with-staff. Cheapest wrong-number fix in the module. | **S** |
| 7 | Delete the dead assets export and move the badge styles into the stylesheet. One hour, visible on every asset row in production today. | **S** |
| 8 | Make asset changes atomic and same-organisation, require the return inspection before retiring an assigned asset, and fix the repair path that keeps the assignment while hiding the only Return button. | **M** |
| 9 | Four indexes on a shared table with none, and tighten the return function to manager-only so the schema stops advertising a staff self-return that always errors. | **S** |
| 10 | Stop the stock take eating an hour of counting — keep the modal open on partial failure, keep the counts, list exactly what failed, and save to local storage as typed. | **S** |
| 11 | Stop the five-way refetch: per-tab loaders, and refresh only the affected collection after a mutation. Six round trips to book one return becomes one. | **S** |
| 12 | Answer "what is in the Aba warehouse" — a warehouse selector on the Items tab and a per-warehouse breakdown, reading data already being fetched. | **M** |
| 13 | Make it findable and current: search on Items (reusing the matcher the Assets tab already imports), status chips on Bookings and Items-with-staff, a date filter on movements, and client-side expiry display on held stock. | **S** |
| 14 | Plain-English errors for the handful of messages this module actually throws. | **S** |
| 15 | **Answer "who is holding my company's property"** — a per-staff view of stock takeouts and IT assets together, with an "out longer than N days" filter. This is the reason a Nigerian SME buys this over a spreadsheet. | **M** |
| 16 | Answer "what is my stock worth" — one unit cost column, one value column, one total. Reproducible on a calculator, which is the only version an owner will trust. No moving averages, no currency. | **S** |
| 17 | One CSV export on Items. Gets the stock list onto the owner's WhatsApp, where the decision actually happens. | **S** |
| 18 | First-run checklist ("1. Add a warehouse 2. Add your items 3. Record opening stock") and mobile field labels. Counting happens on a phone in a warehouse. | **S** |
| 19 | Low stock → purchase request, gated on the Procurement suite. The only genuinely new capability here, and the one cross-suite move that makes the launcher feel like a suite. | **M** |

---

### 7. Finance — 5.0

**Board verdict.** Bank reconciliation is **the most differentiated thing anyone has built in this codebase** — importing the bank's own CSV and confirming suggested matches, with a human always in the loop, is exactly what a Lagos SME does at month end and nobody at this price does it well. It sits on top of an expense flow with no receipts and a budget report whose headline number is wrong on the default path.

The board's sharpest finding: **the budget modal defaults to "All categories"**, so the very first budget most organisations create is the broken one. It's not an edge case, it's the happy path.

And the thing the designer missed entirely: **reconciliation is a dead end.** Confirming a bank line against an approved expense changes nothing about that expense — it stays "Approved" forever, and nothing anywhere gets marked paid. A customer will reconcile forty lines, go back to Expenses, see nothing changed, and conclude the feature is decorative.

**Top gaps**

- Budget report matches an org-wide budget against uncategorised spend only, so the org reports itself massively under budget.
- "Owed to you" and "Overdue" count part-paid invoices at full value; there is no way to record how much came in.
- Two UTC date bugs, one of which makes the Overdue tile a day behind between midnight and 1am Lagos time.
- No receipt upload — despite the bucket, the org-scoped policies and the column all existing end to end.
- A mis-imported bank statement can never be undone. No delete route exists anywhere, and the only recovery is clicking "Ignore" on each duplicate forever.
- Date parsing handles two formats; the ones Nigerian banks actually export are silently dropped, and parenthesis-negatives are read as credits.
- A manager can hard-delete an approved or **paid** expense straight through the permission rules.
- Re-running `finance.sql` re-creates the permissive storage policy that was explicitly dropped to close the cross-tenant receipts hole.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | Kill the demo 404 on the flagship feature — add the bank-lines and match-candidates routes seeded with fourteen believable Lagos lines, and add both to the required list in the parity test. | **S** |
| 2 | Fix the budget report maths, key the rows properly, and either render monthly budgets or remove the Month field until they work. Add a uniqueness constraint. | **S** |
| 3 | Sync the product story — the suite description, the demo tour and `chatKnowledge.js` never mention bank reconciliation. All three in the same commit. | **S** |
| 4 | Ship receipt upload. Everything but the file input already exists. Converts approvals from a toy into something you can show an auditor. | **M** |
| 5 | Make the bank import honest: a five-row preview before insert, an explicit list of skipped lines with their raw values, four more date formats plus a day-first/month-first toggle, parenthesis-negatives and signed debit columns, and chunking so the toast count equals what actually landed. | **M** |
| 6 | Make imports reversible: a uniqueness key with "N lines already imported, skipped", a delete-by-batch route, and an Imports list with Undo. | **M** |
| 7 | **Close the reconciliation loop** — when a line matches an approved expense, offer "Also mark this expense paid" (checked by default); when it matches an invoice payment, link back. And say "already matched to the 14 Jul line" instead of the suggestion silently vanishing. | **S** |
| 8 | Make the recon table usable past the first import: default to "Unexplained only", a bank label filter, raise the cap with an honest note, sort unexplained above matched. | **S** |
| 9 | Week-one expense fixes: seed eight Nigerian-typical categories, move "Add category" into the expense modal, add a **VAT-inclusive toggle** (every Nigerian receipt is gross), turn the raw 0.075 into a select, disable buttons in flight, and stop reloading the whole tab after every decision. | **M** |
| 10 | Fix the mobile recon layout — three right-aligned cells currently stack in the same 8px corner on a phone — and add field labels. | **S** |
| 11 | Harden the controls without the theatre: block deleting a paid expense, record who rejected and who marked paid, forward-only transitions, a rejection reason shown to the submitter, plus amount and VAT constraints. **No self-approval block** — in a six-person Lagos SME the finance manager buys the diesel. | **S** |
| 12 | Export before any new screen: expenses CSV honouring filters, reconciliation CSV with the matched note. | **S** |
| 13 | Close the storage footgun: mark the superseded policy block, and extend the storage test to fail on any file creating a bucket policy without an organisation scope. Log the fifteen-file duplication as a separate repo-wide ticket. | **S** |
| 14 | Memoise the matcher — one hour. | **S** |
| 15 | VAT/WHT period summary plus a read-only compliance strip at the top of Finance, linking the VAT deadline into that summary. Finance never writes to compliance tables. | **M** |
| 16 | **Strategy: stop using the word "ERP" in the Finance pitch.** Market it as "money out, reconciled, tax-ready" and let Trade Docs own money in. | **S** |

---

### 8. HR & Staff — 5.3

**Board verdict.** This is Collarone's most differentiated module — Employee 360, a genuinely Nigerian letters engine, a fair-hearing discipline flow — and it contains **the single finding on the page that could end the business rather than embarrass it.** Four elevated database functions check only "is this person an HR manager" with no organisation check at all, then update profiles directly by id. One of them disables the account. **An HR manager in tenant A holding a profile id from tenant B can rewrite that person's job title, set their probation, confirm them, and lock them out of their own company's system.** Every other HR table got an organisation check in a previous pass; these four were missed. That is a 2 on data safety, not a 5.

The board also flagged that three of the designer's fifteen plan items **re-specify code that already exists** — a bulk CSV importer, a CSV writer, and a daily job that already drains the notification queue. That collapses "build a CSV importer" into an afternoon and promotes expiry reminders from a mid-list item to a near-free trust win.

**Top gaps**

- Four elevated functions with no organisation check, one of which disables accounts across tenants.
- Every non-manager HR user receives every colleague's home address, date of birth, emergency contacts and phone in the raw response — the screen shows none of it, but it's in the payload.
- Employee 360 fires ten parallel requests, six of which download whole-organisation tables and filter in the browser. Past the row cap the arrays truncate silently, so "Leave days used" and "Hours clocked" render **confidently wrong numbers** an HR manager will repeat to an employee.
- The public demo 404s on roughly fifteen HR write routes — new starters, exits, cases, goals, documents, editing employment all throw error toasts at prospects.
- The company owner is excluded from the staff query, so the org chart is rootless, headcount is wrong, and the attrition denominator is undercounted.
- No way to add an employee from inside HR at all; a brand-new organisation lands on the bare string "No staff found."
- Four forms save on blur with no confirmation and no revert, so users believe failed saves succeeded.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | **Organisation-scope the four elevated functions.** New idempotent migration; for the exit-finalise one, re-check the organisation again before the account-disable line, since that second update targets a different row than the one authorised. Add a support-session block to all four (this is also the live mitigation for the still-inert support auth hook). Four cross-tenant probes in the test. **Nothing else ships before this does.** | **M** |
| 2 | Restore HR in the public demo — write matchers for all fifteen routes, noting that five existing branches ignore the HTTP method entirely and must be split, not extended. Seed so a prospect can walk probation → confirmation and an exit end to end. One required test row per route. | **M** |
| 3 | Stop shipping colleague personal data to base-role users: an explicit column list and a directory projection, backed by a view so the narrowing is enforced by the database and not by client politeness. Move the birthdays card behind manager. **Don't build a /personal endpoint yet** — no screen needs it. | **M** |
| 4 | Fix Employee 360's silently-wrong numbers with server-side filters and limits. Frame this as correctness, not speed. | **M** |
| 5 | **Release the seat when an exit is finalised.** The exit already disables the account but nothing tells billing. On a per-seat product, invoicing for three people you offboarded in month one costs you the customer's trust in every invoice after that. Surface "Seats billed: N (2 released this month)". | **M** |
| 6 | Put the owner back in the directory — one deletion, six numbers corrected. First verify no platform-admin row rides in on that query. | **S** |
| 7 | Build the front door, don't build an importer: "Add employee" reusing the existing hire path, and "Import staff" linking to the bulk import modal that already exists. **First check whether a non-owner HR manager is actually authorised on those admin calls** — if not, that authorisation is the real fix. Replace the bare "No staff found." with a real empty state. | **M** |
| 8 | Turn on the reminders using the 9am job that already drains the notification queue: document expiry and certificate expiry at 30 and 7 days, probation overdue on the day it passes. Cheapest trust win in the module. | **S** |
| 9 | Directory CSV reusing the existing writer, with a "Payroll-ready" column driven by the completeness data already computed. Plus the issued-letters register. | **S** |
| 10 | Stop lying about saves (four blur handlers get a success flash and a revert-on-failure) and stop showing database strings. Four edits, no shared hook. | **S** |
| 11 | Whitelist the letterhead images. Three lines; insider-only severity, so it doesn't gate a release, but do it in the same commit as something else. | **S** |
| 12 | Surface the compliance calendar as a read-only strip rather than relocating it, and **settle its price today** — bundle it free with Payroll. See section 4. | **M** |
| 13 | Give the compliance calendar an overdue backlog so a missed PAYE remittance stops vanishing from the screen. | **S** |
| 14 | Minimum chain of custody on disciplinary cases — two columns and one rendered line ("Outcome recorded by Amaka Obi, 12 Aug 2026"). Twenty minutes; the full audit table waits for the first customer who asks. | **S** |
| 15 | One shared date/expiry helper file replacing five drifted copies, carrying one real bug fix (an already-expired certificate is currently also flagged "expiring soon"). | **S** |
| 16 | Two targeted mobile fixes, not a rework: a scroll hint on the ten-tab bar so tabs 6–10 are discoverable, and move the letterhead preview above the textarea on phones so the feature that sells the module is on screen. | **S** |

---

### 9. Projects — 5.3

**Board verdict.** A world-class database layer bolted to a front end that **cannot edit a task**. The board verified it line by line: the board's Edit button opens the subtasks tree, the real edit modal is only reachable from a legacy code path that no real project ever takes (because four columns are seeded on every project), and the tree has no title, assignee, priority or due-date field anywhere. Once a task is created, it can never be corrected from anywhere in the UI. **The sales demo takes the identical branch**, so this is losing deals as well as customers.

Every delete route reports success when it was refused. And the time-to-invoice path can **bill a customer twice** or leave half a team's hours unbilled with no error.

The board's correction on price: this is **five working days**, not two to three weeks.

**Top gaps**

- No live path edits a task.
- All seven delete routes report success on a refused delete, then the reload puts the row straight back.
- "Draft invoice" creates the trade document first, then marks time invoiced with a call that returns no error on zero rows — so a project lead who isn't a projects manager creates a real invoice while the team's hours stay unbilled and roll into the next one. Two simultaneous clicks produce two invoices for the same hours.
- Deleting a project **cascades away time entries already stamped with an invoice id.** The confirm dialog mentions only milestones and tasks.
- Every write reloads the world behind a boot spinner, which also destroys the List tab's filters and page position.
- The rate field defaults to empty, so billable hours logged at zero rate leave "Draft invoice" permanently greyed out with no explanation.
- Comments are fully built in the database, the API, the facade and the demo layer — and no screen reaches them.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | **Restore task editing** — two distinct actions on the card ("Edit" and "Subtasks & blockers"), the same Edit on list rows and the tree header, plus status and milestone fields in the modal. Verify in demo mode too. | **S** |
| 2 | **Make the money path atomic** — one database function that stamps the invoice reference in a single transaction, returns the count actually stamped, refuses already-invoiced ids and unauthorised callers, and voids the just-created document when the counts don't match. | **M** |
| 3 | Fix the ₦0-rate dead end: a project default rate, prefilled, and a visible line replacing the silently-disabled button ("These hours have no rate yet"). | **S** |
| 4 | Add `.select()` and a plain refusal message to all seven delete routes, and route every catch through the friendly error mapper that already exists inside one component. | **S** |
| 5 | Protect billing history: refuse to delete a project with invoiced time, and name what's at stake in the confirm ("46 logged hours, 12 already on invoice INV-0031"). | **S** |
| 6 | Kill reload-the-world — split the loader so task changes refresh tasks only. One change fixes the spinner flash and the destroyed filters. | **S** |
| 7 | Show only the buttons that will work — compute "can manage" once from data already fetched and pass it to the five places that currently default to true. | **S** |
| 8 | Fix the mobile Time table, where hours, rate and delete are all absolutely positioned into the same corner on a phone. | **S** |
| 9 | Make creation reachable — "Add task" on every tab, not only the board, and a real call to action inside an empty column. | **S** |
| 10 | Delete the dead comments facade and note that task discussion lives in Team Chat. Keep the table and function in the database; they cost nothing there. | **S** |
| 11 | Two regression tests only, covering the two bugs this module has already shipped and fixed once: the blocked-task guard and the status-rename slug freeze. | **S** |
| 12 | Hide closed projects by default behind a "Show closed" toggle, plus a cap on the fetch. No search, no sort, no paginator until a customer has enough projects to want them. | **S** |

---

### 10. Invoicing & Trade Docs — 5.3

**Board verdict.** Unusually thoughtful document design sitting on a money ledger that can be tampered with, double-credited, and silently lose payments. Three verified holes: **the bank account printed on every invoice can be rewritten by any read-only clerk** (a permission gate was quietly downgraded in a later migration), **card verification is not bound to the invoice** (any successful payment reference on the merchant's account can be credited to any invoice), and there is **no webhook**, so a customer who closes the tab pays real money into the merchant's bank while the invoice sits unpaid forever.

The board's corrections: the designer wanted to build a credit function that already exists and is already correct, and two elevated functions where Postgres column privileges are two lines. It also caught three things the designer missed that a paying customer hits in week one — the staff ledger **hard-rejects overpayment** (so a ₦50 bank charge can't be recorded and staff start falsifying figures), there is **no supplier TIN** (so B2B accounts departments bounce the invoice), and there's no way to chase one customer today without the paid Automation suite.

**Top gaps**

- Bank account on the invoice writable by any suite holder. Straight payment-redirection path.
- Card verify takes any reference and credits it, with a read-then-write on top that can double-credit.
- No webhook. Money arrives, invoice reads unpaid.
- The document table's update rule is column-unrestricted, so amount paid, total, document number and share token are all writable from the browser console.
- Filed invoice PDFs are readable by every Documents holder with no Trade Docs grant.
- One of five options in the primary status dropdown throws an error 100% of the time; manually marking Paid leaves the amount at zero, so the document still prints "Amount due" and still stamps OVERDUE.
- **No edit path at all** across seven document types. A typo'd customer name costs a sequential number.
- The overdue reminder skips part-paid invoices entirely and quotes the full total rather than the balance.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | **Stop losing card payments** — a webhook branch that credits on the payment provider's own server-side event, plus a pending row written at initiation so there is something to reconcile against. | **M** |
| 2 | Bind verify to the invoice (reference match, metadata match, pending row must exist) and **reuse the correct atomic credit function that already exists** instead of the hand-rolled read-then-write. ~25 lines, kills both the cross-invoice credit and the double-credit race. | **S** |
| 3 | Re-lock the bank account: restore the manager-only gate that was downgraded, plus one test assertion that a viewer cannot change the account number. One line of SQL between a clerk and every customer's transfer. | **S** |
| 4 | **Handle real Nigerian payment amounts** — allow overpayment, store the excess, show "Overpaid by ₦X" instead of refusing the entry. Today a ₦50 bank charge means staff falsify the figure. | **S** |
| 5 | Withholding tax: a rate column, a "Less WHT" line on screen, in the PDF and on the public page, plus the settlement rule and a test case. Without it every B2B invoice carries a phantom balance clearable only by faking a payment. | **M** |
| 6 | Validate the account number as ten digits and block Send on the first invoice with an empty account, behind a one-click prompt. The most likely week-one failure is an invoice with a blank "how to pay" block. | **S** |
| 7 | Tell the owner money arrived. Today the only way to learn a customer paid is to open the app and look — so you chase someone who already paid. | **S** |
| 8 | "I've paid — check again" button on the public page, plus re-verify on load. ~20 lines, directly recovers payments the webhook somehow misses. | **S** |
| 9 | Close the blanket update hole with **column privileges, not new functions** — two lines. | **S** |
| 10 | Fix the status control in one pass: add the missing value so the dropdown stops throwing, and remove Paid and Part-paid from the manual selector entirely (the ledger owns those). Confirm on Sent→Draft that the shared link will stop working. | **S** |
| 11 | **Ship Edit** — manager-gated, blocked once payment exists, recomputing totals server-side and keeping the document number. Every competitor has this. | **M** |
| 12 | Reverse a payment via a compensating ledger row. A mis-keyed ₦500,000 is currently permanent. | **S** |
| 13 | Show the payment history — the function exists and is called from nowhere. Render it as a drawer with the reverse action inline. | **S** |
| 14 | Stop the "Money owed" header lying — compute the total with one server-side aggregate instead of summing a capped array, and say "showing most recent 300" when the cap is hit. | **S** |
| 15 | Two ledger-adjacent bugs: include part-paid in the overdue reminder and quote the balance, and key the customer statement off the contact id (already on the row, unused) so "Acme Ltd" and "Acme Ltd." stop producing two statements. | **S** |
| 16 | Set filed invoice PDFs to restricted. **One word.** | **S** |
| 17 | Offer "Issue receipt" straight after a payment is recorded, pre-filled. The Nigerian customer always asks for the receipt. | **S** |
| 18 | "Chase on WhatsApp" per overdue invoice, pre-filled with the document number, balance and link. | **S** |
| 19 | Mobile field labels — a row currently collapses to two bare naira figures with nothing saying which is which. | **S** |
| 20 | One client-side search box over document number and customer name, plus "Duplicate". Ten lines each; between them they cover most of what the cut pagination project was going to buy. | **S** |
| 21 | Restore the sales demo — quotations currently number `DOC-0001`, and the demo settings handler drops the bank details entirely, so the most convincing block in the module is invisible in the sandbox. | **S** |
| 22 | Add a TIN field to the letterhead and a VAT-exempt marker on line items. Two fields; without the TIN, B2B accounts departments reject the invoice. | **S** |
| 23 | Default the due date to +14 days, reject negative quantities and prices, and give the list a real failure state (a load error currently reads as "you have no invoices"). | **S** |

---

### 11. Time & Attendance — 5.4

**Board verdict.** Craft-level UI and a genuinely differentiated universal punch lane — the clock-in-on-arrival design, the wall-device support, and the never-store-biometrics stance are ahead of SeamlessHR and Bento at this price, and they're why this module sells. All of it sits on a table whose permission rule grants **every employee full insert, update and delete on their own payroll rows.** The anonymous key ships in the browser bundle and the app talks to that table directly, so this is live, not theoretical — and it silently voids the geofence work, the one-open-shift rule and the lateness stamping all at once. That is a 2 on data safety.

The board rejected roughly half the prescription as an enterprise programme (a field-level audit trail, a sites table, period locking, a correction-request queue) and added three things a fifty-person customer hits in week one that the designer missed: **a manager cannot create a missing shift at all** (which makes the proposed correction queue a workflow with no primitive under it), **mapping fifty PINs is fifty separate form submissions** with the owner unable to map himself, and a failed import chunk throws away the counts from the chunks that succeeded.

It also corrected the designer twice in the product's favour: the unflagged 24-hour shift is narrow, while the **wall-device swallowed day** is the real bug; and the row cap eats your *history*, not your current week — which is quieter and therefore worse.

**Top gaps**

- Any employee can insert, edit or delete their own attendance records from the browser console.
- The wall device, on a stale open shift, closes it and returns without opening today's — so the person is absent all day and paid for a fictional 24-hour shift.
- The "Late" pill is computed from a hardcoded 9am in the browser while the database stamps lateness correctly against each person's shift. An org that sets 08:00 sees a manager board that contradicts the column payroll would read.
- Both reads are unbounded and newest-first, so at ~1,100 records a month the previous-week arrow silently returns empty and nobody notices for a fortnight.
- CSV import: no quoted fields, no byte-order-mark strip (which turns the first PIN into an unmapped value), and offset-less timestamps land an hour early because the server reads them as UTC.
- The product tour claims hours "flow into a payroll run". They don't — payroll never reads attendance.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | **Close the self-write hole.** Read for managers-or-self; update and delete for managers only; **no client insert at all** (every legitimate write already goes through elevated functions). Tighten the PIN map read to managers. Ship a test running as a real employee asserting insert, update and delete all fail. Nothing else matters until this ships. | **M** |
| 2 | Stop the wall device swallowing a whole day — close the stale shift *and* open the new one in the same call, plus a hardcoded 60-second debounce so a double-tap doesn't cost someone their day's hours. | **S** |
| 3 | Delete the hardcoded 9am and drive the Late pill and KPI from the columns the database already stamps correctly. Fix the KPI label and delete the "this will become an org setting" footnote — the setting exists. | **S** |
| 4 | Window every read (date range on records, 60 days plus "Load older" on the employee view). | **S** |
| 5 | **"Add a shift" for managers** — this primitive doesn't exist today, so a field worker whose phone died has no row to pencil and no path to being paid. The most-used button in the module's first month. | **M** |
| 6 | Stop claiming the payroll wire — change the tour copy and the empty state to "export for your payroll run", then widen the CSV to eleven columns and add a monthly range (Nigerian payroll runs monthly). | **S** |
| 7 | Make the CSV importer correct and survivable: proper quoted fields, strip the byte-order mark, read offset-less timestamps as Lagos time, per-chunk error containment, a longer server timeout, smaller chunks, and one bulk PIN lookup instead of one per punch. | **M** |
| 8 | **Build the absence board** — join today's expected roster against actual clock-ins, minus approved leave, into On shift / Late / Not arrived. At 9:15 the one question a manager asks is "who hasn't shown up", and the current screen can only list people who did. This turns a log into a workforce tool. | **M** |
| 9 | Two columns and one line of text: "Edited by Ada Obi, 6 Aug 14:20" in the edit modal. That settles a disputed deduction at fifty staff, not a field-level audit trail. | **S** |
| 10 | Hang the forgot-to-clock-out sweep and the late/absent digest off the **9:30 job that already runs**. No new scheduler. This is what stops the manager hand-correcting fifty people at month end. | **S** |
| 11 | Bulk PIN mapping by paste-a-list or CSV, and include the owner in the staff list so he can map himself. Today it's fifty form submissions before the first device punch applies. | **S** |
| 12 | Map database errors to human sentences with the person's PIN included, and stop an unparseable request body throwing an uncaught 500. | **S** |
| 13 | Stop the "Connected" light lying — only update last-seen when a punch actually applied. | **S** |
| 14 | Field labels on the employee's own phone screen. It's currently an unlabelled stack of numbers, and the phone is the only screen most of these people will ever open. | **S** |
| 15 | Make the geofence wait honest: cap it at five minutes with "Still 400m away from Ikate Office", drop high-accuracy after the first fix to save battery, and warn before navigating away — today it's cancelled silently and the staff member walks off believing they clocked in. | **S** |
| 16 | Show the clock-out location (captured and never displayed, so clocking out from home looks identical to clocking out at site) and add a per-person geofence exemption for genuinely mobile roles. | **S** |

---

### 12. CRM — 5.8

**Board verdict.** The Nigerian instincts are right — WhatsApp-first, "Money owed", inbox as the landing tab — but it reads as four unlinked mini-apps behind a seven-tab bar, with a **permanently disabled "Coming soon" button sitting on the default screen**, three headline numbers that are wrong, and a module whose entire pitch is WhatsApp-first where **the contact row cannot start a WhatsApp chat.** The empty state literally promises contacts are "reachable by phone, email or WhatsApp from their row" and all three render as dead grey text. Bookings does it correctly twelve hundred lines away.

The board rejected the designer's claimed security hole (the cross-organisation write is properly closed — the check clause is present on all five tables), reframed the performance complaint as **the customer's data bundle rather than our latency** (the messages tab downloads every activity the org ever logged, with three joined tables, to render a website-enquiry inbox), and cut the three-to-four-week estimate to a costed four-to-five day pass.

**Top gaps**

- No WhatsApp, phone or email link anywhere in Contacts.
- No WhatsApp chase button on Money owed — the single most valuable action in a Nigerian receivables list.
- Part-paid debts count at full value in both headline numbers; there's no way to record how much came in.
- Two UTC date bugs (activity times logged an hour early; the Overdue tile a day behind between midnight and 1am).
- Deleting a company **permanently destroys every logged call and inbound website message** against it, behind a dialog that says history is "affected".
- Two silent error swallows render "No activity logged yet." when the fetch merely failed.
- Contact search doesn't match phone numbers — the way Nigerians actually look people up.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | Fix the debtor book's arithmetic — an amount-paid column, a "Record payment" input, and the local-date fix, with a test against a fixture containing outstanding, part-paid and settled rows. | **S** |
| 2 | **Put the chase button on the money** — WhatsApp per row with a prefilled reminder, stamping "chased 2 days ago" so two staff don't chase the same debtor twice in one morning. The most valuable button in the module, and it doesn't exist. | **S** |
| 3 | Make a typo'd amount survivable and preventable: wire the already-built edit and delete, and echo the amount in words under the field using the helper already proven in Trade Docs. | **S** |
| 4 | Close the loop from a won deal to money — one button offering "Record ₦X as money owed". Without it the pipeline is a diary. | **S** |
| 5 | Delete the "Coming soon" button for a working `mailto:`, and stop marking a message "Replied" merely because the WhatsApp link was clicked. | **S** |
| 6 | Split the pipeline total into "Open pipeline" and "Won this month" and label both. Two correctly-named sums, no forecasting. | **S** |
| 7 | One-line timezone fix using the helper that already sits sixty lines above. | **S** |
| 8 | Make Contacts do what its own empty state promises — WhatsApp, call and email buttons, logging the outbound touch. Copy the code from Bookings. | **S** |
| 9 | Find people the way Nigerians look people up: search phone, WhatsApp and email, store a normalised digits column so `0801…` and `+234801…` match, and warn on save when the number already exists. Kills duplicates at the source instead of building a merge tool later. | **M** |
| 10 | Cut the customer's data bill: limit/offset/search on six routes, filter website messages server-side, drop the whole-activity-history call from the Deals mount, and default Bookings to today onward so the row cap can't hide future appointments. | **M** |
| 11 | Stop presenting failure as emptiness — an inline "Couldn't load activity — Retry". | **S** |
| 12 | Make company delete non-destructive (unlink activities instead of destroying them) and state exact counts in the confirm. | **S** |
| 13 | One narrow permission change: restrict delete to admins. Everything else about the current rules is correct for an SME — a junior rep should still read the debtor book, just not wipe it. | **S** |
| 14 | Join the three notions of "customer" at the cheap end: a contact picker on Bookings and Money owed (both routes already accept it), surfacing deals, next booking and balance inside the **existing** expand panel. No new page. Roughly a day, and it's what turns four mini-apps into one CRM. | **M** |
| 15 | Mobile field labels — a contact card is currently six unlabelled lines with two identical-looking phone numbers stacked on each other. | **S** |
| 16 | The two tests that would have caught this review's real findings: receivables status/paid transitions, and demo parity for bookings and receivables. | **S** |
| 17 | A "Today" strip (follow-ups due, today's bookings, overdue receivables) plus count badges. In-app only. A reminder set from Contacts is currently invisible unless you happen to open Deals. | **M** |
| 18 | CSV export for Contacts, Companies and Money owed. Answers "can I get my data out?" in a procurement conversation, takes an afternoon. Import stays a founder-assisted onboarding task. | **S** |
| 19 | Won/lost reason: one column, one select, one count on the board header. | **S** |
| 20 | Activity log: exclude website messages by default and add the paginator every other tab already has. No filter panel. | **S** |
| 21 | Convert the two bare-div empty states, and put a "Connect your website form" link with the embed snippet into the Messages empty state — the default landing tab should tell a new tenant how to make it fill up. | **S** |
| 22 | Soft double-booking warning using the duration already captured and used for nothing. Ten lines, and it's the one thing a salon or clinic notices in week one. | **S** |

---

### 13. Compliance Calendar — 5.8

**Board verdict.** Clean, honest, 269 lines that does not currently earn its slot: **no reminders of any kind**, no amounts, and a bug that **silently forgets any deadline you miss for more than one month.** Meanwhile Payroll already ships a free remittance panel that computes PAYE by state, pension, NHF and NSITF in naira with statutory due dates and a CSV export — strictly better on five of the nine rules.

The board rejected the designer's headline fix (de-pricing it) as architecturally impossible as written: both permission gates read the suite grant, so removing the grant denies everyone and the manager role has no home. It also corrected the money — there is no per-suite price, only a marginal-suite price past an included count, so the typical HR+Payroll customer gets Compliance in a **free third slot** and nobody is paying ₦8,000 for it today.

And it added the week-one killer nobody flagged: **the cold-start wall of red.** All nine rules default on, the deadline builder always emits last month, and overdue renders in red. A perfectly compliant three-person company that signs up on the 15th opens the suite and is accused of six missed filings for periods that predate their account.

**Top gaps**

- Zero reminders, while the tagline says "never missed" and the demo tour promises "so you never get a penalty".
- Misses vanish after one month; an unfiled prior-year return disappears on 1 January.
- New customers are greeted with six red overdue chips for periods before they existed.
- Any suite holder can permanently assert "PAYE filed, ref 0012345" on the company record, but only a manager can undo it — and Undo silently does nothing for everyone else while flashing "Mark removed."
- The regulator URLs are seeded in the database for eight of nine rules and rendered nowhere in the app.
- The rule set is drifting: it still names the old federal body, models pension as calendar day 7 when Payroll correctly uses seven working days from the pay date, and collapses two separate annual filings into one row.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | **Today, 20 minutes: stop promising what the code doesn't do.** Rewrite the suite description and the demo tour to drop the penalty-protection claim. This is the only real legal exposure in the module. | **S** |
| 2 | Fix the forgetting bug — every unmarked period since the organisation was created (capped at 24 months), with older ones collapsed into "Older, still open (N)". | **S** |
| 3 | **Fix the cold-start wall of red** — ask "which of these apply to you?" and "start tracking from when?" on first open, and add a per-rule "Not applicable" that is distinct from switching the rule off. | **M** |
| 4 | Fix the write asymmetry and the silent Undo: manager-only Undo button, `.select()` on the delete with a real refusal, tighten insert to managers, and a format constraint on the period. | **S** |
| 5 | **One daily digest** — extend the existing daily sweep with a compliance pass, one banner per org per day, computed in Lagos time, addressed to managers with a fallback to the org admin. Plus the overdue count as a badge on the launcher tile. | **M** |
| 6 | Show the money on the payroll-owned rows by joining the period's payroll run to the existing remittance summary, plus a "no payroll run recorded" state (itself a compliance signal). **Do not auto-mark, and do not compute VAT.** | **M** |
| 7 | Get the nine rules signed off by a Nigerian tax practitioner and reseed — regulator name, the development levy, splitting the two annual PAYE filings, and pension as working days from the pay date. One practitioner day, and it's what makes the curated rule set an asset rather than a hazard. | **M** |
| 8 | Add governance columns (last reviewed, source, penalty note) and surface them, including the "Read the rule" links already seeded and never rendered. Columns only — no admin editor. | **S** |
| 9 | Label annual periods by the year filed **for**, not the calendar year of filing. History is the whole point and it currently mislabels. | **S** |
| 10 | Mobile and clock hygiene: a phone breakpoint for the cards (there are no media queries at all), the table wrapper, and refresh the date on tab focus. | **S** |
| 11 | Patch local state instead of a full reload after every action (nine settings toggles currently fire nine full refetches), and cache the organisation lookup. | **S** |
| 12 | Rename HR's existing "Compliance" tab to "Records & cases". Two tabs with the same name guarantees support tickets; ten minutes. | **S** |
| 13 | Accountant handoff: a filing-record CSV, a year and rule filter, and the cap raised. "Everything we filed in 2026, in one file" is the moment your customer's accountant sees Collarone. | **S** |
| 14 | **Decide the pricing from evidence, not from the assessment** — run one query first. See section 4. | **S** |

---

### 14. Leave Management — 5.9

**Board verdict.** Architecturally the most disciplined suite in the codebase — writes only through database functions, real organisation scoping, a permission probe in CI — and it is **completely blank for every new customer.** Leave types were seeded once by a migration; the only trigger on new organisations covers payroll. So a customer signed after that migration opens Leave to an empty balance grid, an empty type dropdown, and an "Unknown leave type" error they cannot fix, because creating a type is owner-only. The designer flagged the empty grid as a polish nitpick and never asked *why* it would be empty.

Two more that cost money: **holiday dates are globally unique across all tenants**, so on 1 January 2027 the first tenant to add New Year's Day takes the lock and every other tenant on the platform gets "A holiday already exists on that date" for a row they cannot see. And the working-day calculator reads the holidays table **with no organisation filter**, so another tenant's company holiday silently shortens your employees' leave deductions — and that number is what gets written to the request and drives every balance the customer sees.

The board added what a real Nigerian SME hits in week one: **HR cannot file leave on behalf of staff** who have no laptop or company email (the cleaner, the driver, half the factory floor), the approver decides blind without seeing the applicant's remaining balance, and deactivating a leave type makes an employee's approved history vanish from their own screen.

**One hard condition:** the self-approval block must ship *in the same commit* as an owner fallback, or a five-person shop where the founder is the only approver and also takes leave is permanently deadlocked.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | **Seed leave types for every new organisation** — a trigger mirroring the payroll one, plus a backfill for every org created since. Without this the suite is a blank screen for every customer you sign. | **M** |
| 2 | Add a leave-suite permission helper and grant it profile read, so a leave-only manager stops seeing blank names, no departments, no conflict warnings and the literal string "undefined's request will be rejected." One migration. | **M** |
| 3 | Fix the holiday tenancy pair — drop the global unique, add an organisation-scoped one, and filter the working-day calculator by organisation. Defuses the dated 1 January 2027 platform-wide failure. | **M** |
| 4 | **Block self-approval WITH the owner fallback, same commit**, plus a message naming the fix when an org has only one approver. | **S** |
| 5 | Mobile approvals — the chat knowledge sells "approve leave from a phone" and today that's a seven-column horizontal scroll. Stacked cards, and restore the colleague-away chips and legend the current CSS deletes rather than hiding. | **M** |
| 6 | Render the decision. The reject dialog says "Reason (shared with the employee)" and the employee's screen never shows it. Cheapest deletion of a lie in the module. | **S** |
| 7 | Email on submit and on decision, through the existing outbox and sender. Also shrinks the stale-cancel bug by getting requests decided before they start. | **M** |
| 8 | Kill the off-by-one — the preview builds local midnight then keys the holiday set in UTC, so Independence Day never matches and 30 September is wrongly excluded. Plus one test running a dozen ranges through both the browser helper and the database function. | **M** |
| 9 | Make the calendar navigable — pressing back from January currently jumps to December of the same year, and no other year is reachable from anywhere in the suite. | **S** |
| 10 | Add the missing organisation filter to the pending-leave automation, which currently announces the platform-wide count in each tenant's banner. One line. | **S** |
| 11 | Apply the future-date guard to pending as well as approved, so Cancel stops appearing on requests the server will refuse. | **S** |
| 12 | **HR files leave on behalf of an employee**, approver-only, stamping the real submitter. Non-negotiable for any customer with staff who don't have a company laptop. | **M** |
| 13 | Fail visibly: surface the swallowed override error, replace two silent catches with a retry strip (a failure currently disables every conflict warning silently), reload absences after a decision, and clear the cached profile on identity change. | **S** |
| 14 | Guardrails in the submit function with friendly messages — overlap rejection, a hardcoded 14-day back-date limit, and a minimum on the date input. Skip the gender rule; that column is being deleted. | **S** |
| 15 | Stop silent truncation on the approvals list, and change the HR employee record to fetch one person's requests server-side instead of downloading the whole org's leave history. | **S** |
| 16 | Seed the 2027 Nigerian public holidays including Eid and Maulud, marked provisional. No 2028, no monitoring alarm. | **S** |
| 17 | Show the approver the applicant's remaining balance — the function already exists, and it's the first question every approver asks. | **S** |
| 18 | Keep inactive leave types visible in the balance grid where an employee has history against them, greyed with "no longer offered". | **S** |
| 19 | One golden test file locking the arithmetic — half-days, holiday-straddling ranges, year boundaries, carry-over, adjustments. This module's entire value is arithmetic and it has one permission assertion. | **M** |
| 20 | Finish the type editor honestly (tracked, paid, carry-over cap with plain-English help) and **drop the gender and document-threshold columns** so the schema stops advertising features nobody is building. | **S** |
| 21 | Year-end rollover by mid-November — one button, one confirm, no preview table. Without it a 50-person org faces 300 manual form submissions on 1 January. | **M** |
| 22 | Year-end artefacts: a leave register CSV and a balances tab. | **S** |
| 23 | Guidance and empty states: route the apply modal through the shared modal, an "Apply for leave" call to action, a "how is this calculated?" popover, one help article. No coach tour. | **S** |
| 24 | **Log, don't start:** unpaid leave doesn't reach Payroll as a deduction even though the two are sold as one bundle. Real gap, real money — but it's Payroll-side work and belongs in the next Payroll cycle. | — |

---

### 15. Payroll & Benefits — 6.0 (strongest)

**Board verdict.** The 2026 Tax Act engine and the permission model are genuinely better than what Zoho and Odoo do for Nigeria. But the suite only survives a month where **nobody joins, leaves, gets a bonus, or gets paid the wrong amount.** There is no proration — a staffer who joined on the 25th gets a full month; a leaver still marked active gets paid in full; a contractor is taxed and pension-deducted like a full employee; and an employee with no salary structure is **silently skipped with no error anywhere.** A person not getting paid and nothing saying so is the single worst failure mode payroll software has.

Separately, a disbursed run is **fully mutable and deletable through the API** with no status check, and loan repayments cascade on delete — so one authenticated manager request permanently destroys a paid month *and* inflates every affected loan balance back up.

The board caught four of the designer's claims that don't survive contact with the code (the golden test *is* in CI, the payslip already filters zero-value overtime rows, editing a salary structure explicitly does *not* regenerate the contract, and two of three "permanent spinners" recover on remount) — and one of those errors sent the designer's only "cut" recommendation chasing a bug that doesn't exist. It also found four things the designer missed, including that **reopening a released run doesn't clear the release flag**, so every employee watches their net pay change in real time on their own payslip screen while the manager edits.

**Final plan**

| # | Item | Size |
|---|------|:---:|
| 1 | **Proration and who actually gets paid** — exclude contractors, add an exit date, compute days worked, add a holds table so a suspended staffer can be excluded without deleting their salary history, and **return the list of people skipped for a missing salary structure** so the run says "Ada Obi and 2 others were not paid — no salary on file". Four money bugs, one function. | **L** |
| 2 | **Make money impossible to lose** — triggers refusing delete past draft, refusing any change but payment status once disbursed, refusing reopen from disbursed; change loan repayments to restrict on delete; a non-negative constraint on net; and cap the loan take at the employee's actual net. | **M** |
| 3 | Fix the loan ledger desync — split system-owned from manual deductions and recompute net including the dormant attendance columns so they can never silently vanish when that phase lands. | **M** |
| 4 | **Stop reopen from leaking** — clear the release flag and reset line payment statuses in the same patch. Today the whole company watches their net pay change while the manager edits. | **S** |
| 5 | Freeze the engine against a re-run: a version row the generator checks, plus a runbook naming the eight payroll files in order with "never re-run these two" in bold. Re-running the rates file today silently reverts a tenant to the repealed relief formula with zero signal. **Renumbering all 134 files is cut** — the guard is what stops the wrong tax filing. | **M** |
| 6 | One-off earnings (bonus, arrears, commission, reimbursement) and a supplementary run. Today the only path to a Christmas bonus is adding a salary structure and reverting it, which files two fake employment contracts into Documents and grants the employee access to both. | **M** |
| 7 | **Rewrite the golden test to drive the real function** — seed a fixture org, call the generator, assert the resulting lines row by row including a prorated joiner, an excluded contractor, a bonus and a would-be-negative net. It's already wired into CI; only the assertions need replacing. **Items 1–6 ship behind this test or they don't ship.** | **M** |
| 8 | **"How this was computed" breakdown** on every line and every payslip — gross → rent relief → pension → NHF → taxable → the band table → ÷12 → proration. Biggest help gap, the only way a customer can verify the tax moat, and the strongest thing to put on a sales call. Highest value per hour in the plan. | **M** |
| 9 | Audit on the existing event spine — rate, band, salary, run and line changes with before/after. No new table, no new permission rules, and it lands in the activity feed other suites already read. | **S** |
| 10 | Harden the rate editor (explicit save, old → new confirm, required reason, "affects N employees") and **make the tax bands read-only** — they change by Act of the National Assembly, so ship band changes as a migration rather than building a validator. | **S** |
| 11 | **The payslip must not lie** — render the pension and NHF percentages from the settings instead of the hardcoded "8%" and "2.5%" strings, on a document staff hand to banks and embassies. Plus a year-to-date column and an annual PAYE summary CSV, as the proportionate substitute for a cumulative-tax rewrite. | **M** |
| 12 | Escape the contract HTML (a live script-execution path on the storage origin), guard the CSV writers against spreadsheet formula injection, and validate account numbers with a bank-code dropdown. | **S** |
| 13 | **Two remittance schedules, not four** — a per-employee PAYE schedule per state (the format the state portal actually rejects you for) and a pension schedule joining the RSA PINs the remittance note already promises and never delivers. | **M** |
| 14 | Recovery, not spinners: an error state with Retry on the one genuinely stuck screen, a staleness banner with Recalculate, replace the browser prompt on the payment-failure note with the dialog used two functions above, "Re-export failed lines only", and make the "no bank account" callout a link. | **S** |
| 15 | Fix the demo and the member view — two literal lines in the demo file, and hide the runs tab from non-managers entirely (which also deletes the misleading org-total figures and the empty state they can't action). | **S** |
| 16 | Mobile, narrowly: field labels on the run-lines and employees tables only, and stack the expand panel below 640px. Two tables, not every table. | **S** |
| 17 | Four indexes, ten minutes. The generator does two of these lookups per employee inside a loop and none are indexed. | **S** |
| 18 | **Benefits: one field, then freeze.** An employee monthly contribution wired into the payroll run as a named deduction. Nothing else. That's the one thing that makes it load-bearing rather than a contact list. | **S** |

---

## 3. Cross-cutting themes — fix once, platform-wide

These appeared in three or more modules. **They are the highest-leverage items in this whole document**, because each fix pays out across the product rather than in one suite.

---

### A. Elevated database functions with no organisation check

**Where:** HR (four functions, one of which disables accounts across tenants), Leave (the approver check has no organisation predicate at all — a live cross-tenant data breach), Visitors (two unguarded functions callable by anyone signed in), Attendance (the table-level rule undoes every function-level guard), Inventory (the blocked-tasks equivalent), Projects.

**The pattern:** a function is marked "runs with elevated privilege", checks *what role you have* but never *which company you're in*, then updates or reads by id. The row-level rules don't apply inside these functions — that's the whole point of them — so they are the only place a tenant boundary can silently disappear.

**Fix once:** audit every elevated function in `supabase/` for an organisation predicate. Add one test that lists them all and fails on any that lacks one. This is a half-day of grep and a permanent guard against the most expensive class of bug you have.

---

### B. Deletes and updates that report success when they were refused

**Where:** Projects (all seven routes), Procurement (both), Compliance, Trade Docs (mark-invoiced), Documents.

**The pattern:** `.delete().eq('id', ...)` with no `.select()`. When the permission rules filter the row out, the database returns *no error and zero rows*, so the app flashes "Deleted." and the reload puts the row straight back. In the Trade Docs case it's worse than cosmetic: an invoice gets created while the hours it was built from stay unbilled.

**Fix once:** add `.select()` and a plain refusal message to every delete and every conditional update in `supabaseApi.js`. Grep for `.delete().eq(` and `.update(` without `.select(`. Half a day, and it removes an entire category of "your software lied to me".

---

### C. Raw database error strings shown to customers

**Where:** all fifteen modules, without exception.

**The pattern:** every catch is `flash(e.message, true)`. Customers see `new row violates row-level security policy for table "goals"` and `JSON object requested, multiple (or no) rows returned`.

**Fix once:** one shared `errorText.js` mapping the handful of strings this product actually produces — permission denied, object too large, duplicate key, storage not found, session expired, network failure — with a generic fallback and the raw string kept in the console. Route every catch through it. One day, fifteen modules.

---

### D. Unbounded fetches that truncate silently instead of erroring

**Where:** HR, Leave, Attendance, CRM, Trade Docs, Tasks, Documents, Inventory, Finance, Projects, Visitors.

**The pattern:** a query with no limit. Past the API's row cap it returns the first (or newest) 1,000 rows with no error. In Attendance and Leave that means history quietly disappears; in Finance and Tasks it means totals become wrong. **Wrong-but-fast is a trust failure, not a speed failure** — and nobody notices for weeks.

**Fix once:** a standing rule that every list query carries an explicit limit, and every screen that hits the limit says so on screen ("showing the most recent 500"). Do **not** build server-side pagination — the board cut that in five separate modules as premature at Nigerian SME row counts.

---

### E. The demo diverges from the real product on sales surfaces

**Where:** HR (15 routes 404), Payroll (broken employees tab), Finance (the flagship feature throws a raw developer string), Documents (signatures 404), Automation (the newest feature 404s), Visitors (no routes at all), Procurement (every naira figure shows "—"), Trade Docs (quotations numbered wrong, bank details dropped), Tasks (comments work in the demo and are dead in production — the exact inverse).

**The pattern:** `demo.js` and `supabaseApi.js` drift, and `test/demo_route_parity.mjs` only checks fifteen route *names*, not shapes and not method coverage.

**Fix once:** extend the parity test to (a) run its needle list against the live router too, (b) assert nested routes are matched before generic ones in both files, and (c) assert seeded rows carry the fields the UI actually reads. Then backfill the missing routes module by module. **This is prospect-facing. Every hour it sits, someone is clicking it.**

---

### F. Storage buckets scoped to the organisation and nothing else

**Where:** Documents (`org-documents`, `hr-letters`), Tasks (`task-attachments`), Inventory + Trade Docs (`site-assets`, which is *public* and cross-tenant writable).

**The pattern:** the read policy checks only that the first path segment is your organisation id. Any employee — including one with no grant on the suite that owns the file — can list the folder from the browser console and download everything in it. The schema comments justify this with "paths are unguessable", which listing makes irrelevant.

**Fix once:** a single server-side download route using the service key that re-checks the per-document or per-task permission and mints a short-lived link, then **drop authenticated read on the private buckets entirely.** One route, four modules, and it's the difference between "Restricted" meaning something and being decoration.

---

### G. Mobile tables become unlabelled stacks of values

**Where:** every module. Below 640px the shared rule hides the header row and turns rows into cards, and **no suite in the codebase sets field labels.** A contact card reads as six anonymous lines; a payroll row as seven bare naira figures; an attendance row as a stack of numbers with nothing saying which is the clock-in.

**Fix once:** one CSS rule rendering a `data-label` attribute before each cell, plus the attributes added module by module. The board deliberately scoped this **per-module, not as a platform sweep** — a blanket pass across every table touches cascade ordering in every suite at once and risks a visual regression on the flagship module. Do the two or three tables per suite that people actually use on a phone.

---

### H. Timezone: UTC where Lagos was meant

**Where:** CRM (two bugs), Leave (the working-day preview is off by one day), Attendance (imported punches land an hour early; day groupings shift), Automation (daily boundaries roll at 1am), Compliance, Visitors (the dashboard and the front desk disagree before 8am).

**The pattern:** `new Date().toISOString().slice(0,10)` for a date, or local midnight keyed against a UTC string. Nigeria is UTC+1, so everything is wrong for one hour a day, and date-only comparisons are wrong for a whole day at the boundary.

**Fix once:** `TZ=Africa/Lagos` on the server process, one shared local-date helper on the client, and a lint rule or grep gate on `.toISOString().slice(0, 10)`. Half a day.

---

### I. Nothing notifies, despite the plumbing already existing

**Where:** HR (document and probation expiry), Leave (submit and decision), Tasks (assignment), Procurement (approval), Visitors (host alert — *advertised* and unbuilt), Attendance (forgot to clock out), Documents (signature requests), Compliance (every deadline).

**The pattern:** the event table, the outbox table, the notification bell and a **daily job that already runs and already drains the outbox** all exist. Individual modules just never write to them. In three cases the notification is sold in the suite description or the demo tour.

**Fix once:** the marginal cost of each of these is one query appended to a job that already runs at 9:00 or 9:30. Do them in one sitting across modules rather than one per sprint. **The cheapest trust win in this entire document.**

---

### J. Half-built columns that are seeded, sold, and enforced nowhere

**Where:** Leave (gender, document threshold — six columns seeded and sold in chat copy, enforced in zero places), Attendance (overtime and lateness printed on payslips that always read zero), Documents (expiry set and never displayed), Visitors (code expiry computed and never checked; regulator links seeded and never rendered), Procurement (department joined on every query and never populated), Inventory (warehouse active flag never read), Projects (an entire comments feature built through the database, API, facade and demo with no screen).

**The pattern:** the maintenance cost of a feature with none of the value, plus a promise the product doesn't keep.

**Fix once, as a policy:** for each one, either finish the wire or **delete the column.** The board deleted more than it finished here, and that was the right call every time.

---

### K. Migration files that undo each other when re-run

**Where:** Finance re-creates a permissive storage policy that a later file explicitly dropped to close a cross-tenant hole; Payroll's rate files revert the whole tax engine to the repealed formula; **fifteen separate files** each redefine the same suite-scope function with their own hardcoded suite list, so re-running any one of them strips grants from every tenant.

**Fix once:** the board explicitly **cut** renumbering all 134 files and building a migration runner as a two-week yak-shave. What survives is a one-page runbook naming the order-dependent files with "never re-run these" in bold, plus a version guard inside the payroll generator. 90% of the protection for 5% of the work.

---

## 4. The compliance calendar — a decision for you

Two boards looked at this from different angles and reached recommendations you need to reconcile. Here is the combined call, stated so you can accept or reject it.

**Recommended decision, in four parts:**

**1. Do NOT move the compliance calendar inside HR.** *(HR board, unanimous.)*
The nine rules split across two owners: PAYE, pension, NHF, NSITF and annual PAYE are payroll-driven; VAT, WHT, CIT and CAC returns are finance and company-secretarial. Neither suite owns the whole thing. If the calendar lives inside HR, the only way your accountant or company secretary sees a VAT deadline is to hold the **HR suite** — which today hands them the full staff directory, every colleague's personal data, and employee documents. **You would be granting the external accountant your most sensitive suite to show them a checklist.** Keep it standalone.

**2. Surface it, don't duplicate it.** Ship one shared read-only "Upcoming statutory deadlines" strip: payroll rules on HR/Payroll next to the existing statutory meter, tax and company rules on Finance. Same engine, two embedded surfaces, no duplicated code, and the standalone suite stays the system of record and the only place with settings and undo. Roughly two days.

**3. Fix the honesty and the forgetting before touching the price.** In order: rewrite the "never missed / no penalty" copy today (20 minutes, and it's the only real legal exposure), fix the bug that deletes missed deadlines from the screen after one month, stop accusing brand-new compliant customers of six missed filings, and ship one daily digest with a launcher badge. Then join the naira figures Payroll already computes onto the payroll-owned rows.

**4. On price — the two boards disagreed, and the compliance board is right.** The HR board recommended bundling it free with Payroll and removing the extra suite fee immediately. The compliance board checked the billing code and found there is **no per-suite price** — only a marginal-suite price past an included count of three (Startup) or five (Standard). The typical customer buying HR + Payroll sits at two suites, so **Compliance is already occupying a free third slot and nobody is paying ₦8,000 for it today.** It also found that the obvious cheap fixes both break things: de-pricing it by moving it out of the priced list detonates every permission rule in the module (both gates read the suite grant), and making it a "companion" of Payroll would **silently raise every payroll customer's bill at renewal**, because renewal counts distinct grants.

> **So: defer the pricing change. Run one query first — how many organisations actually hold a compliance grant, and how many of those are past their included suite count.** If it's under five (near-certain), the pricing question is hypothetical and costs nothing to leave alone. Re-open it only after the honesty fixes and the daily digest have shipped, and only with real refusal or churn data.

**What you're rejecting if you say no:** if you'd rather fold it into HR anyway, you accept that your customers' external accountants get the HR suite, and with it every employee's home address, date of birth and salary-adjacent records. That is the whole of the argument.

---

## 5. Master roadmap — the 15 highest-leverage items

Ordered **revenue protection first, then trust, then delight.** Everything above the line in each band should be done before anything below it.

### Band 1 — Revenue protection (things that can end the business or lose the customer)

| # | What it is | Modules touched | Size | What breaks if skipped |
|---|-----------|-----------------|:---:|------------------------|
| **1** | **Fix the Leave suite tenancy breach.** The approver check has no organisation predicate, so any leave manager or owner in any tenant reads every other tenant's leave requests — including the free-text reason field where staff write medical detail — plus balances, types and the shared holiday table. Straight from the browser, with Automation uninstalled. | Leave, Automation, HR | **M** | A reportable data breach under NDPA involving health information across paying customers. This is not a product gap; it is the one item on this page with a regulator attached. |
| **2** | **Organisation-scope HR's four elevated functions.** They check "is this an HR manager" and never "which company", then update profiles by id — including one that sets the account to disabled. | HR | **M** | An HR manager in one tenant can lock a person out of a different customer's company. You have already shipped one cross-tenant storage leak, so this reads as a pattern, not a one-off. Do not sign another enterprise contract until this migration is live. |
| **3** | **Close the public automation endpoint and turn the checks off by default.** The cron gate reads `if (secret && ...)` and the secret is never written by the deploy script, so the endpoint is an unauthenticated service-role write path into every tenant. Separately, all six checks default to on. | Automation | **S** | Anyone on the internet can create tasks, post banners and expire stock reservations in every organisation on the platform, and spend your OpenAI budget. And the day you fix the scheduler, six unasked-for automations start writing into every customer's workspace at once. |
| **4** | **Close the attendance self-write hole.** The table grants every employee full insert, update and delete on their own attendance rows, and the anonymous key ships in the browser bundle. | Attendance, Payroll | **M** | Any staff member can clock themselves in from home, erase a late arrival, or fabricate a 12-hour shift — and it silently voids the geofence work, the one-open-shift rule and the lateness stamping you already paid for. Attendance is payroll input. |
| **5** | **One server-side download route for private files, then drop bucket-wide read.** Documents, HR letters and task attachments are readable by any employee who can open a browser console; company signature images sit in a public, cross-tenant-writable bucket. | Documents, HR, Tasks, Trade Docs, Inventory | **M** | Every warning letter, query letter, salary schedule and customer invoice in the company is readable by the newest intern — in a suite you charge extra for on the promise of "control who sees what". The signature image makes it a forgery path, not just a leak. |
| **6** | **Make disbursed payroll runs immutable and add proration.** A paid run is deletable through the API with no status check, loan repayments cascade away with it, and the generator pays everyone a full month regardless of joining date, leaving date, contract status or whether they even have a salary on file. | Payroll | **L** | One manager request destroys a paid month *and* inflates every affected loan balance. And in a normal month a joiner is overpaid by thousands, a leaver is paid in full, and someone with no salary structure is silently not paid at all with no error anywhere. |
| **7** | **Bind card payments to the invoice, add the webhook, and re-lock the letterhead bank account.** Any successful payment reference on the merchant's account can be credited to any invoice; a closed browser tab loses the payment permanently; and a permission gate downgraded in a later migration lets any read-only clerk rewrite the account number printed on every invoice. | Trade Docs | **M** | Customers pay and the invoice reads unpaid forever. One payment gets credited to two obligations. And a clerk can redirect every customer transfer to their own account. |
| **8** | **Stop stock going negative and stop "Adjustment" only adding.** No on-hand check before an outward movement, and the one movement type meant to correct a count downward can only increase it. | Inventory | **M** | The stock figures the owner buys against are wrong in both directions, permanently, and shrinkage inflates rather than reduces stock. The demo clamps at zero, so this never appears in your own testing. |

### Band 2 — Trust (things a demanding customer discovers in week one)

| # | What it is | Modules touched | Size | What breaks if skipped |
|---|-----------|-----------------|:---:|------------------------|
| **9** | **Demo parity sweep on every sales surface.** HR 404s on fifteen write routes; Finance's flagship reconciliation returns a raw developer error; Procurement shows "—" for every naira figure; Visitors has no routes at all; Tasks' comments work in the demo and are dead in production. | HR, Finance, Procurement, Visitors, Documents, Automation, Payroll, Trade Docs | **M** | Every prospect who clicks past the first screen sees a broken product. This is losing deals *right now*, on the features you most want to show. |
| **10** | **Seed leave types on organisation creation.** Only payroll gets a seeding trigger; leave types were seeded once by a migration and never again. | Leave | **M** | Every customer you sign opens Leave to an empty balance grid, an empty dropdown and an "Unknown leave type" error they cannot fix, because creating a type is owner-only. The first screen a customer opens is blank. |
| **11** | **Kill the silent-write-failure pattern, everywhere.** Add `.select()` and a real refusal to every delete and conditional update; ship one shared error translator so no database string ever reaches a customer. | Projects, Procurement, Compliance, Documents, Trade Docs, and all 15 for the error map | **M** | Users are told things were deleted, saved and marked paid when nothing happened — the fastest possible way to lose confidence in a system of record. And when something does fail they read `new row violates row-level security policy`. |
| **12** | **Turn on the notifications, using the jobs that already run.** Assignment, leave submitted and decided, document and certificate expiry, probation overdue, purchase approved, visitor arrived, forgot to clock out, compliance deadline due. | Tasks, Leave, HR, Documents, Procurement, Visitors, Attendance, Compliance | **M** | Staff learn they were given work by opening a suite they don't open; expired staff IDs and missed probation decisions go unnoticed — the exact failures this software is bought to prevent. "Host alerts" is currently *sold in the product description with zero code behind it.* |
| **13** | **Bound every list and stop silent truncation.** Explicit limits, sensible default date windows, and an on-screen "showing the most recent N" when the cap is hit. | HR, Leave, Attendance, CRM, Trade Docs, Tasks, Documents, Inventory, Finance | **M** | Employee 360 quotes an HR manager a leave figure that is confidently wrong. Attendance history disappears from month two and nobody notices for a fortnight. The Money-owed total silently understates the debtor book. |

### Band 3 — Delight (what turns "it works" into "I'd recommend it")

| # | What it is | Modules touched | Size | What breaks if skipped |
|---|-----------|-----------------|:---:|------------------------|
| **14** | **Make the four flagship features do the thing they promise.** Contacts can't start a WhatsApp chat in a WhatsApp-first CRM; Projects can't edit a task; Trade Docs can't edit an invoice; Procurement can't issue a purchase order. Each is a few days, and three of the four reuse code that already exists elsewhere in the repo. | CRM, Projects, Trade Docs, Procurement | **M** | These are the sentences in your own marketing that the product does not honour. A demanding customer finds all four in the first hour, and each one individually reads as "unfinished", which is worse than "missing". |
| **15** | **Payroll's "How this was computed" breakdown.** Gross → rent relief → pension → NHF → taxable → the band-by-band table → ÷12 → proration, on every payroll line and every payslip. | Payroll | **M** | This is simultaneously the biggest help gap in the product, the only way a customer can verify the tax engine you're differentiating on, and the strongest single artefact to put on a sales call. Without it, the moat is invisible to the person paying for it. |

---

## 6. NOT RECOMMENDED — what the board threw out, and why

Your standing rule is "don't build for building's sake". The board applied it hard. **Roughly a third of the original fifteen plans was cut.** Here is what, and the reasoning, so you can overrule anything you disagree with.

### Cut because the code already exists

| Cut | Why |
|-----|-----|
| Build a CSV importer for HR staff | `BulkImportModal`, the CSV parser and the bulk-create route all already ship in Admin → Users. The real gap is a doorway from HR — an afternoon, not a multi-day build. |
| Build a CSV writer for HR exports | `downloadCsv` already exists in the attendance module. Second call site, not a new writer. |
| Build a daily job for expiry reminders | The 9:00 job already claims and drains the notification queue. The marginal cost is one appended query. |
| Build an atomic credit function for invoice payments | `record_trade_doc_payment` already exists, is already atomic, and already validates. The card path hand-rolled a worse version instead of calling it. |
| Build a purchase-order document engine | The trade-documents engine already has numbering, supplier links, line items, VAT and a goods-received branch that writes stock movements. |
| Build a scheduler for visitor auto-checkout | The 30-minute watchdog already auto-closes forgotten attendance shifts. Same shape, same job. |
| Build a comments UI for Projects | Team Chat already ships. The board's call: **delete the dead facade**, don't build a second collaboration surface. |
| Rewrite the payroll golden test into CI | It's already in CI. Only the assertions are wrong. |

### Cut as premature at Nigerian SME scale

- **Server-side pagination**, in six modules (HR directory, Leave approvals, Tasks, Documents, Trade Docs, Inventory). Your buyers are 10–200 staff. Filtering a 200-row array in memory is instant and lets the manager search any field with no round trip — *better* UX than paginated server search. Replaced everywhere by an explicit limit plus an honest on-screen note.
- **Virtualisation and memoisation** (Leave calendar, Inventory items, Payroll tables). A 42-cell filter over thirty absences is microseconds. Postgres will not notice these row counts for two years.
- **Speculative indexes** on tables holding ~1,500 rows a year. *(The indexes that survived are on genuinely shared multi-tenant tables with none at all — those are 30 seconds each and stayed.)*
- **Distributed locks and atomic counters** in Automation. They only exist to work around a public endpoint that is about to be deleted.
- **Keyset pagination** over a rules table that will hold under 200 rows this year.

### Cut as enterprise theatre

- **Field-level audit tables** — HR disciplinary cases, Attendance record edits, Payroll. Replaced by two columns and one rendered line ("Outcome recorded by Amaka Obi, 12 Aug"). Nobody at a thirty-person company is auditing your audit trail; build the full log the first time a customer's lawyer asks.
- **Soft delete, trash, retention policies and undo stacks** — Documents, CRM, Inventory. Replaced by: refuse to delete what has a signature or an invoice attached, and tell the truth in the confirm dialog.
- **Approval thresholds, second approvers and self-approval blocks** — Procurement, Finance. In a six-person Lagos SME the finance manager *is* the person who buys the diesel and *is* the only approver. Ship this and the first support ticket is "the app won't let me approve my own fuel receipt". Record who decided; don't police it.
- **Period locking and timesheet approval** — Attendance. Nobody locks a period they're still learning to trust, and it fights you every time you fix data for a customer on the phone.
- **Rule versioning with in-app "statutory rules updated" notices** — Compliance. A regulator-grade content system over a table you hand-edit twice a year. A dated line in the disclaimer does the same job for free.
- **A general ledger** — Finance. Chart of accounts, journals, double entry, trial balance, P&L, balance sheet, cash flow, fixed assets, period close, multi-currency. Three to six months competing head-on with QuickBooks and Zoho Books for a customer who already pays an accountant with a licence. **The board's recommendation is to change the claim, not the product: stop using the word "ERP" in the Finance pitch.**
- **A full cumulative-tax engine** — Payroll. Multi-week rewrite; Nigerian SME accountants reconcile the annual return off a spreadsheet anyway. Replaced by a year-to-date column and an annual reconciliation export.
- **A per-site geofencing table** — Attendance. For fifty field staff at client sites, the sites change weekly and per-site fences become a data-entry job nobody does. Replaced by one exemption flag per person plus showing the captured location.
- **NDPA retention purge jobs and consent infrastructure** — Visitors, Documents. Replaced by a one-line consent sentence. Build the purge the first time a bank's procurement puts it in writing.

### Cut because it would make the product worse

- **Enforcing the leave gender rule.** There is no gender column on profiles. Building it means storing a protected characteristic on every employee under NDPA 2023 **for the sole purpose of filtering a dropdown**, in a country where paternity leave is state-level, not federal. A man applying for maternity leave is caught by the human approver in three seconds. **Delete the column.**
- **Sick-note attachments.** In a twenty-person Lagos SME the certificate arrives on HR's WhatsApp. **Delete the threshold column** so the schema stops advertising it.
- **Nested folders in Documents.** Worse than flat folders on a 360px phone.
- **Per-IP rate limiting on public lead forms.** On Nigerian mobile networks with shared carrier addresses, this blocks legitimate leads. Turnstile already sits in front.
- **A settings screen for the leave back-date window.** A screen nobody will ever open. Hardcode 14 days — SMEs legitimately back-date because someone was sick on Monday and told HR on Wednesday.
- **Seeding 2028 public holidays.** Eid and Maulud dates are set by moon sighting and federal proclamation weeks out. Seeding them is inventing data you'd have to correct.
- **Computing a VAT return in Finance.** Render a number that differs from what the customer files and you own the discrepancy. The disclaimer does not cover a wrong figure the product volunteered.

### Cut as a scope trap

- **Renumbering all 134 migration files and building a migration runner.** A two-week yak-shave. Replaced by a version guard inside the payroll generator and a one-page runbook.
- **A route-shadowing static analyser** across a 2,964-line router with three matcher dialects. Replaced by eight lines in the existing parity test.
- **A blanket mobile-label sweep across every table in every suite.** Real debt, but it touches cascade ordering in fifteen suites at once and risks a visual regression on your flagship module. Scoped per-module to the two or three tables people actually use on a phone.
- **A platform-wide accessibility pass** (focus traps, ARIA tab strips, keyboard kanban navigation). Real, and no first paying customer is procuring on it. It lives in a shared component — funding it inside a single suite's sprint is the wrong ledger.
- **Product tours for Leave, CRM and Documents.** Coach tours are for self-serve signup funnels. Collarone accounts are admin-provisioned and onboarded by a human — you.
- **The `owner` column plus dual-mounted compliance panels in both HR and Finance** *(compliance board's cut, which narrows the HR board's item 12)*. Ship the single read-only strip first; revisit the split once reminders exist and someone has actually asked.

### The three biggest single cuts

1. **A general ledger for Finance** — three to six months, competing directly with QuickBooks and Zoho Books, for a customer who already has an accountant. Changing the pitch costs an afternoon.
2. **The 134-file migration renumbering programme** — two weeks of infrastructure with no customer-visible symptom, replaced by a version guard and a runbook that give you 90% of the protection.
3. **A CSV import system for HR** — days of work re-specifying a bulk importer that already ships in Admin → Users. At five to twenty tenants, **you importing a customer's spreadsheet by hand is faster to build, higher quality, and a paid onboarding touchpoint that improves retention.**

---

*Nothing in this document has been implemented. It is a plan for your approval.*
