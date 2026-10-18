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

// Admin → Team: UserStaff only
const STAFF_ONLY_LINKS = ["/team"];

function buildNav(mode, access, userType) {
  return NAV.filter((s) => MODES[mode].sections.includes(s.section))
    .map((s) => (s.section === "Staff" ? filterStaffSection(s, access) : s))
    .map((s) => userType === USER_TYPES.STAFF ? s : { ...s, entries: s.entries.filter((e) => e.group || !STAFF_ONLY_LINKS.includes(e.to)) })
    .filter((s) => s.entries.length);
}

// Is this URL allowed for this login? null = still loading (don't decide yet)
function canOpen(pathname, userType, access, only) {
  if (STAFF_ONLY_LINKS.some((to) => matches(pathname, to)) && userType !== USER_TYPES.STAFF) return false;
  const m = modeOfPath(pathname);
  if (!m) return true;                                   // not a sidebar page (e.g. /profile)
  if (only && m !== only) return false;                  // Client → FEMS only · Staff without clients → STAFF only
  if (m !== "staff") return true;
  if (!access) return null;
  if (access.all || !access.paths?.length) return true;  // no access set → everything
  return access.paths.some((to) => matches(pathname, to));
}

const firstLink = (nav) => {
  const e = nav[0]?.entries[0];
  return e ? linksOf(e)[0] : null;
};

export default function Sidebar({ open, collapsed, onNavigate, onReady }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // /staff-access decides the switch:
  //   UserClient → FEMS only · UserClientStaff → switch
  //   UserStaff  → switch if clients are assigned (or IT Officer / CEO / Supervisor / Audit Supervisor), else STAFF only
  const isStaffType = user?.type === USER_TYPES.STAFF || user?.type === USER_TYPES.CLIENT_STAFF;
  const access = useStaffAccess(isStaffType, user?.id);
  const canSwitch = isStaffType && !!access?.switch;
  const only = !isStaffType ? "fems" : access?.only || null;

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
  const nav = useMemo(() => (deciding ? [] : buildNav(mode, access, user?.type)), [deciding, mode, access, user?.type]);

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
    const first = firstLink(buildNav(m, access, user?.type));
    if (first) {
      navigate(first);
      onNavigate?.();
    }
  };

  useEffect(() => {
    if (!pendingNav.current || !access || mode !== "staff") return;
    pendingNav.current = false;
    const first = firstLink(buildNav("staff", access, user?.type));
    if (first) {
      navigate(first);
      onNavigate?.();
    }
  }, [access, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // typing a URL you have no access to → back to your first allowed page
  const notify = useToast();
  useEffect(() => {
    const isStaffType = user?.type === USER_TYPES.STAFF || user?.type === USER_TYPES.CLIENT_STAFF;
    if (!user || (isStaffType && !access)) return;       // wait for /staff-access
    if (canOpen(pathname, user.type, access, only) !== false) return;
    notify("You don't have access to that page.", "error");
    const home = firstLink(buildNav(only || modeOfPath(pathname) || "fems", access, user.type))
      || firstLink(buildNav(only || "fems", access, user.type))
      || "/profile";
    navigate(home === pathname ? "/profile" : home, { replace: true });
  }, [pathname, user?.type, access, only]); // eslint-disable-line react-hooks/exhaustive-deps

  const staffLoading = deciding;

  // tell the Layout when the page may be shown (login known + this URL allowed)
  const ready = !deciding && canOpen(pathname, user.type, access, only) === true;
  useEffect(() => {
    onReady?.(ready);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className={`sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`} aria-label="Main navigation">
      <div className="brand">
        <span className="brand-mark">IGB</span>
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