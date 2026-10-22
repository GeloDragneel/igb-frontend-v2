import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import OpenTabs, { KeepAliveOutlet } from "./OpenTabs";
import { metaFor } from "./routesMeta";
import SeasonTheme from "./SeasonTheme";
export default function Layout() {
  const { pathname } = useLocation();
  const meta = metaFor(pathname) || { title: "Page not found", crumbs: ["Accounting", "Not found"] };
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Sidebar says when the login + access are known and this URL is allowed.
  // Until then nothing is shown (no flash of Home / Accounting on login).
  const [ready, setReady] = useState(false);
  const [everReady, setEverReady] = useState(false);
  useEffect(() => {
    if (ready) setEverReady(true);
  }, [ready]);

  useEffect(() => {
    document.title = `IGB Accounting · ${meta.title}`;
    setMobileOpen(false);
  }, [pathname, meta.title]);

  const toggleMenu = () => (window.innerWidth <= 960 ? setMobileOpen((v) => !v) : setCollapsed((v) => !v));

  return (
    <div className="app">
      <Sidebar open={mobileOpen} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} onReady={setReady} />
      {/* <SeasonTheme /> */}
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      <div className="main">
        <Header title={meta.title} onMenu={toggleMenu} />

        {/* breadcrumbs are shown inside each tab */}
        <div className="crumbbar">
          <OpenTabs ready={ready} />
        </div>

        <main className="content">
          {/* pages mount only after the first OK; later checks just hide them (open tabs are kept) */}
          {everReady && (
            <div style={{ display: ready ? "contents" : "none" }}>
              <KeepAliveOutlet />
            </div>
          )}
          {!ready && <div className="page-loading" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading…</div>}
        </main>
      </div>
    </div>
  );
}