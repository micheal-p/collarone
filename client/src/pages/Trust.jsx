import { Link } from 'react-router-dom';
import { LegalNav, LegalFooter } from './LegalChrome.jsx';
import './Legal.css';

// The security and reliability page.
//
// Every claim here is something the repository can be made to prove: a named
// test, a scheduled job, or an architectural decision visible in the code. That
// is the whole rule for this file. If a sentence cannot be traced to something
// that runs, it does not belong on this page, because this is the page a
// cautious buyer will hold us to.
//
// Deliberately not on this page: any comparison with another company. Naming a
// competitor turns a factual page into a marketing claim we would have to
// defend, and the facts below are stronger on their own.
export default function Trust() {
  return (
    <div className="lg">
      <LegalNav />

      <div className="lg-body">
        <p className="lg-kicker">Security</p>
        <h1 className="lg-h1">How your data is kept safe</h1>
        <p className="lg-updated">Last reviewed September 2026 · Collarone, Lagos, Nigeria</p>

        <p>
          Collarone holds payroll figures, staff records and bank details for every business that uses
          it. This page sets out, plainly, what protects that information, and how each protection is
          checked rather than merely intended.
        </p>

        <h2>1. One company can never see another company's data</h2>
        <p>
          Separation is enforced by the database itself, not by the screens. Every table carries the
          organisation it belongs to, and the database refuses to return a row to anyone outside that
          organisation, whatever the application asks for. A mistake in the interface therefore cannot
          expose another company's records, because the interface is not what is holding the line.
        </p>
        <p>
          This is checked automatically. On every release, an automated probe signs in as a real user
          of one organisation and attempts to read another organisation's data across the sensitive
          tables. If a single row comes back, the release stops.
        </p>

        <h2>2. Files are separated the same way</h2>
        <p>
          Documents, letters and staff photographs are stored under a folder belonging to the
          organisation that uploaded them, and the storage rules check that folder against the
          organisation of whoever is asking. Private files are served through a short lived link
          issued only after that check passes.
        </p>

        <h2>3. Our own staff cannot quietly change your records</h2>
        <p>
          When a Collarone engineer enters a workspace to help with a support request, that session is
          blocked from writing by the database, not by a policy document or a promise. Support can
          see what you see so they can answer your question. They cannot alter your payroll.
        </p>

        <h2>4. Backups are restored, not just taken</h2>
        <p>
          A backup nobody has restored is a hope, not a backup. Every Monday an automated job takes the
          production database, restores it in full into a brand new empty database, and compares every
          table's contents against the original. If any table fails to come back correctly, we are told
          that morning rather than on the day we need it. Copies are held in two independent locations
          run by different providers.
        </p>

        <h2>5. A bad release puts itself back</h2>
        <p>
          Before anything ships, the running version is snapshotted. After it ships, the platform checks
          its own health, and if that check fails the previous version is restored automatically rather
          than waiting for somebody to notice. More than thirty automated checks run on the way to
          production, covering tenant separation, payroll arithmetic, bank file formats, permissions
          and the wording customers actually read.
        </p>
        <p>
          Releases are also frozen from the twenty fifth of each month until month end. That is when
          payroll is prepared, approved and sent to the bank, and it is the worst possible week to
          change anything underneath you.
        </p>

        <h2>6. We never hold your money</h2>
        <p>
          Payments settle directly into your own payment provider account, using your own keys. Collarone
          does not receive, hold or route your customers' funds, and card details never reach a Collarone
          server. Your secret keys are stored encrypted, and are never shown back in full once saved.
        </p>

        <h2>7. Known vulnerabilities fail the build</h2>
        <p>
          Every release is gated on a scan of the software libraries we ship for publicly known
          vulnerabilities. A high or critical finding stops the release until it is dealt with, rather
          than appearing in a report nobody reads.
        </p>
        <p>
          The scan depends on an outside advisory service, and that service does go down. When it does,
          the release is marked on the record as unscanned rather than quietly treated as clean, so a
          build nobody could check never looks like a build that passed.
        </p>

        <h2>8. The service is fast on a Nigerian connection</h2>
        <p>
          Opening Collarone downloads roughly three hundred and thirty kilobytes, and the page is usable
          in about a second. That is a deliberate constraint, not an accident: staff open this on phones,
          on mobile data, and a business tool that costs a person part of their data bundle every morning
          is a business tool they stop opening.
        </p>

        <h2>9. When something does go wrong, you can see it</h2>
        <p>
          The <Link to="/status">status page</Link> reports live service health and keeps a history of
          past incidents, including ones that only affected people's browsers. It is not edited by hand
          after the fact.
        </p>

        <h2>10. What we have not done yet</h2>
        <p>
          Two things a larger buyer may ask for and should know are outstanding. Multi factor sign in is
          not yet available. A formal external penetration test has not been carried out. Both are on the
          roadmap, and we would rather say so here than be asked in a meeting.
        </p>

        <p>
          Questions about any of this, including from a security team assessing us, go to{' '}
          <Link to="/contact">our contact page</Link> and are answered by a person.
        </p>
      </div>

      <LegalFooter />
    </div>
  );
}
