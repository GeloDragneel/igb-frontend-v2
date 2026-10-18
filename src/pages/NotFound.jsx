import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icons";
import { ALL_PAGES, SALES_TABS } from "../components/routesMeta";

// Every real page, used to suggest "Did you mean…?"
const KNOWN = [
  ...ALL_PAGES.map((p) => ({ to: p.to, label: p.label, crumbs: p.crumbs })),
  ...SALES_TABS.slice(1).map((t) => ({ to: t.to, label: t.label, crumbs: ["Task", "Sales", t.label] })),
];

// How many single-letter edits turn a into b (Levenshtein distance)
function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function suggestions(path) {
  const clean = path.toLowerCase().replace(/\/+$/, "") || "/";
  return KNOWN.map((p) => ({ ...p, score: distance(clean, p.to) }))
    .filter((p) => p.to !== "/" && p.score <= Math.max(2, Math.floor(p.to.length * 0.25)))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
}

export default function NotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const close = suggestions(pathname);

  return (
    <div className="card nf">
      <div className="nf-art" aria-hidden="true">
        <span>4</span>
        <span className="nf-zero"><Icon name="search" size={46} strokeWidth={2.2} /></span>
        <span>4</span>
      </div>

      <h2>Page not found</h2>
      <p className="nf-text">
        There's no page at <code>{pathname}</code>. Check the address for a typo, or pick a page below.
      </p>

      {close.length > 0 && (
        <div className="nf-suggest">
          <span className="nf-suggest-title">Did you mean</span>
          {close.map((s) => (
            <Link key={s.to} to={s.to} className="nf-suggest-item">
              <span>
                <strong>{s.label}</strong>
                <small>{s.crumbs.join(" / ")}</small>
              </span>
              <code>{s.to}</code>
              <Icon name="chevron" size={16} />
            </Link>
          ))}
        </div>
      )}

      <div className="nf-actions">
        <button className="btn" onClick={() => navigate(-1)}>Go back</button>
        <Link to="/" className="btn btn-primary"><Icon name="home" size={16} /> Go to Home</Link>
      </div>
    </div>
  );
}