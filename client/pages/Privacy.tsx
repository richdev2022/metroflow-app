import StaticPage, { Section } from "@/components/StaticPageShell";

const LAST_UPDATED = "October 2025";

export default function Privacy() {
  return (
    <StaticPage
      title="Privacy Policy"
      description={`How Metricorex collects, uses, stores and protects your data across Personal and Business use. Last updated: ${LAST_UPDATED}.`}
    >
      <p>
        Metricorex ("we", "us") respects your privacy. This Privacy Policy explains what personal
        data we collect when you use our web, iOS and Android applications, why we collect it, how
        long we keep it, and the choices you have. It applies to both Personal and Business usage
        of the Service.
      </p>

      <Section title="1. Data we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account data</strong> — name, email address, phone number, password (hashed),
            profile photo and authentication provider (email/password or Google Sign-In).
          </li>
          <li>
            <strong>Identity and KYC data</strong> — where required by regulation for wallets and
            transfers: Bank Verification Number (BVN), National Identification Number (NIN),
            business registration details, and documents you submit for verification.
          </li>
          <li>
            <strong>Financial data</strong> — wallet balances, transaction records, transfer and
            payroll history, beneficiary details you enter, and payment method tokens held by our
            licensed payment partners (we never store raw card numbers).
          </li>
          <li>
            <strong>Work data</strong> — tasks, comments, boards, epics, ideas, documents,
            meetings, call metadata, chat messages and attachments you and your team create.
          </li>
          <li>
            <strong>Device and usage data</strong> — device identifiers, push notification tokens,
            app version, IP address, and in-app activity used to secure your account and improve
            the product.
          </li>
        </ul>
      </Section>

      <Section title="2. How we use your data">
        <p>
          We use your data to operate and secure the Service: creating and managing your account,
          verifying your identity, processing wallet funding, transfers, payroll and payment links,
          delivering notifications, providing support, preventing fraud and meeting our legal and
          regulatory obligations. We also use aggregated usage patterns to improve features — for
          example AI meeting notes and MetricAi responses — on the basis of our legitimate
          interests, always within the limits of your plan and consent choices.
        </p>
      </Section>

      <Section title="3. Cookies and local storage">
        <p>
          We use strictly-necessary cookies and local storage to keep you signed in, remember your
          theme and preferences, and protect the Service. We also use optional analytics to
          understand how the app is used. When you first visit, our cookie banner lets you accept
          or reject optional cookies; rejecting keeps only the essentials in place. You can change
          your choice at any time by clearing site data and revisiting the app.
        </p>
      </Section>

      <Section title="4. Sharing with third parties">
        <p>
          We share data only as needed to run the Service: with licensed payment processors
          (wallets, transfers, card payments), identity-verification partners (KYC), communication
          providers (email, SMS, WhatsApp and push notifications), cloud infrastructure and AI
          model providers that power MetricAi. These parties process data under contract and are
          not permitted to use it for their own purposes. We may also disclose data where required
          by law, regulation or valid legal process.
        </p>
      </Section>

      <Section title="5. Data retention">
        <p>
          We retain personal data for as long as your account is active and, afterwards, only as
          long as necessary for legal, accounting, regulatory or dispute-resolution purposes.
          Financial transaction records are retained for the period required by applicable
          financial regulations. Backups are rotated on a rolling schedule.
        </p>
      </Section>

      <Section title="6. Security">
        <p>
          We protect your data with encryption in transit, hashed passwords, transaction PINs,
          optional biometric sign-in, role-based access controls and continuous monitoring. No
          system is perfectly secure, but we are committed to rapid response and transparency if
          anything ever goes wrong, including notifying affected users and regulators where
          required.
        </p>
      </Section>

      <Section title="7. Your rights">
        <p>
          Subject to applicable law (including the Nigeria Data Protection Act and, where
          applicable, the GDPR), you may request access to your data, correction of inaccurate
          data, deletion of your account, restriction of or objection to certain processing, and a
          portable export of your data. You can reach our privacy team from the in-app support desk
          or the contact email on our website; we respond within the timeframe required by law.
        </p>
      </Section>

      <Section title="8. Children and international transfers">
        <p>
          The Service is not directed at children under 18, and we do not knowingly collect their
          personal data. Where data is transferred across borders (for example to AI or cloud
          providers), we rely on appropriate safeguards such as contractual clauses and
          data-processing agreements.
        </p>
      </Section>

      <Section title="9. Changes to this policy">
        <p>
          We may update this Privacy Policy as the Service evolves. The "Last updated" date above
          will always reflect the current version, and material changes will be announced in the
          app or by email before they take effect.
        </p>
      </Section>
    </StaticPage>
  );
}
