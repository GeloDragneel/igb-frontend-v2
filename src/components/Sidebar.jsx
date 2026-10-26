import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icons";
import PeriodPicker from "./PeriodPicker";
import { NAV } from "./routesMeta";
import { useAuth, apiFetch } from "../context/AuthContext";
import { useToast } from "./Toast";
import "./Sidebar.css";

// user.type from AuthController::userPayload (UserStaff → "Staff", UserClient → "Client", UserClientStaff → "ClientStaff")
const USER_TYPES = {
  STAFF: "Staff",
  CLIENT: "Client",
  CLIENT_STAFF: "ClientStaff",
};

// Which sidebar sections belong to each mode
const MODES = {
  fems: { label: "FEMS", icon: "layers", sections: ["Accounting", "Admin"] },
  staff: { label: "STAFF", icon: "users", sections: ["Staff"] },
};

const MODE_KEY = "sidebar-mode";

const matches = (pathname, to) =>
  to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");

const linksOf = (e) => (e.group ? e.items.map((i) => i.to) : [e.to]);

const groupOf = (pathname) => {
  for (const s of NAV)
    for (const e of s.entries)
      if (e.group && e.items.some((i) => matches(pathname, i.to))) return e.group;
  return null;
};

// Which mode does the current URL belong to? (null = unknown page, e.g. /profile)
const modeOfPath = (pathname) => {
  for (const s of NAV)
    for (const e of s.entries)
      if (linksOf(e).some((to) => matches(pathname, to)))
        return MODES.staff.sections.includes(s.section) ? "staff" : "fems";
  return null;
};

const readSavedMode = () => {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m in MODES ? m : null;
  } catch {
    return null;
  }
};

// AuthController::staffAccess (m_user_staff_access): which Staff pages this login may see
function useStaffAccess(enabled, userId) {
  const [access, setAccess] = useState(null); // { all, paths }

  useEffect(() => {
    setAccess(null);
    if (!enabled) return;
    let alive = true;
    apiFetch("/staff-access")
      .then((a) => alive && setAccess(a))
      // On error / no access → every Staff page
      .catch(() => alive && setAccess({ switch: true, only: null, all: true, paths: [] }));
    return () => {
      alive = false;
    };
  }, [enabled, userId]);

  return access;
}

// Keep only the Staff pages listed in user_staff_access
function filterStaffSection(section, access) {
  if (access?.all || (access && !access.paths?.length)) return section; // no access → everything
  const ok = new Set(access?.paths ?? []); // still loading → empty
  return {
    ...section,
    entries: section.entries
      .map((e) => (e.group ? { ...e, items: e.items.filter((i) => ok.has(i.to)) } : e))
      .filter((e) => (e.group ? e.items.length : ok.has(e.to))),
  };
}

/* Team (m_user_client_staff) access rights: the ticked m_menu_data modules, sent at login as
   rights (ids) + right_paths (their pages) + right_names (their names). A client-staff login sees only those
   FEMS pages; NO rights ticked → everything. A menu item is allowed when its "m" id, its page or its name
   matches a ticked module – so it works whatever routesMeta / m_menu_data look like. */
// "Receivables" = "Receivable", "Charts of Account" = "Chart of Accounts" (singular / plural don't matter)
const norm = (v) => String(v ?? "").trim().toLowerCase().split(/\s+/).map((w) => w.replace(/s$/, "")).join(" ");
const rightsOf = (user) =>
  user?.type === USER_TYPES.CLIENT_STAFF && Array.isArray(user?.rights) && user.rights.length
    ? {
      ids: new Set(user.rights.map(Number)),
      paths: new Set((user.right_paths || []).map(String)),
      names: new Set((user.right_names || []).map(norm)),
    }
    : null;
const okRight = (rights, node) => {
  if (!rights) return true;
  if (node?.m != null && rights.ids.has(Number(node.m))) return true;
  if (node?.to && rights.paths.has(node.to)) return true;
  if (node?.label && rights.names.has(norm(node.label))) return true;
  return false;
};

function filterByRights(section, rights) {
  if (!rights) return section;
  return {
    ...section,
    // a group stays when at least one of its pages is ticked (ticking a page is enough)
    entries: section.entries
      .filter((e) => e.group || okRight(rights, e))
      .map((e) => (e.group ? { ...e, items: e.items.filter((i) => okRight(rights, i)) } : e))
      .filter((e) => !e.group || e.items.length),
  };
}

// the menu node (entry or group item) that owns this URL
function nodeOf(pathname) {
  let best = null;
  for (const s of NAV)
    for (const e of s.entries) {
      const nodes = e.group ? e.items.map((i) => ({ node: i, parent: e })) : [{ node: e, parent: null }];
      for (const n of nodes) {
        if (matches(pathname, n.node.to) && (!best || n.node.to.length > best.node.to.length)) best = n;
      }
    }
  return best;
}

function buildNav(mode, access, userType, rights = null) {
  return NAV.filter((s) => MODES[mode].sections.includes(s.section))
    .map((s) => (s.section === "Staff" ? filterStaffSection(s, access) : s))
    .map((s) => (s.section === "Staff" ? s : filterByRights(s, rights)))
    .filter((s) => s.entries.length);
}

// Is this URL allowed for this login? null = still loading (don't decide yet)
function canOpen(pathname, userType, access, only, rights = null) {
  const m = modeOfPath(pathname);
  if (!m) return true;                                   // not a sidebar page (e.g. /profile)
  if (only && m !== only) return false;                  // Client / client staff → FEMS only · Staff without clients → STAFF only
  if (m !== "staff") {
    if (!rights) return true;
    const n = nodeOf(pathname);                          // client staff: the page must be ticked in Team
    return !n || okRight(rights, n.node);
  }
  if (!access) return null;
  if (access.all || !access.paths?.length) return true;  // no access set → everything
  return access.paths.some((to) => matches(pathname, to));
}

const firstLink = (nav) => {
  const e = nav[0]?.entries[0];
  return e ? linksOf(e)[0] : null;
};

// the open tabs (OpenTabs keeps them in sessionStorage "igb-tabs:<login>")
// → the last one you used on that side, so switching FEMS ⇄ STAFF goes back to where you were
function lastTabOf(mode, user, access, only) {
  try {
    const tabs = JSON.parse(sessionStorage.getItem(`igb-tabs:${user?.id ?? user?.username ?? "guest"}`) || "[]");
    const mine = (Array.isArray(tabs) ? tabs : [])
      .filter((t) => t?.key && t?.path && modeOfPath(t.key) === mode && canOpen(t.key, user?.type, access, only, rightsOf(user)) === true)
      .sort((a, b) => (b.used || 0) - (a.used || 0));
    return mine[0]?.path || null;
  } catch {
    return null;
  }
}

// logo: public/igb-logo.png (falls back to the old "IGB" mark if the file is missing)
function BrandLogo() {
  const [bad, setBad] = useState(false);
  if (bad) return <span className="brand-mark">IGB</span>;
  return (
    <img className="brand-logo" src="/igb-logo.png" alt="IGB" onError={() => setBad(true)}
      style={{ width: 40, height: 40, flex: "none", objectFit: "contain", borderRadius: 8 }} />
  );
}

export default function Sidebar({ open, collapsed, onNavigate, onReady }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // /staff-access decides the switch:
  //   UserClient / UserClientStaff (Team) → FEMS only (client staff: only the pages ticked in Team, none ticked → all)
  //   UserStaff  → switch if clients are assigned (or IT Officer / CEO / Supervisor / Audit Supervisor), else STAFF only
  const isStaffType = user?.type === USER_TYPES.STAFF;
  const access = useStaffAccess(isStaffType, user?.id);
  const canSwitch = isStaffType && !!access?.switch;
  const only = !isStaffType ? "fems" : access?.only || null;
  // Team rights; if they match NO FEMS page at all (menu names / pages set up differently) show everything
  // instead of an empty menu, so nobody is locked out
  const rights = useMemo(() => {
    const r = rightsOf(user);
    if (!r) return null;
    return buildNav("fems", null, user?.type, r).length ? r : null;
  }, [user]);

  const [savedMode, setSavedMode] = useState(
    () => modeOfPath(pathname) || readSavedMode() || "fems"
  );
  const mode = only || savedMode;

  // Opening a page directly (link, refresh) selects the matching mode
  useEffect(() => {
    const m = modeOfPath(pathname);
    if (m && !only) setSavedMode(m);
  }, [pathname, only]);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, savedMode);
    } catch {
      /* ignore */
    }
  }, [savedMode]);

  // until we know who this is (and, for staff, their /staff-access), show no menu at all
  const deciding = !user || (isStaffType && !access);
  const nav = useMemo(() => (deciding ? [] : buildNav(mode, access, user?.type, rights)), [deciding, mode, access, user?.type, rights]);

  const activeGroup = groupOf(pathname);
  const [expanded, setExpanded] = useState(activeGroup); // one group open at a time

  useEffect(() => {
    if (activeGroup) setExpanded(activeGroup);
  }, [activeGroup]);

  // switching to STAFF before user_staff_access has loaded → open its first page once it arrives
  const pendingNav = useRef(false);

  const switchTo = (m) => {
    if (m === mode) return;
    setSavedMode(m);
    setExpanded(null);
    if (m === "staff" && !access) {
      pendingNav.current = true;
      return;
    }
    // last tab you used on that side; its start page only when it has no tabs yet
    const target = lastTabOf(m, user, access, only) || firstLink(buildNav(m, access, user?.type, rights));
    if (target) {
      navigate(target);
      onNavigate?.();
    }
  };

  useEffect(() => {
    if (!pendingNav.current || !access || mode !== "staff") return;
    pendingNav.current = false;
    const target = lastTabOf("staff", user, access, only) || firstLink(buildNav("staff", access, user?.type, rights));
    if (target) {
      navigate(target);
      onNavigate?.();
    }
  }, [access, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // typing a URL you have no access to → back to your first allowed page
  const notify = useToast();
  useEffect(() => {
    const isStaffType = user?.type === USER_TYPES.STAFF;
    if (!user || (isStaffType && !access)) return;       // wait for /staff-access
    if (canOpen(pathname, user.type, access, only, rights) !== false) return;
    notify("You don't have access to that page.", "error");
    const home = firstLink(buildNav(only || modeOfPath(pathname) || "fems", access, user.type, rights))
      || firstLink(buildNav(only || "fems", access, user.type, rights))
      || "/profile";
    navigate(home === pathname ? "/profile" : home, { replace: true });
  }, [pathname, user?.type, access, only, rights]); // eslint-disable-line react-hooks/exhaustive-deps

  const staffLoading = deciding;

  // tell the Layout when the page may be shown (login known + this URL allowed)
  const ready = !deciding && canOpen(pathname, user.type, access, only, rights) === true;
  useEffect(() => {
    onReady?.(ready);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className={`sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`} aria-label="Main navigation">
      <div className="brand">
        <BrandLogo />
        <span className="brand-name">IGB</span>
        <span className="brand-badge">v1.0</span>
      </div>

      {canSwitch && (
        <div className="mode-switch" data-mode={mode} role="tablist" aria-label="Switch workspace">
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              className={`mode-switch-btn ${mode === key ? "active" : ""}`}
              onClick={() => switchTo(key)}
              title={m.label}
            >
              <Icon name={m.icon} size={15} className="mode-switch-icon" />
              <span className="mode-switch-full">{m.label}</span>
              <span className="mode-switch-short">{m.label[0]}</span>
            </button>
          ))}
        </div>
      )}

      <PeriodPicker />

      <nav className="side-nav">
        {staffLoading && <div className="side-empty">Loading…</div>}
        {mode === "staff" && access && nav.length === 0 && (
          <div className="side-empty">No Staff pages assigned to your account.</div>
        )}

        {nav.map((section) => (
          <div key={section.section} className="side-section">
            <div className="side-heading">{section.section}</div>

            {section.entries.map((e) =>
              e.group ? (
                <div key={e.group} className="side-group">
                  <button
                    className={`side-link ${expanded === e.group ? "open" : ""} ${activeGroup === e.group ? "has-active" : ""}`}
                    onClick={() => setExpanded(expanded === e.group ? null : e.group)}
                    aria-expanded={expanded === e.group}
                  >
                    <Icon name={e.icon} size={19} />
                    <span>{e.group}</span>
                    <Icon name={expanded === e.group ? "down" : "chevron"} size={15} className="side-caret" />
                  </button>

                  {expanded === e.group && (
                    <ul className="side-items">
                      {e.items.map((i) => (
                        <li key={i.to}>
                          <NavLink to={i.to} onClick={onNavigate} className={({ isActive }) => (isActive ? "active" : "")}>
                            {i.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <NavLink
                  key={e.to}
                  to={e.to}
                  end
                  onClick={() => {
                    setExpanded(null);
                    onNavigate?.();
                  }}
                  className={({ isActive }) => `side-link ${isActive ? "single-active" : ""}`}
                >
                  <Icon name={e.icon} size={19} />
                  <span>{e.label}</span>
                </NavLink>
              )
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}