import StaticPage, { Section } from "@/components/StaticPageShell";

export default function About() {
  return (
    <StaticPage
      title="About Metricorex"
      description="One app for Personal and Business — work, communication and money, all in one place."
    >
      <p>
        Metricorex is an all-in-one Business OS built for teams, founders, freelancers and
        individuals who are tired of stitching five different tools together. We combine project
        and task management, video calls and meetings, team chat with AI-powered notes, payroll and
        a complete fintech stack — personal and business wallets, bulk transfers, international
        payouts and payment links — into a single, beautifully simple platform available on web,
        iOS and Android.
      </p>

      <Section title="Built for Personal and Business">
        <p>
          What started as a business collaboration tool has grown into a platform that serves both
          sides of your life. With <strong>Personal</strong>, you get your own wallet, budget and
          transfers. With <strong>Business</strong>, you get a shared company workspace: teams,
          boards and epics, meetings and calls, payroll runs, a business wallet with dedicated
          virtual account numbers, bulk salary payments and international payouts. One account, one
          login — switch context without switching apps.
        </p>
      </Section>

      <Section title="What you can do with Metricorex">
        <ul className="list-disc space-y-2 pl-5">
          <li>Plan and track work with tasks, backlogs, epics, sprints and a kanban board.</li>
          <li>Meet your team through crystal-clear video calls, meetings and team chat.</li>
          <li>Capture meeting notes and reports automatically with AI.</li>
          <li>Ask MetricAi — our built-in assistant — for chat, images and video generation.</li>
          <li>Run payroll for your whole team in a few clicks, including bulk transfers.</li>
          <li>Send money locally or internationally with transparent fees and live quotes.</li>
          <li>Get paid faster with shareable payment links that settle straight to your wallet.</li>
          <li>Monitor your money with dedicated personal and business wallets and statements.</li>
        </ul>
      </Section>

      <Section title="Our mission">
        <p>
          We believe small and growing businesses deserve the same quality of tooling as large
          corporations — without the enterprise price tag or the integration headache. Every
          feature we ship is designed to save you time, keep your team aligned and move your money
          safely. Security, transparency and reliability come first; everything else is negotiable.
        </p>
      </Section>

      <Section title="Get started">
        <p>
          Creating an account takes less than two minutes. Start on the free trial, invite your
          team, and see why thousands of users run their Personal and Business life on Metricorex.
        </p>
      </Section>
    </StaticPage>
  );
}
