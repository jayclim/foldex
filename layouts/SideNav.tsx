'use client'

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";

import { MaterialIcon } from "../components/MaterialIcon";
import { navItems } from "../utils/dashboardData";

type SideNavProps = {
  activePage: string;
};

export function SideNav({ activePage }: SideNavProps) {
  const router = useRouter();
  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    router.push(href);
  };

  return (
    <aside className="side-nav">
      <div className="brand">
        <h1>FOLDEX</h1>
        <p>Variant Evidence Review</p>
      </div>

      <nav className="primary-nav" aria-label="Primary">
        {navItems.map((item) => (
          <a
            className={
              item.label === activePage ? "nav-link active" : "nav-link"
            }
            href={item.href}
            key={item.label}
            onClick={(event) => navigate(event, item.href)}
          >
            <MaterialIcon name={item.icon} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="side-footer">
        <div className="system-card">
          <div className="system-icon">
            <MaterialIcon name="science" />
          </div>
          <div>
            <p className="system-name">RESEARCH DEMO</p>
            <p className="system-version">HACKATHON BUILD</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
