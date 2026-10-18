import { NavLink } from "react-router-dom";

// Page tabs: each tab is its own route.
// tabs: [{ to, label, end? }]
export default function PageTabs({ tabs }) {
    return (
        <nav className="tabs page-tabs" aria-label="Page sections">
            {tabs.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? "on" : ""}`}>
                    {t.label}
                </NavLink>
            ))}
        </nav>
    );
}

// A sticky card with only the tabs (for pages that have no search bar)
export function TabsCard({ tabs, children }) {
    return (
        <div className={`card search-card sticky has-tabs ${children ? "" : "tabs-only"}`}>
            <PageTabs tabs={tabs} />
            {children}
        </div>
    );
}