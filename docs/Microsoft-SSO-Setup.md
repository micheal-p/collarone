# Org-Ops ERP — Microsoft Single Sign-On (SSO) Setup Guide

**Project:** Origin Tech Group — Org-Ops Cloud ERP
**Purpose:** Let staff sign in to Org-Ops with their existing **Origin Tech Group Microsoft 365
account** — no new usernames or passwords to manage.
**Audience:** Microsoft 365 / Entra ID administrator, the Org-Ops app owner, and System Administrators.

---

## 1. What this gives us (plain English)

- **One login for staff.** People sign in with the same Microsoft account they use for Outlook/Teams.
- **Company-only.** Only accounts inside Origin Tech Group's Microsoft tenant can sign in. Personal
  or outside Microsoft accounts are rejected automatically.
- **Signing in ≠ access.** A first-time sign-in lets a person *in*, but they see an **empty
  dashboard with no suites** until a **System Administrator grants them access**. Access is always
  controlled inside Org-Ops, never automatic.

---

## 2. Who does what

| # | Role | Who | Responsibility |
|---|------|-----|----------------|
| A | **Microsoft 365 / Entra ID Administrator** | Origin Tech Group IT | Register the app in Entra and hand back 3 values (Section 4). One-time, ~10 min. |
| B | **Org-Ops App Owner** (with developer) | You + dev | Enter those 3 values into the app's backend (Supabase) and finish wiring (Section 5). |
| C | **System Administrator** (inside Org-Ops) | Designated manager | Grant suite access to each staff member after they first sign in (Section 6). Ongoing. |

> Sections 3–4 are written so you can **forward them directly to your IT/Entra administrator**.

---

## 3. Information the IT administrator will need

The app already provides these fixed values — give them to IT for the registration:

| Field | Value |
|-------|-------|
| **App name** (suggested) | `Org-Ops ERP` |
| **Redirect URI (callback URL)** | `https://dxekronjsvnwmnbanlqh.supabase.co/auth/v1/callback` |
| **Platform type** | Web |
| **Account type** | Single tenant (this organization only) |

---

## 4. ✦ TASK FOR THE MICROSOFT / ENTRA ID ADMINISTRATOR

> Forward this section to whoever administers Origin Tech Group's Microsoft 365 / Entra ID.

Please register an application so our Org-Ops ERP can use Microsoft sign-in:

1. Go to **portal.azure.com** → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. **Name:** `Org-Ops ERP`
3. **Supported account types:** select **"Accounts in this organizational directory only
   (Origin Tech Group only – Single tenant)"**.
4. **Redirect URI:** choose platform **Web** and paste:
   `https://dxekronjsvnwmnbanlqh.supabase.co/auth/v1/callback`
5. Click **Register**.
6. On the app's **Overview** page, copy the **Application (client) ID** and the
   **Directory (tenant) ID**.
7. Go to **Certificates & secrets** → **New client secret** → set an expiry (e.g. 24 months) →
   **Add** → copy the secret **Value** immediately (it is shown only once — copy the *Value*,
   not the *Secret ID*).
8. (If prompted under **API permissions**, the default `User.Read` / `openid` is sufficient;
   add `email` and `profile` if not present, then **Grant admin consent**.)

**Please send back these three values** (securely — e.g. a password manager or sealed message,
not plain email):

| Value to send back | Where it was copied |
|--------------------|---------------------|
| Application (client) ID | Overview page |
| Directory (tenant) ID | Overview page |
| Client secret **Value** | Certificates & secrets |

> ⚠️ The client secret expires on the date chosen in step 7. Put a calendar reminder ~2 weeks
> before to generate a new one, or sign-in will stop working that day.

---

## 5. ✦ TASK FOR THE APP OWNER / DEVELOPER

Once IT returns the three values, finish the wiring (no code changes needed):

1. **Database trigger** (one-time): in Supabase → **SQL Editor**, run the contents of
   `supabase/sso.sql`. (Auto-creates a profile on first sign-in.)
2. **Enable the provider:** Supabase → **Authentication → Providers → Azure → Enable**, then enter:
   - **Client ID** = Application (client) ID
   - **Secret** = the client secret *Value*
   - **Azure Tenant URL** = `https://login.microsoftonline.com/<Directory (tenant) ID>`
     *(setting this — not leaving it blank — is what restricts sign-in to Origin Tech Group only)*
   - **Save**
3. **URLs:** Supabase → **Authentication → URL Configuration**:
   - **Site URL:** `https://originerp-client-ni2e.vercel.app`
   - **Redirect URLs:** add `https://originerp-client-ni2e.vercel.app` and (for testing) `http://localhost:5173`
4. **Allow sign-ups:** Supabase → **Authentication → Sign In / Providers** → ensure
   **"Allow new users to sign up" is ON**. (Required so Microsoft can create the user on first
   login. Safe: the app auto-disables any non-Microsoft self-signup.)

That's it — the **"Sign in with Microsoft"** button on the login page will now work.

---

## 6. How staff sign in (after setup)

1. Go to **https://originerp-client-ni2e.vercel.app** and click **Sign in with Microsoft**.
2. Authenticate with their Origin Tech Group Microsoft account (and MFA if your org requires it).
3. They land on the Org-Ops home screen. **At first they have no suite access** — every tile shows
   "No access".
4. A **System Administrator** opens **Admin Center → Users**, finds the person, clicks
   **Manage access**, and ticks the suites (HR, Leave, Tasks, etc.) they should have.
5. The staff member refreshes and sees only the suites they were granted.

---

## 7. Access & governance

- **Authentication** (proving who you are) is handled by Microsoft.
- **Authorisation** (what you can open) is handled inside Org-Ops by a System Administrator.
- Removing someone's Microsoft account (offboarding) automatically blocks Org-Ops sign-in.
- A System Administrator can also **disable** an account inside Org-Ops at any time.

---

## 8. Security notes

- The **client secret** is sensitive — share it only through a secure channel, and it lives only
  in the app's server-side configuration, never in the browser.
- Sign-in is locked to the **single Origin Tech Group tenant** — no outside accounts.
- The app's existing **email/password login still works** for the System Administrator and any
  internal service accounts.

---

## 9. Combined checklist

**IT / Entra admin**
- [ ] App registered (single tenant), redirect URI added
- [ ] Application (client) ID, Directory (tenant) ID, Client secret Value sent back securely
- [ ] Secret expiry noted on a calendar

**App owner / developer**
- [ ] `supabase/sso.sql` run
- [ ] Azure provider enabled in Supabase with the 3 values + tenant URL
- [ ] Site URL & redirect URLs set
- [ ] "Allow new users to sign up" ON
- [ ] Tested: Microsoft sign-in lands on empty dashboard

**System Administrator (ongoing)**
- [ ] Grant suite access to each new staff member after first sign-in

---

### Reference (project-specific values)

| Item | Value |
|------|-------|
| App URL | `https://originerp-client-ni2e.vercel.app` |
| Supabase callback / redirect URI | `https://dxekronjsvnwmnbanlqh.supabase.co/auth/v1/callback` |
| Azure Tenant URL format | `https://login.microsoftonline.com/<tenant-id>` |
| Identity provider | Microsoft Entra ID (Azure AD) via OAuth 2.0 / OpenID Connect |
