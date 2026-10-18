// Who can see which menu entry – same rules as the old nav-sidebar.php.
//   Client      (old User1)  → whole Accounting menu + Admin (Settings, Team)
//   ClientStaff (old User3)  → only the modules ticked in their access rights (m_menu_data ids)
//   Staff       (IGB, STAFF) → Accounting menu + Admin + the IMS menu filtered by user type
// Needs these fields on the logged-in user (from /api/login and /api/me):
//   type ("Client" | "ClientStaff" | "Staff"), rights (number[]), user_type_id, designation_id
import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { NAV } from "./routesMeta";

const typeOf = (user) => user?.type || "Client";

function allowed(user, node) {
  const type = typeOf(user);
  if (node.only && !node.only.includes(type)) return false;

  if (type === "ClientStaff" && node.m != null) {
    const rights = (user?.rights || []).map(Number);
    if (!rights.includes(Number(node.m))) return false;
  }
  if (type === "Staff") {
    const ut = Number(user?.user_type_id);
    if (node.types && !node.types.includes(ut)) return false;
    if (node.notTypes && node.notTypes.includes(ut)) return false;
    if (node.designation && !node.designation.includes(Number(user?.designation_id))) return false;
  }
  return true;
}

/** the menu this user may see (empty groups and sections are dropped) */
export function navFor(user) {
  return NAV.filter((s) => allowed(user, s))
    .map((s) => ({
      ...s,
      entries: s.entries
        .filter((e) => allowed(user, e))
        .map((e) => (e.group ? { ...e, items: e.items.filter((i) => allowed(user, i)) } : e))
        .filter((e) => !e.group || e.items.length > 0),
    }))
    .filter((s) => s.entries.length > 0);
}

/** every path this user may open */
function pathsFor(user) {
  return navFor(user).flatMap((s) => s.entries.flatMap((e) => (e.group ? e.items.map((i) => i.to) : [e.to])));
}

/** all paths in the full menu (allowed or not) */
const ALL_NAV_PATHS = NAV.flatMap((s) => s.entries.flatMap((e) => (e.group ? e.items.map((i) => i.to) : [e.to])));

/**
 * Can this user open `pathname`? Detail pages and tabs (e.g. /task/sales/INV-1, /task/sales/pos)
 * follow the menu item they belong to (the longest menu path that starts the URL).
 */
export function canOpen(user, pathname) {
  const owner = ALL_NAV_PATHS.filter((p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/")))
    .sort((a, b) => b.length - a.length)[0] || (pathname === "/" ? "/" : null);
  if (!owner) return true;                       // not part of the menu (e.g. login helpers)
  return pathsFor(user).includes(owner);
}

/** React hook for the sidebar */
export function useNav() {
  const { user } = useAuth();
  return useMemo(() => navFor(user), [user]);
}
