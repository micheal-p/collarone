import { Link } from 'react-router-dom';
import { LegalNav, LegalFooter } from './LegalChrome.jsx';
import './Legal.css';

export default function Privacy() {
  return (
    <div className="lg">
      <LegalNav />

      <div className="lg-body">
        <p className="lg-kicker">Legal</p>
        <h1 className="lg-h1">Privacy Policy</h1>
        <p className="lg-updated">Effective July 2026 · Collarone, Lagos, Nigeria</p>

        <p>This policy explains how Collarone collects, uses and protects personal data, in line with Nigeria's Data Protection Act (NDPA). It covers two kinds of data: information about the organization and the person who signs up ("account data"), and information an organization's administrators enter about their own staff ("workspace data").</p>

        <h2>1. Our role</h2>
        <p>For account data (your name, email, company name and payment reference), Collarone is the data controller. For workspace data — your staff's names, contact details, job information and any documents your administrators upload — your organization is the data controller and Collarone acts as a data processor, handling that data only to provide the service your organization has configured.</p>

        <h2>2. What we collect</h2>
        <ul>
          <li><strong>At signup:</strong> your name, work email, company name, chosen workspace handle, plan selection, theme and logo, and a payment reference (Collarone never receives or stores your card details directly — see Sub-processors below).</li>
          <li><strong>Workspace data your administrators enter:</strong> staff names, emails, phone numbers, job titles, departments, leave records, task assignments, visitor logs, and — where the Payroll module applies — salary structure and bank account details for disbursement instructions.</li>
          <li><strong>Usage data:</strong> sign-in times and basic activity logs, used for security and to keep your account working correctly.</li>
        </ul>

        <h2>3. Why we process it</h2>
        <p>To create and run your workspace, to provide the features your plan includes, to bill you correctly, to keep your organization's data isolated from every other organization on the platform, and to respond to support requests.</p>

        <h2>4. Sub-processors</h2>
        <p>We use a small number of infrastructure providers to run Collarone:</p>
        <ul>
          <li><strong>Supabase</strong> — database, authentication and file storage.</li>
          <li><strong>Vercel</strong> — application hosting.</li>
          <li><strong>Paystack</strong> — payment processing (card and transfer details are handled directly by Paystack, never by Collarone).</li>
        </ul>
        <p>We do not sell personal data, and we do not share workspace data with any other organization on the platform.</p>

        <h2>5. Data retention and deletion</h2>
        <p>We retain your organization's data for as long as your workspace is active. If you close your workspace, we will delete or anonymize your organization's data within 30 days, except where we're required to retain specific records for longer (for example, financial records for tax purposes) under Nigerian law.</p>

        <h2>6. Security</h2>
        <p>Every table in our database enforces row-level security so that one organization's data cannot be read by another. Data is encrypted in transit. Access to production data is limited to what's needed to operate and support the platform.</p>

        <h2>7. Your rights</h2>
        <p>Under the NDPA, you (or, for workspace data, your organization on your behalf) can request access to, correction of, or deletion of personal data we hold. To make a request, contact us using the details below — for workspace data, we'll direct the request to your organization's administrator where appropriate, since they control that data.</p>

        <h2>8. Children</h2>
        <p>Collarone is a business tool and is not directed at children. We don't knowingly collect data from anyone under 18.</p>

        <h2>9. Changes to this policy</h2>
        <p>We'll update this page as the platform develops and note the effective date above. Material changes affecting how workspace data is handled will be communicated to organization administrators.</p>

        <h2>10. Contact</h2>
        <p>Questions or requests about your data: <a href="mailto:hello@collarone.app">hello@collarone.app</a> or WhatsApp <a href="https://wa.me/2348148128551" target="_blank" rel="noreferrer">0814 812 8551</a>.</p>

        <p>See also our <Link to="/terms">Terms of Service</Link>.</p>

      </div>
      <LegalFooter />
    </div>
  );
}
