# UX audit — 2026-08-07 (workflow wf_aa67fa53-5e0)

85 raw findings → 34 deduplicated. Viewports: Android 360, iPhone 390, Desktop 1440 (gated pages: see item 1 caveats). Status: [ ] open, [x] fixed.

- [ ] **1. HIGH bug** — Authenticated app — /workspace, /profile, /support, /help, /admin/users, /admin/billing, all five /suite/* pages, /platform-admin
  AUDIT BLOCKER (affects 8 of 12 sweeps: Core app, Operational suites and Platform Control at 360px, 390px and 1440px): no auth session was active in the Chrome profile, so every authenticated URL immediately redirected to /login. localStorage held no auth token (only collarone_cart_preview and two orgops_demo keys). Entering credentials is prohibited for the agent, so none of the authenticated surfaces were audited — only the login screen. Environment caveats for the re-run: macOS Chrome would not shrink below ~500-600px outer width, so the 'mobile' sweeps of gated pages actually ran at ~598-612 CSS px (true 360/390px needs DevTools device emulation), and the profile has a saved ~60% page zoom for collarone.app that should be reset to 100%. Someone must sign in manually, then re-run these 8 sweeps.

- [x] **2. HIGH ux** — Landing page — scroll-reveal sections
  Scroll-triggered fade-in animations lag behind normal scrolling, leaving entire sections blank until 1-2s after the user stops. Seen at iPhone 390px (empty dark band where section '03 Your digital front door' should be; ~700px empty orange band between the jobs-section CTAs and the sample job card; headings/cards rendering ghost-dimmed mid-scroll) and at Desktop 1440px (full empty screens at the '02 The Operating System' section, the storefront-themes grid, the whole green '04' band and the orange '06' jobs section). Anyone scrolling continuously sees a half-loaded page.

- [x] **3. HIGH bug** — System status
  At Android 360px the page scrolls horizontally (document scrollWidth 584px vs 360px viewport): the 90-day uptime bar chart overflows its rounded card on the right — bars run past the card border and off the screen edge while the card border and 'Today' label stay put — dragging the whole page sideways and making the chart look broken.

- [x] **4. MEDIUM ui** — Brand logo on light backgrounds — /jobs header, /jobs and /try footers, /try header, /login card
  The light/dark logo variants are swapped on light chrome, at all three viewports (360px, 390px, 1440px). The light-on-dark mark is reused on white backgrounds so it renders as a faint washed-out speck: /jobs header, /jobs and /try footers (in the /try header at 390px the icon is missing entirely — only the wordmark shows), and the sign-in card on /login shows a very pale cream hexagon/shield where only the tiny orange dot registers, reading as a broken or half-loaded image. The same mark renders crisp and dark on the landing page and /signup, confirming a wrong-variant issue rather than a bad asset.

- [x] **5. MEDIUM ux** — Landing page — hero first paint
  On first load the hero is effectively blank for several seconds at all three viewports (360px, 390px, 1440px): ~3s after navigation only the header and the 'The business OS built for Nigeria' pill are visible; the H1, subtext and both CTA buttons remain at opacity 0 and only fade in around the 5-6s mark (or on first scroll). First-time visitors — especially on slow connections — see a mostly empty dark screen that reads as broken.

- [x] **6. (fixed: launcher fades to 30% while the page scrolls and returns on idle; hover restores it instantly) MEDIUM ui** — Floating chat bubble — landing page
  The bottom-right chat launcher overlaps content at all three viewports: at 360px it sits on the footer covering the tail of the copyright line ('Made for Nigerian busine...') with no bottom padding to let the footer clear it; at 390px it covers the corner of the 'Customers & Growth' card and the right end of plan rows in the pricing section; at 1440px it sat on the sticky price-estimator bar's 'Start with Standard' button, the 'People & Operations' card text and the 'Startup ₦15,000/mo' plan card corner.

- [x] **7. MEDIUM ux** — Auth gate — /login redirect
  Deep links are dropped and unexplained at the auth gate (verified at 390px and 1440px). Navigating signed-out to any authenticated URL (/suite/attendance, /admin/billing, /workspace, etc.) lands on bare /login with no ?next=/returnTo param and no stored return path in localStorage/sessionStorage, so after signing in the user presumably lands on a default page instead of the one they were sent to. There is also zero context — no 'Your session has expired' or 'Please sign in to continue' notice — so a user whose session silently expired gets no explanation for the bounce.

- [x] **8. (could not reproduce live 2026-08-08: finished the 3-step tour in the /try/tasks sandbox, body/html overflow back to `visible`, wheel scroll works, tour fully unmounted — the lock exists only mid-tour by design) MEDIUM bug** — Live demo - HR & Staff suite (guided tour)
  At Android 360px, after finishing the 3-step guided tour (tapping Done) the page cannot be scrolled: mouse wheel and PageDown leave scrollY at 0 even though the page is 1686px tall (programmatic scrollTo works, so the tour overlay leaves a scroll/event lock behind). The lock only clears after switching to another tab (e.g. Org chart). A visitor who finishes the tour and tries to scroll the staff list sees a frozen page.

- [x] **9. MEDIUM bug** — System status — data loading
  At iPhone 390px the status data loads late and contradicts itself. (1) On first paint the Incident history section shows the empty state 'No incidents recorded, every scheduled check has come back healthy', then two real incidents (17-19 Jul 2026, including 'Application error, Partial impact ~75% of service healthy') load in and replace it — the page briefly asserts a clean record that is factually wrong. (2) The uptime strip reads 'Uptime over the past 0 days' and the chart axis shows '0 days ago — No history yet — Today' while the same page lists July incidents, making the monitoring look reset or misconfigured. (The 1440px sweep saw the 90-day chart populated, consistent with a load-order/race issue.)

- [x] **10. MEDIUM ui** — Landing page — price calculator sticky banner
  At Android 360px, in the 'Estimate your price' card the dark sticky price banner (N45,000 / Start with Standard) overlaps the suite-category heading below it: 'WORK, GET THINGS DONE' is half-hidden behind the banner's bottom edge and reads as clipped text while scrolling through the suite checklist.

- [x] **11. MEDIUM ui** — Live demo - HR & Staff suite (Performance > Goals, Cases & Documents > Documents)
  At Android 360px, delete controls render as bare small red 'x' icons floating alone at the bottom-left of each goal/document card, detached from any label and surrounded by large empty whitespace. The tap target is roughly 20px — too small for touch — and the orphaned red x makes the cards look unfinished (cards also show bare em-dash '-' placeholder rows).

- [x] **12. MEDIUM ux** — /login — email field
  The email input has no visible label — only the placeholder 'you@company.com' (light grey on white, low contrast). Once the user starts typing, nothing on screen says what the field is. A small 'Work email' label above the field would fix it. Observed at 1440px; applies at all widths.

- [x] **13. LOW copy** — /login — helper text
  Comma splice in the helper text under the Next button, seen in every sweep that reached /login (all three viewports, all four surface groups): 'Staff accounts are created by your administrator, sign in with the email and password they gave you.' Needs a period/em dash after 'administrator' (e.g. 'Staff accounts are created by your administrator. Sign in with the email and password you were given.'). It also mentions 'email and password' while the visible step only asks for an email, reading slightly ahead of the UI.

- [x] **14. LOW copy** — /login — browser tab title
  The /login route keeps the full marketing SEO title 'Collarone: HR, Payroll, CRM & Business Software for Nigerian Companies' instead of a route-appropriate 'Sign in — Collarone' (seen in every sweep that reached /login, all three viewports). On a phone the tab shows 'Collarone: HR, Pay…', indistinguishable from the marketing-site tab; every app route sharing the marketing title suggests the SPA never updates document.title.

- [x] **15. LOW ui** — /login — Next button layout
  The orange 'Next' button is right-aligned alone on its row under the full-width email input, leaving a large dead zone (~45-60% of card width) to its left, with the left-aligned helper text directly beneath it — the block reads ragged/unfinished at every viewport tested (360, 390, 1440; flagged in six sweeps). At phone width the convention is a full-width primary button. The button's measured height is 40px, under the 44px mobile tap-target guideline and inconsistent with the 44px email input above it, and its heavy orange glow/shadow bleeds down over the helper text below.

- [x] **16. LOW copy** — Signup - step 1 (AI 'Describe your business' input)
  The placeholder is clipped mid-word at every viewport tested (360px: 'e.g. "a fashion store in Aba w'; 390px: '...with 12 staff anc…'; 1440px: '...with 12 staff a') with no ellipsis and the opening quote never closing. The example is unreadable exactly where it is meant to teach the feature, right above the primary 'Pick for me' action. A shorter placeholder would fit.

- [x] **17. LOW ux** — System status — chart interaction copy
  Helper copy says 'Hover a bar for that day's detail' on touch viewports (seen at 360px and 390px) — hover does not exist on a phone, and the ~4px bars are far too thin to tap individually, so per-day detail is unreachable on mobile. At 390px the instruction also appeared while the chart showed 'No history yet' (no bars at all); it needs tap wording and should hide when the chart is empty.

- [x] **18. LOW ui** — Connect a clocking device (docs) — code blocks
  The wide code blocks (gateway pseudo-code with end-of-line comments, and the JSON success response ending at '"errors":' with its value hidden) render clipped mid-token with no visible scroll affordance until you actually drag — seen at both 390px and 1440px. Horizontal scrolling does work inside the block (no page-level overflow), but the default view just looks truncated; wrapping the JSON or shortening comment columns would avoid it.

- [x] **19. LOW ui** — /login — helper text contrast
  The staff-accounts helper text renders in very light grey (~#9ca3af) at small size on the white card — noticeably fainter than the 'Use your work email to sign in.' line above it, borderline unreadable and likely failing AA contrast (flagged at 360px and 1440px). The '← Back to homepage' link below the card is also mid-grey on the near-black backdrop — readable but dim for the only escape route on the page.

- [x] **20. LOW ux** — /login — password recovery
  No 'Forgot password?' affordance anywhere on the email step (confirmed by full-page text search at 390px, two sweeps). Since staff accounts are admin-provisioned, users who forget the password they were given have no visible recovery path or even a hint to contact their administrator. (The password step could not be checked without typing.)

- [x] **21. (accepted: the CollarOne wordmark styling is intentional brand treatment) LOW copy** — /login — brand casing
  Brand casing is inconsistent on the same screen (seen at 1440px, two sweeps): the wordmark renders 'CollarOne' (bold 'Collar' + orange italic 'One') while the footer says '© 2026 Collarone' and the tab title says 'Collarone'. Worth confirming the dual treatment is intentional, or picking one casing.

- [x] **22. (confirmed benign: /try sandbox fake data, local-only; orgops_ key rename = cosmetic debt) LOW bug** — collarone.app origin — localStorage
  Storage inspection found an unrelated Org-Ops demo database key 'orgops_demo_db_v1' in the production collarone.app origin's localStorage, holding user records with plaintext passwords (e.g. demo-guest@collarone-demo.app / 'demo', role super_admin), plus 'orgops_demo_session'. If an Org-Ops demo build is being served from the production origin it is polluting prod-origin storage with plaintext demo credentials; worth confirming this is only local test residue on this machine.

- [x] **23. LOW ui** — Landing page — price calculator banner
  At 360px the '/mo' suffix after the big 'N45,000' price in the dark sticky banner is nearly invisible — dark grey-brown text on a near-black background, reading as a smudge. The same '/mo' is legible in the cream 'Best plan' summary further down, so only the dark-banner styling needs fixing.

- [x] **24. LOW ui** — Landing page — hero header while scrolling
  At 360px, while scrolling within the dark hero the fixed header has no background, so the hero's 'Explore the live demo' button scrolls up and visually collides with the logo / 'Get started' / hamburger row — two stacked layers of UI text occupy the same band until the header gains its solid background further down the page.

- [x] **25. LOW ui** — Landing page — suite picker chips
  At 360px, the selected 'Visitor Management' pill's orange check mark sits on top of the pill's right border, half outside the pill, while the equivalent check on 'Task & Report' sits fully inside — the two selected chips look inconsistent.

- [x] **26. LOW ui** — Signup - step 1 — suite-group labels
  At 360px the suite-group label 'STOCK & BUYING' wraps onto two cramped lines ('STOCK &' / 'BUYING') while sibling labels (PEOPLE, WORK, FRONT DESK) sit on one line, making the section headings uneven.

- [x] **27. LOW ui** — Live demo - HR & Staff suite — tab bars
  At 360px the suite tab bar and sub-tab bars truncate labels mid-word at the right edge with no fade or scroll hint: 'Re' (Recruitment), 'Training & certification', and even the selected 'Cases &' tab stays half cut off after tapping it. The bars do scroll horizontally, but nothing signals that.

- [x] **28. LOW ux** — fixed: demo free-pass users seeded with title+department and appended after showcase staff
  At 360px the first staff card in the demo list is 'Demo Guest' with bare em-dash placeholders for job title and email ('-' / IT / '-'), so the very first thing a prospect sees in the showcase list looks like a half-broken record rather than sample data.

- [x] **29. LOW copy** — Jobs board — search placeholder
  At 360px the search input placeholder ends with a two-dot 'locations..' (truncated ellipsis or typo) — 'Search roles, companies, locations..' reads as an unfinished sentence right under the hero.

- [x] **30. LOW ui** — Landing page — website-themes gallery
  At 390px the two-column masonry leaves a card-sized empty hole: the right column ends after 'Storefront Classic' while the left column continues with the full 'Minimal Pitch' card, so a blank area sits beside it before the 'See all 11 themes' button. Looks unfinished at this width.

- [x] **31. LOW ux** — Landing page — price calculator (pinned section)
  At 390px the 'Estimate your price' calculator is pinned/sticky such that a full screen-height of wheel/swipe scrolling is absorbed with zero visual change (two consecutive 12-tick scrolls produced identical views around the 'How many staff?' slider). On a phone this feels like the page is stuck.

- [x] **32. (confirmed zoom artifact 2026-08-08: at a physically 1440px window the page reported only 598 CSS px because of the saved page zoom, so the nav correctly collapsed to mobile; all links present in the DOM and shown above the 780px breakpoint) LOW ux** — Landing page — desktop header nav
  At 1440px the header shows only a hamburger icon plus 'Get started' — no visible nav links (pricing, FAQ, sign in) despite ample space. Desktop users must discover the hamburger to sign in from the top of the page.

- [x] **33. LOW copy** — System status — 'What's monitored' copy
  The 'What's monitored' paragraph is a chain of comma splices: 'A scheduled check hits the Collarone API and database directly, on a fixed interval, this page reads the real results, it doesn't assume anything is fine.' Reads as one run-on sentence (seen at 1440px).

- [x] **34. LOW ui** — Try demo picker
  At 1440px the 5 suite cards sit in a 2-column grid, leaving 'Payroll & Benefits' alone at bottom-left with a large empty slot to its right — the grid looks unfinished. Otherwise the page is clean.


- [x] **35. (found + fixed during the 2026-08-08 verification pass) HIGH bug** — Live demo — Task & Report suite
  Opening /try/tasks flashed 'Demo API has no route for GET /taskstats' and rendered 'No tasks yet': the suite loads tasks + stats in one Promise.all, so the missing stats route blanked the seeded task list too. Root cause: the demo router only answered GET /tasks — creating a task, changing status, deleting, reports and comments all 404'd, in a sandbox whose tour tells visitors to try exactly those things. Fixed with a full demo tasks block (CRUD, reports, comments, stats) and 7 new rows in test/demo_route_parity.mjs so the next missing route fails CI instead of a prospect.
