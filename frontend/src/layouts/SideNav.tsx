import type { MouseEvent } from "react";

import { MaterialIcon } from "../components/MaterialIcon";
import { navItems } from "../utils/dashboardData";

type SideNavProps = {
  activePage: string;
};

export function SideNav({ activePage }: SideNavProps) {
  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <aside className="side-nav">
      <div className="brand">
        <h1>FOLDEX</h1>
        <p>Genomic Intelligence</p>
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
        <a className="nav-link help-link" href="#">
          <span> </span>
          <MaterialIcon name="help" />
          <span>Help</span>
        </a>
        <div className="system-card">
          <div className="system-icon">
            <MaterialIcon name="science" />
          </div>
          <div>
            <p className="system-name">SYS_NODE_04</p>
            <p className="system-version">LAB_SYSTEM_V2</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
