# Data Processing Agreement (template)

**Status: DRAFT — must be reviewed by a Nigerian data-protection lawyer before it is offered to a customer.** It is written from what the platform verifiably does today, not from a template found online, so a lawyer is reviewing facts rather than guessing. It is not legal advice.

Between:

- **Collarone** ("the Processor") — [registered name], [RC number], [address]
- **[Customer legal name]** ("the Controller") — [RC number], [address]

Effective from the date the Controller's workspace is activated.

---

## 1. Why this document exists

When a business puts its employees' records into Collarone, **the business remains the controller of that data and Collarone becomes a processor**. Under the Nigeria Data Protection Act 2023 that is not a formality: it creates specific, enforceable obligations on the Processor, and the Controller is required to have them in writing before the data is handed over.

## 2. Subject matter, duration, nature and purpose

| | |
|---|---|
| **Subject matter** | Provision of the Collarone business-management platform |
| **Duration** | For as long as the Controller's workspace is active, plus the deletion window in §9 |
| **Nature** | Storage, organisation, retrieval, computation (including payroll and statutory deductions), and display of records the Controller submits |
| **Purpose** | Solely to provide the platform to the Controller and to comply with law. **The Processor does not use the Controller's data to train models, to build products, or for its own marketing.** |

## 3. Categories of data subjects

The Controller's employees, job applicants, visitors, customers and suppliers.

## 4. Types of personal data

Depending on which suites the Controller has bought:

- **Identity and contact** — name, email, phone, address, photograph
- **Employment** — job title, department, start date, employment history, documents, disciplinary and performance records
- **Financial** — salary, bank account details, pension and PFA details, loan balances
- **Statutory identifiers** — Tax Identification Number, pension PIN, NHF number
- **Attendance** — clock-in and clock-out times, and **geolocation** where the Controller enables location-tagged attendance
- **Applicant data** — CVs and interview records
- **Visitor data** — names, times of entry and exit, host

Financial details, statutory identifiers and biometric or location data are sensitive. The Controller decides which of these it submits by choosing which suites to use.

## 5. Sub-processors

The Processor uses the following. The Controller consents to these on signing, and the Processor will give **30 days' notice** before adding or replacing one, during which the Controller may object and terminate.

| Sub-processor | Purpose | Location of processing |
|---|---|---|
| Supabase (AWS) | Database, authentication, file storage | **EU (Stockholm, `eu-north-1`)** |
| Hostinger | Application server | [confirm region] |
| Paystack | Payment processing for subscription fees | Nigeria |
| Resend | Transactional email | EU/US — *not yet enabled* |
| OpenAI | Optional AI assistance features | US — *not yet enabled* |

## 6. Cross-border transfer — read this one carefully

**The Controller's data is stored in the European Union, not in Nigeria.** The database region is `eu-north-1` (Stockholm).

This is a cross-border transfer under **section 41 NDPA 2023** and requires a lawful basis. The EU provides an adequate level of protection under EU law, and the transfer is necessary for the performance of this contract, but **the Controller must be told before its data is submitted, not after.** Do not remove this section to make the document shorter.

## 7. Obligations of the Processor

The Processor shall:

1. Process personal data **only on the Controller's documented instructions**, this agreement being the initial instruction;
2. Ensure everyone authorised to process the data is bound by confidentiality;
3. Implement the measures in §8;
4. Not engage a sub-processor except as in §5;
5. Assist the Controller in responding to data-subject requests — access, rectification, erasure, portability, objection;
6. Assist the Controller with data-protection impact assessments and with breach notification;
7. Delete or return the data as in §9;
8. Make available the information reasonably necessary to demonstrate compliance, and allow audits as in §10;
9. **Tell the Controller immediately if an instruction appears to breach the NDPA**, rather than carrying it out.

## 8. Security measures

Currently implemented, and stated plainly so the Controller can assess them:

- **Tenant isolation enforced at the database, not the application.** Every table carries an organisation identifier and row-level security policies gate every read and write, so one customer's queries cannot reach another's rows even if the application is wrong or compromised.
- **Automated isolation testing.** A cross-tenant probe runs against the live schema and asserts, table by table, that one tenant cannot read another's data. It runs in the deployment pipeline.
- **Encryption in transit** (TLS) for all connections, and **at rest** by the database provider.
- **Access control** — role-based permissions per suite, with money and personal-file suites requiring deliberate, per-person grants that cannot be issued in bulk.
- **Credential handling** — passwords hashed by the authentication provider; payment gateway keys encrypted and never returned to any client.
- **Audit logging** of privileged administrative actions.

Known limitations, stated honestly rather than omitted:

- Collarone staff with production database access can technically read customer data. Access is limited to [name(s)] and used only for support and incident response.
- Multi-factor authentication is not yet available for customer accounts.
- There is no formal certification (ISO 27001, SOC 2).

## 9. Deletion and return

On termination, the Controller may export its data for **30 days**. After that the Processor deletes it within **60 days**, including from backups on their normal rotation cycle, unless retention is required by law. Written confirmation of deletion is given on request.

## 10. Audit

The Controller may, on 30 days' notice and no more than once a year, request information reasonably necessary to verify compliance. On-site audits at the Controller's cost, during business hours, without disrupting other customers.

## 11. Breach notification

The Processor will notify the Controller **without undue delay and within 24 hours** of becoming aware of a personal data breach, with the nature of the breach, categories and approximate numbers affected, likely consequences and remedial measures. The Controller is responsible for notifying the Nigeria Data Protection Commission and affected data subjects where required, and the Processor will assist.

## 12. Liability

[To be completed with your lawyer — cap and carve-outs are commercial decisions, not template text.]

---

**Signed**

| Controller | Processor |
|---|---|
| Name: | Name: |
| Title: | Title: |
| Date: | Date: |

---

### Before you use this

1. Have a Nigerian data-protection lawyer review it.
2. Confirm the Hostinger processing region and fill it in.
3. Register with the Nigeria Data Protection Commission if your processing volume requires it — check the current threshold.
4. Decide the §12 liability cap.
5. Keep §5 and §8 honest as the platform changes. A DPA that describes security you don't have is worse than no DPA.
