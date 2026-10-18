export default function Breadcrumbs({ items = [] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((c, i) => (
          <li key={i} aria-current={i === items.length - 1 ? "page" : undefined}>
            {c}
          </li>
        ))}
      </ol>
    </nav>
  );
}
