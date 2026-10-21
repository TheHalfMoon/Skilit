"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SkilitIcon, type SkilitIconName } from "./skilit-icon";

const items: { label: string; href: string; icon: SkilitIconName }[] = [
  { label: "Overview", href: "/", icon: "overview" },
  { label: "Lens", href: "/lens", icon: "lens" },
  { label: "Gallery", href: "/gallery", icon: "gallery" },
  { label: "Patterns", href: "/patterns", icon: "patterns" },
  { label: "Flows", href: "/flows", icon: "flows" },
  { label: "Boards", href: "/boards", icon: "boards" },
];

function NavigationLinks({ current }: { current: string }) {
  return (
    <nav className="sk-navigation" aria-label="Skilit primary navigation">
      {items.map(({ href, label, icon }) => {
        const active = href === "/" ? current === href : current.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={active ? "sk-nav-link is-active" : "sk-nav-link"}
            aria-current={active ? "page" : undefined}
          >
            <SkilitIcon name={icon} size={19} />
            <span>{label}</span>
            {active ? <span className="sk-nav-active-mark" aria-hidden="true" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function SkilitShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname ?? "/";
  const title = items.find((item) => item.href === current)?.label ?? "Workspace";

  return (
    <div className="sk-app">
      <aside className="sk-sidebar">
        <div className="sk-sidebar-head">
          <Link href="/" className="sk-brand" aria-label="Skilit home">
            <span className="sk-brand-symbol">
              <Image src="/brand/skilit-mark-orange.svg" alt="" width={25} height={34} priority />
            </span>
            <span>skilit</span>
          </Link>
          <span className="sk-brand-caption">DESIGN INTELLIGENCE</span>
        </div>

        <div className="sk-nav-section-label">WORKSPACE</div>
        <NavigationLinks current={current} />

        <div className="sk-sidebar-bottom">
          <div className="sk-sidebar-info">
            <SkilitIcon name="shield" size={18} />
            <span>Local-first by design.<br />You own your workspace.</span>
          </div>
          <Link href="/support" className="sk-sidebar-support">
            <SkilitIcon name="book" size={18} />
            <span>Help & support</span>
            <SkilitIcon name="arrow-up-right" size={15} />
          </Link>
        </div>
      </aside>

      <div className="sk-main-column">
        <header className="sk-topbar">
          <div className="sk-breadcrumb">
            <span>Workspace</span>
            <span className="sk-breadcrumb-separator">/</span>
            <strong>{title}</strong>
          </div>
          <div className="sk-topbar-actions">
            <span className="sk-local-indicator"><span className="sk-local-dot" /> Local workspace</span>
            <Link href="/api/health" className="sk-health-link" title="Check the local service health">
              <SkilitIcon name="activity" size={16} />
              <span>Service health</span>
            </Link>
          </div>
        </header>
        <div className="sk-page-content">{children}</div>
      </div>
    </div>
  );
}
