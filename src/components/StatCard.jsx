import Icon from "./Icons";

// tone: blue | teal | green | orange
export default function StatCard({ label, value, icon, tone = "blue", sub, onClick, active }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`stat stat-${tone} ${active ? "active" : ""}`} onClick={onClick} aria-pressed={onClick ? !!active : undefined}>
      <span className="stat-ring" aria-hidden="true" />
      <span className="stat-icon"><Icon name={icon} size={22} /></span>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </Tag>
  );
}

export function StatGrid({ children }) {
  return <div className="stats">{children}</div>;
}
