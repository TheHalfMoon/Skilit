import Image from "next/image";
import Link from "next/link";
import { SkilitIcon, type SkilitIconName } from "../components/skilit-icon";

const modules: {
  number: string;
  title: string;
  description: string;
  href: string;
  icon: SkilitIconName;
  accent: string;
}[] = [
  {
    number: "01",
    title: "Lens",
    description: "Turn a URL into a structured, evidence-grounded design report and Build Kit.",
    href: "/lens",
    icon: "lens",
    accent: "peach",
  },
  {
    number: "02",
    title: "Gallery",
    description: "Explore products, versions and their connected visual references.",
    href: "/gallery",
    icon: "gallery",
    accent: "lavender",
  },
  {
    number: "03",
    title: "Patterns",
    description: "Find reusable design patterns, structure and supporting evidence.",
    href: "/patterns",
    icon: "patterns",
    accent: "mint",
  },
  {
    number: "04",
    title: "Boards",
    description: "Keep the right references together in your own workspace.",
    href: "/boards",
    icon: "boards",
    accent: "blue",
  },
  {
    number: "05",
    title: "Flows",
    description: "Examine captured journeys and consented replay sessions.",
    href: "/flows",
    icon: "flows",
    accent: "sand",
  },
];

const steps: { num: string; icon: SkilitIconName; title: string; description: string }[] = [
  { num: "01", icon: "lens", title: "Capture", description: "Start with a URL or an existing design reference." },
  { num: "02", icon: "layers", title: "Understand", description: "Organize structure, patterns and the evidence behind them." },
  { num: "03", icon: "terminal", title: "Build", description: "Reuse results through the workspace, SDK and agent interfaces." },
];

export default function Home() {
  return (
    <main className="sk-dashboard">
      <section className="sk-welcome" aria-labelledby="sk-welcome-title">
        <div>
          <div className="sk-eyebrow">
            <span className="sk-eyebrow-line" aria-hidden="true" />
            THE DESIGN INTELLIGENCE WORKSPACE
          </div>
          <h1 id="sk-welcome-title">
            Make better things.<br />
            <span>From better evidence.</span>
          </h1>
          <p>
            One intentional workspace for capturing interfaces, discovering patterns,
            and translating design inspiration into reusable knowledge — for people and agents.
          </p>
          <div className="sk-welcome-actions">
            <Link href="/lens" className="sk-button sk-button-primary">
              Explore Lens <SkilitIcon name="arrow-up-right" size={18} />
            </Link>
            <Link href="/gallery" className="sk-button sk-button-secondary">
              Browse Gallery <SkilitIcon name="arrow-right" size={17} />
            </Link>
          </div>
        </div>
        <span className="sk-welcome-index" aria-hidden="true">SK / 01</span>
      </section>

      <section className="sk-intro-grid" aria-label="Skilit design system overview">
        <div className="sk-brand-panel">
          <div className="sk-brand-panel-top">
            <span>THE skilit SYSTEM</span>
            <SkilitIcon name="sparkles" size={20} />
          </div>
          <Image
            className="sk-hero-lockup"
            src="/brand/skilit-lockup-orange.svg"
            alt="skilit logo, featuring the curved black S mark"
            width={1024}
            height={384}
            priority
          />
          <div className="sk-brand-panel-bottom">
            <span>A single visual language.</span>
            <span>For everything you create.</span>
          </div>
        </div>

        <div className="sk-principle-panel">
          <div className="sk-principle-header">
            <span className="sk-panel-label">OUR APPROACH</span>
            <div className="sk-principle-icon"><SkilitIcon name="compass" size={25} /></div>
          </div>
          <h2>Less searching.<br />More making.</h2>
          <p>
            Collect what matters, understand why it works, and bring that knowledge
            directly into your workflow.
          </p>
          <div className="sk-principle-foot">
            <span><SkilitIcon name="shield" size={17} /> Local-first</span>
            <span><SkilitIcon name="terminal" size={17} /> Agent-ready</span>
          </div>
        </div>
      </section>

      <section className="sk-tool-section" aria-labelledby="sk-tools-title">
        <div className="sk-section-heading">
          <div>
            <div className="sk-section-kicker">THE WORKSPACE</div>
            <h2 id="sk-tools-title">Everything in its place.</h2>
            <p>Purpose-built tools for every part of the design discovery process.</p>
          </div>
          <span className="sk-section-counter">01 / EXPLORE</span>
        </div>

        <div className="sk-tools-grid">
          {modules.map(({ number, title, description, href, icon, accent }) => (
            <Link className="sk-tool-card" href={href} key={href}>
              <div className="sk-tool-card-head">
                <span className={`sk-tool-icon sk-accent-${accent}`}>
                  <SkilitIcon name={icon} size={26} />
                </span>
                <span className="sk-tool-number">{number} / 05</span>
              </div>
              <div className="sk-tool-card-copy">
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
              <span className="sk-tool-card-foot">
                Open workspace <SkilitIcon name="arrow-up-right" size={18} />
              </span>
            </Link>
          ))}
          <div className="sk-tool-note">
            <div className="sk-tool-note-icon"><SkilitIcon name="grid-plus" size={27} /></div>
            <h3>One connected toolkit.</h3>
            <p>Every reference has a place. Every tool is part of the same Skilit workflow.</p>
            <span className="sk-tool-note-rule" aria-hidden="true" />
          </div>
        </div>
      </section>

      <section className="sk-workflow-section" aria-labelledby="sk-workflow-title">
        <div className="sk-section-heading">
          <div>
            <div className="sk-section-kicker">FROM FIRST LOOK TO FINAL HANDOFF</div>
            <h2 id="sk-workflow-title">A clearer path from idea to insight.</h2>
          </div>
          <span className="sk-section-counter">02 / WORKFLOW</span>
        </div>
        <div className="sk-steps">
          {steps.map(({ num, icon, title, description }) => (
            <div className="sk-step" key={num}>
              <div className="sk-step-top">
                <span>{num}</span>
                <SkilitIcon name={icon} size={24} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sk-access-notice" aria-labelledby="sk-access-heading">
        <div className="sk-access-notice-symbol"><SkilitIcon name="shield" size={21} /></div>
        <div>
          <h2 id="sk-access-heading">Private by default. Ready when you are.</h2>
          <p>
            Workspace views require an authorized session. Sign in with your
            installation account in the browser, or use an
            operator-provisioned bearer token for agent and API access. No
            paid AI account is required.
          </p>
          <p>
            <Link href="/login">Sign in</Link>{" · "}
            <Link href="/signup">Create the first owner account</Link>
          </p>
        </div>
      </section>

      <footer className="sk-dashboard-footer">
        <span>© Skilit · Design intelligence for people & agents</span>
        <nav aria-label="Documentation and service links">
          <Link href="/api/health">Health</Link>
          <Link href="/api/registry">Registry</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </nav>
      </footer>
    </main>
  );
}
