import StaticPage, { Section } from "@/components/StaticPageShell";

const LAST_UPDATED = "October 2025";

export default function Terms() {
  return (
    <StaticPage
      title="Terms of Service"
      description={`These terms govern your use of Metricorex — the all-in-one business suite for work, team, money and payments. Last updated: ${LAST_UPDATED}.`}
    >
      <p>
        Welcome to Metricorex. These Terms of Service ("Terms") form a binding agreement between you
        and MetriCorex Limited ("Metricorex", "we", "us") and govern your access to and use of our
        web, iOS and Android applications and all related services (collectively, the "Service").
        By creating an account or using the Service, you accept these Terms. If you do not agree,
        please do not use the Service.
      </p>

      <Section title="1. Who these terms cover">
        <p>
          Metricorex is an <strong>all-in-one business suite</strong>: your workspace (tasks, boards,
          backlog and ideas), your team tools (meetings, calls and chat), your money (business and
          personal wallets, transfers and payroll) and your revenue (payment links, smart invoices,
          a storefront and recurring billing). Where a feature is specific to one context — for
          example business wallets, payroll or team management — these Terms apply to it equally,
          and additional verification (such as business KYC) may be required before you can use it.
        </p>
      </Section>

      <Section title="2. Accounts and eligibility">
        <p>
          You must be at least 18 years old and legally able to enter into contracts. You agree to
          provide accurate, current information during sign-up and Know-Your-Customer (KYC)
          verification, and to keep it up to date. You are responsible for safeguarding your
          credentials, your transaction PIN and any biometric enrolment on your devices, and for
          all activity under your account. Notify us immediately of any unauthorised use.
        </p>
      </Section>

      <Section title="3. Subscriptions, plans and billing">
        <p>
          Some features of the Service require a paid plan. Plans, pricing, inclusions and trial
          periods are described on our pricing page and may change from time to time; material
          changes will be communicated in advance. Paid subscriptions renew automatically — monthly
          or yearly depending on your selection — until cancelled. Where you save a payment card,
          authorise us to charge the applicable fee to that card via our licensed payment partners.
          Fees already paid are generally non-refundable except where required by law.
        </p>
      </Section>

      <Section title="4. Wallets, transfers and payment services">
        <p>
          Wallet funding, transfers (including bulk and international payouts), payment links and
          related services are provided through licensed payment partners. Fees for specific
          services (for example transfer fees, OTP delivery fees, payment-link collection fees) are
          disclosed in the app before you confirm a transaction or in your plan configuration.
          Transaction PINs and one-time passwords (OTPs) are required for sensitive operations.
          International payouts are quoted at the live rate shown at the time you confirm the
          transfer; the amount actually debited from your wallet is the quoted debit amount. You
          are responsible for the accuracy of beneficiary details you provide.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>
          You agree not to use the Service for unlawful, fraudulent or prohibited activity —
          including money laundering, terrorist financing, sanctions evasion, gambling where
          prohibited, or any activity that harms the Service, our partners or other users. We may
          suspend or close accounts that breach these rules and report activity to relevant
          authorities where we are legally required to do so.
        </p>
      </Section>

      <Section title="6. AI features">
        <p>
          MetricAi and related AI features (including document generation, chat, image and video
          generation) are provided subject to plan limits and fair use. AI output may be inaccurate
          and should not be treated as professional advice. Do not submit confidential or personal
          data of third parties to AI features without a lawful basis for doing so.
        </p>
      </Section>

      <Section title="7. Intellectual property">
        <p>
          The Service, including its software, design, logos and content, is owned by MetriCorex
          Limited or its licensors and is protected by intellectual property laws. We grant you a
          limited, non-exclusive, revocable licence to use the Service for its intended purpose.
          You retain ownership of the content you create and upload, and grant us the limited
          licence needed to host, process and display it in order to operate the Service.
        </p>
      </Section>

      <Section title="8. Availability, suspension and termination">
        <p>
          We aim for high availability but do not guarantee uninterrupted service. We may suspend
          or discontinue all or part of the Service for maintenance, security, legal or risk
          reasons. You may stop using the Service and close your account at any time; provisions
          that by their nature should survive termination (including ownership, disclaimers and
          liability limits) will survive.
        </p>
      </Section>

      <Section title="9. Disclaimers and limitation of liability">
        <p>
          The Service is provided "as is" and "as available" without warranties of any kind, except
          as expressly stated. To the maximum extent permitted by law, Metricorex will not be
          liable for indirect, incidental, special, consequential or punitive damages, or for loss
          of profits, data or goodwill. Our aggregate liability for claims relating to the Service
          will not exceed the fees you paid to us in the twelve months preceding the claim
          (or, for wallet-related claims, the amount involved in the affected transaction).
        </p>
      </Section>

      <Section title="10. Changes and governing law">
        <p>
          We may update these Terms from time to time; the "Last updated" date above will change
          and significant changes will be communicated through the Service. Continued use after an
          update constitutes acceptance. These Terms are governed by the laws of the Federal
          Republic of Nigeria, without regard to conflict-of-law rules. Questions? Contact our
          support desk from the app or email our support team.
        </p>
      </Section>
    </StaticPage>
  );
}
