import { Link } from 'react-router-dom';
import { LegalNav, LegalFooter } from './LegalChrome.jsx';
import './Legal.css';

export default function Terms() {
  return (
    <div className="lg">
      <LegalNav />

      <div className="lg-body">
        <p className="lg-kicker">Legal</p>
        <h1 className="lg-h1">Terms of Service</h1>
        <p className="lg-updated">Effective July 2026 · Collarone, Lagos, Nigeria</p>

        <p>These Terms govern your use of Collarone — the business platform at collarone.app and any workspace created under it. By creating a workspace or signing in to one, you and the company you represent ("your organization") agree to these Terms.</p>

        <h2>1. What Collarone is</h2>
        <p>Collarone is a business platform for Nigerian companies, providing tools for staff management, leave, tasks, visitor management and related workflows, with a customer CRM and website builder joining the same account over time. Collarone is under active early-access development — features marked "coming soon" are not yet available, and features in testing (such as Payroll) are explicitly not guaranteed fault-free until we say otherwise.</p>

        <h2>2. Your organization's account</h2>
        <p>The person who creates an organization's workspace becomes its administrator and is responsible for that organization's use of Collarone, including the accounts of any staff they provision. Organization administrators are responsible for the accuracy of information entered about their staff and for managing who has access to their workspace.</p>

        <h2>3. Fees, credits and billing</h2>
        <p>Access to a workspace requires payment of the applicable plan fee. New staff accounts beyond what your plan includes are provisioned using purchased seat credits. Your base fee and per-seat rate are locked in at the time you sign up and do not change when our published rates change later. Payment is confirmed manually during early access — your workspace activates once we've verified your payment reference. All fees are in Nigerian naira; there is no dollar pricing or forex markup.</p>
        <p>Collarone is billed monthly with no long-term contract. You may stop using Collarone at any time; there is no cancellation fee, though fees already paid are non-refundable except where required by law or explicitly agreed with you in writing.</p>

        <h2>4. Acceptable use</h2>
        <p>You agree not to use Collarone to store or process data you don't have the right to hold, to attempt to access another organization's workspace or data, to interfere with the platform's operation, or to use the platform for any unlawful purpose.</p>

        <h2>5. Your data</h2>
        <p>Your organization owns the data it enters into Collarone. We process it on your behalf to provide the service — see our <Link to="/privacy">Privacy Policy</Link> for how we handle it, including as it relates to your employees' personal information.</p>

        <h2>6. Payroll — an explicit limit</h2>
        <p>Where the Payroll module is available to your plan, Collarone prepares payroll calculations and disbursement instructions only. Collarone does not hold, transmit or move your funds directly — your bank or payment provider executes any actual payment. We are not a payment institution and do not act as one.</p>

        <h2>7. Suspension and termination</h2>
        <p>We may suspend or terminate a workspace for non-payment, a material breach of these Terms, or conduct that puts other organizations' data at risk. You may close your workspace at any time by contacting us.</p>

        <h2>8. Liability</h2>
        <p>Collarone is provided on an "as-is" basis during early access. To the maximum extent permitted by law, Collarone is not liable for indirect or consequential losses arising from use of the platform. Nothing in these Terms limits liability that cannot be limited under Nigerian law.</p>

        <h2>9. Changes</h2>
        <p>We may update these Terms as the platform develops. We'll make a reasonable effort to notify organization administrators of material changes before they take effect.</p>

        <h2>10. Governing law</h2>
        <p>These Terms are governed by the laws of the Federal Republic of Nigeria.</p>

        <h2>11. Contact</h2>
        <p>Questions about these Terms: <a href="mailto:hello@collarone.app">hello@collarone.app</a> or WhatsApp <a href="https://wa.me/2348148128551" target="_blank" rel="noreferrer">0814 812 8551</a>.</p>

      </div>
      <LegalFooter />
    </div>
  );
}
