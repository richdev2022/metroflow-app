import StaticPage, { Section } from "@/components/StaticPageShell";

export default function About() {
  return (
    <StaticPage
      title="About Metricorex — The All-in-One Business Suite"
      description="Metricorex is one connected suite where your whole business runs: manage work, meet your team, move money, get paid and grow — all from a single app."
    >
      <p>
        Metricorex is an <strong>all-in-one business suite</strong> for founders, teams, freelancers
        and growing companies — available on web, iOS and Android. Instead of stitching together five
        disconnected tools (a task app here, a meeting app there, a separate bank app for money), you
        get <strong>one login, one workspace, one wallet</strong> where everything is already
        connected. Plan the work, meet the team, pay the bills, invoice the client, collect the
        recurring revenue — then let MetricAi summarise it all. That is the whole point: it is not a
        bundle of apps; it is <strong>one suite that works as one product</strong>.
      </p>

      <Section title="Five suites inside one product">
        <p>
          Every capability in Metricorex belongs to a pillar, and every pillar talks to the others.
          That is what makes it feel like one product rather than a shopping list of features.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Workspace</strong> — run the actual work: tasks, kanban board, backlog and
            sprints, epics, ideas and a shared activity trail, so nothing gets lost in chat threads.
          </li>
          <li>
            <strong>Team</strong> — crystal-clear video meetings and calls, direct and group chat,
            recordings, a shared calendar and performance ranking — communication that lives next to
            the work it's about.
          </li>
          <li>
            <strong>Finance</strong> — business and personal wallets with dedicated virtual account
            numbers, local and international transfers, bulk disbursements and one-click payroll runs
            for your whole team.
          </li>
          <li>
            <strong>Get Paid</strong> — the revenue side of the suite: shareable payment links,
            itemised smart invoices with hosted checkout, a public storefront for your products, and
            recurring billing that charges subscribers automatically.
          </li>
          <li>
            <strong>MetricAi</strong> — your built-in AI copilot: meeting notes and summaries, drafts
            and product documentation, business insights, images and video — priced in simple credit
            packs.
          </li>
        </ul>
      </Section>

      <Section title="How it all flows together">
        <p>
          Here's a real day on Metricorex. You scope a project as <em>epics and tasks</em>, then
          track delivery on the <em>board</em>. When the milestone is ready, you send a{" "}
          <em>smart invoice</em> — the client pays through a hosted checkout and the money lands in
          your <em>wallet</em> automatically. Your <em>payroll run</em> pays the team the same day,
          and your <em>recurring billing</em> plan quietly collects next month's retainer without
          you lifting a finger. Meanwhile MetricAi turns the meeting you forgot to take notes in into{" "}
          <em>action items</em>. One connected loop — work, communication and money in the same
          place.
        </p>
      </Section>

      <Section title="Get paid, every way">
        <p>
          The Get Paid suite is built for businesses that want predictable cash flow. Share a{" "}
          <strong>payment link</strong> for anything. Send an <strong>invoice</strong> with line
          items and tax. List your products in your <strong>Storefront</strong> and let customers
          check out with one link. Put service retainers on <strong>auto-pilot with recurring
          billing</strong> — daily, weekly or monthly plans that charge wallet holders automatically
          and email secure payment links to everyone else. Every successful payment settles straight
          into your wallet, with transparent fees and clear records.
        </p>
      </Section>

      <Section title="Our mission">
        <p>
          We believe small and growing businesses deserve the same quality of tooling as large
          corporations — without the enterprise price tag or the integration headache. One suite
          means one subscription, one vendor, one support line and one place where everything
          finally adds up. Every feature we ship is designed to save you time, keep your team
          aligned and move your money safely. Security, transparency and reliability come first;
          everything else is negotiable.
        </p>
      </Section>

      <Section title="Get started">
        <p>
          Creating an account takes less than two minutes. Start on the free trial, invite your
          team, fund your wallet and run your entire business — work, team and money — from one
          beautiful app.
        </p>
      </Section>
    </StaticPage>
  );
}
