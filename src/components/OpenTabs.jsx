import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useOutlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import * as routes from "./routesMeta";
import "./OpenTabs.css";

/*
 * Browser-like page tabs.
 *  - Opening a sidebar menu adds a tab (or switches to it if it is already open).
 *  - Moving inside a page (sub tabs, invoice detail, ?filters) stays in the same tab,
 *    and the tab remembers where you were, so switching back returns you there.
 *  - Close with ×, middle click, or right click → Close / Close others / Close to the right / Close all.
 *  - Drag a tab to reorder. Tabs are kept per login for this browser tab (sessionStorage).
 */

const MAX_TABS = 12;
const SIDES = ["Accounting", "Admin", "Staff"]; // not shown in the tab
const HOME = "/";

// every sidebar page as { to, label } (works whether routesMeta exports ALL_PAGES or only NAV)
function listPages() {
    if (Array.isArray(routes.ALL_PAGES)) return routes.ALL_PAGES.filter((p) => p && p.to);
    const out = [];
    (Array.isArray(routes.NAV) ? routes.NAV : []).forEach((s) =>
        (s?.entries || []).forEach((e) => {
            if (Array.isArray(e?.items)) e.items.forEach((i) => i?.to && out.push({ to: i.to, label: i.label }));
            else if (e?.to) out.push({ to: e.to, label: e.label });
        })
    );
    return out;
}
// start page = first menu of the side you are on (FEMS → Home "/", STAFF → Dashboard "/dashboard")
const matches = (to, pathname) => (to === HOME ? pathname === HOME : pathname === to || pathname.startsWith(to + "/"));
function startFor(pathname) {
    const nav = Array.isArray(routes.NAV) ? routes.NAV : [];
    const first = (sec) => {
        const e = sec?.entries?.[0];
        return e?.to || e?.items?.[0]?.to || null;
    };
    const inSec = (sec) => (sec?.entries || []).some((e) => (Array.isArray(e.items) ? e.items.some((i) => matches(i.to, pathname)) : e.to && matches(e.to, pathname)));
    const staff = nav.find((sec) => sec.section === "Staff");
    if (staff && inSec(staff)) return first(staff) || HOME;
    return first(nav[0]) || HOME;
}
// which side a page belongs to: "staff" (STAFF menu), "fems" (Accounting / Admin), null (e.g. My profile → both)
function sideOf(pathname) {
    const nav = Array.isArray(routes.NAV) ? routes.NAV : [];
    const inSec = (sec) => (sec?.entries || []).some((e) => (Array.isArray(e.items) ? e.items.some((i) => matches(i.to, pathname)) : e.to && matches(e.to, pathname)));
    const sec = nav.find(inSec);
    if (!sec) return null;
    return sec.section === "Staff" ? "staff" : "fems";
}
const metaFor = (path) => (typeof routes.metaFor === "function" ? routes.metaFor(path) : null);
const ALL_PAGES = listPages();

// longest sidebar path that matches the current url → that is the tab
const PAGES = [...ALL_PAGES].sort((a, b) => b.to.length - a.to.length);
function pageOf(pathname) {
    if (pathname === HOME) return ALL_PAGES.find((p) => p.to === HOME) || { to: HOME, label: "Home" };
    return (
        PAGES.find((p) => p.to !== HOME && (pathname === p.to || pathname.startsWith(p.to + "/"))) || {
            to: pathname,
            label: metaFor(pathname)?.title || pathname.split("/").filter(Boolean).pop() || "Page",
        }
    );
}

const read = (key) => {
    try {
        const v = JSON.parse(sessionStorage.getItem(key) || "null");
        return Array.isArray(v) ? v.filter((t) => t && t.key && t.path) : [];
    } catch {
        return [];
    }
};
const write = (key, tabs) => {
    try { sessionStorage.setItem(key, JSON.stringify(tabs)); } catch { /* ignore */ }
};

/* ---------- keep-alive: pages stay mounted while their tab is open ---------- */
const listeners = new Set();
let openKeys = null;
function publish(keys) {
    openKeys = keys;
    listeners.forEach((f) => f(keys));
}

/**
 * Use instead of <Outlet /> in Layout.
 * Each open tab keeps its page mounted (just hidden), so switching tabs does NOT
 * reload the page or call the API again. Closing a tab unmounts its page.
 */
export function KeepAliveOutlet() {
    const outlet = useOutlet();
    const { pathname } = useLocation();
    const key = pageOf(pathname).to;
    const cache = useRef(new Map());
    const scroll = useRef(new Map());
    const keyRef = useRef(key);
    const [, force] = useState(0);

    cache.current.set(key, outlet);

    // drop pages whose tab was closed
    useEffect(() => {
        const prune = (keys) => {
            let changed = false;
            for (const k of [...cache.current.keys()]) {
                if (k !== keyRef.current && !keys.includes(k)) {
                    cache.current.delete(k);
                    scroll.current.delete(k);
                    changed = true;
                }
            }
            if (changed) force((n) => n + 1);
        };
        listeners.add(prune);
        if (openKeys) prune(openKeys);
        return () => listeners.delete(prune);
    }, []);

    // remember / restore the scroll position of each tab
    useLayoutEffect(() => {
        const prev = keyRef.current;
        if (prev !== key) {
            scroll.current.set(prev, window.scrollY);
            keyRef.current = key;
            window.scrollTo(0, scroll.current.get(key) || 0);
        }
    }, [key]);

    // A popup locks the page scroll (overflow: hidden on body / html, a lock class, or position: fixed on body).
    // Pages on hidden tabs stay mounted: their open popups re-run their effects when the page re-renders (e.g. on a
    // tab switch) and lock the page again. So: whenever no popup is visible on the tab you are looking at, take every
    // scroll lock off — after a tab switch, whenever body / html change, and as a last resort when you try to scroll.
    const boxRef = useRef(null);
    useEffect(() => {
        const DIALOGS = '.modal, .drawer, [aria-modal="true"]';
        const LOCK_CLASSES = ["modal-open", "overflow-hidden", "no-scroll", "noscroll", "scroll-lock", "is-locked", "lock-scroll"];
        const visibleDialog = () => [...document.querySelectorAll(DIALOGS)].some((m) => m.getClientRects().length > 0);
        const locked = () => {
            const b = document.body, h = document.documentElement;
            return [b, h].some((el) => /hidden|clip/.test(getComputedStyle(el).overflowY) || LOCK_CLASSES.some((c) => el.classList.contains(c)))
                || b.style.position === "fixed";
        };
        let busy = false;
        const unlock = () => {
            if (busy || visibleDialog() || !locked()) return;
            busy = true;
            const b = document.body;
            for (const el of [b, document.documentElement]) {
                if (/hidden|clip/.test(el.style.overflow)) el.style.overflow = "";   // (our "visible" override stays)
                if (/hidden|clip/.test(el.style.overflowY)) el.style.overflowY = "";
                LOCK_CLASSES.forEach((c) => el.classList.remove(c));
            }
            if (b.style.position === "fixed") {                          // scroll-lock libraries: body fixed at -scrollY
                const y = -parseInt(b.style.top || "0", 10) || 0;
                b.style.position = ""; b.style.top = ""; b.style.left = ""; b.style.right = ""; b.style.width = "";
                window.scrollTo(0, y);
            }
            if (b.style.paddingRight && !visibleDialog()) b.style.paddingRight = "";
            busy = false;
        };

        // Full-height pages lock the page in CSS: html:has(.vs), body:has(.vs) { overflow: hidden } (VAT Summary, Billing,
        // monitoring pages…). A page on a hidden tab is still in the document, so that rule keeps matching on every other tab.
        // → when the page you are looking at does not need the lock, override it inline (overflow: visible); remove the
        //   override again when you go back to a page that needs it.
        let cssLocks = null;
        let sheetCount = -1;
        const lockSelectors = () => {
            if (cssLocks && sheetCount === document.styleSheets.length) return cssLocks;
            sheetCount = document.styleSheets.length;
            const flat = (rules) => [...rules].flatMap((r) => [r, ...(r.cssRules ? flat(r.cssRules) : [])]);
            const inner = [];
            [...document.styleSheets].forEach((sh) => {
                let rules = [];
                try { rules = flat(sh.cssRules); } catch { return; }
                rules.forEach((r) => {
                    if (!r.selectorText || !r.style || !/hidden|clip/.test(`${r.style.overflow} ${r.style.overflowY}`)) return;
                    r.selectorText.split(",").map((x) => x.trim()).filter((x) => /^(html|body)\s*:has\(/.test(x)).forEach((x) => {
                        const m = /:has\((.+)\)\s*$/.exec(x);
                        if (m) inner.push(m[1]);
                    });
                });
            });
            return (cssLocks = [...new Set(inner)]);
        };
        const visiblePageNeedsLock = () => {
            const page = boxRef.current?.querySelector(".ka-page:not([data-hidden])");
            if (!page) return true;
            return lockSelectors().some((sel) => { try { return !!page.querySelector(sel); } catch { return false; } });
        };
        const syncCssLock = () => {
            const need = visibleDialog() || visiblePageNeedsLock();
            for (const el of [document.body, document.documentElement]) {
                if (need) {
                    if (el.dataset.kaUnlock) { el.style.removeProperty("overflow"); delete el.dataset.kaUnlock; }
                } else if (/hidden|clip/.test(getComputedStyle(el).overflowY) && !el.style.overflow) {
                    el.style.setProperty("overflow", "visible");
                    el.dataset.kaUnlock = "1";
                }
            }
        };
        const run = () => { unlock(); syncCssLock(); };

        run();
        const t1 = setTimeout(run, 0);                                  // after the pages' own effects
        const t2 = setTimeout(run, 300);                                // after late effects (data loads, lazy CSS)
        const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(run) : null;
        mo?.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
        mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
        if (boxRef.current) mo?.observe(boxRef.current, { childList: true, subtree: true });
        const onTry = () => run();                                      // last resort: the user tries to scroll
        window.addEventListener("wheel", onTry, { passive: true });
        window.addEventListener("touchmove", onTry, { passive: true });
        window.addEventListener("keydown", onTry);
        return () => {
            clearTimeout(t1); clearTimeout(t2); mo?.disconnect();
            window.removeEventListener("wheel", onTry);
            window.removeEventListener("touchmove", onTry);
            window.removeEventListener("keydown", onTry);
        };
    }, [key]);

    return (
        <div ref={boxRef} className="ka-pages" style={{ display: "contents" }}>
            {[...cache.current].map(([k, el]) => (
                // display: contents → the page lays out exactly as without the wrapper
                <div key={k} className="ka-page" data-hidden={k === key ? undefined : ""} style={{ display: k === key ? "contents" : "none" }}>
                    {el}
                </div>
            ))}
        </div>
    );
}

export default function OpenTabs({ ready = true }) {
    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const storeKey = `igb-tabs:${user?.id ?? user?.username ?? "guest"}`;

    const [tabState, setTabs] = useState(() => read(storeKey));
    const allTabs = Array.isArray(tabState) ? tabState : [];
    const [menu, setMenu] = useState(null); // { x, y, key }
    const [drag, setDrag] = useState(null);
    const stripRef = useRef(null);
    const [edges, setEdges] = useState({ left: false, right: false });

    // show < > only when the tabs don't fit
    const measure = useCallback(() => {
        const el = stripRef.current;
        if (!el) return;
        const left = el.scrollLeft > 1;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    }, []);
    useEffect(() => {
        const el = stripRef.current;
        if (!el) return;
        measure();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        ro?.observe(el);
        el.addEventListener("scroll", measure, { passive: true });
        window.addEventListener("resize", measure);
        return () => {
            ro?.disconnect();
            el.removeEventListener("scroll", measure);
            window.removeEventListener("resize", measure);
        };
    });
    const scrollBy = (dir) => stripRef.current?.scrollBy({ left: dir * Math.max(200, (stripRef.current.clientWidth || 0) * 0.6), behavior: "smooth" });

    const page = pageOf(pathname);
    const activeKey = page.to;
    const fullPath = pathname + search;
    const sub = pathname !== page.to ? metaFor(pathname)?.crumbs?.slice(-1)[0] : "";
    // the breadcrumbs now live inside the tab
    const crumbs = metaFor(pathname)?.crumbs || [page.label];
    const crumbKey = crumbs.join("\u0000");
    // only show the tabs of the side you are on (FEMS tabs on FEMS, STAFF tabs on STAFF)
    const side = sideOf(pathname);
    const tabs = allTabs.filter((t) => {
        const s = sideOf(t.key);
        return !s || !side || s === side;
    });

    // reload tabs when the login changes
    useEffect(() => setTabs(read(storeKey)), [storeKey]);
    useEffect(() => write(storeKey, allTabs), [storeKey, allTabs]);
    useEffect(() => publish(allTabs.map((t) => t.key)), [allTabs]);

    // every navigation: add / update the tab for this page
    useEffect(() => {
        if (!ready) return; // still checking the login / no access → not a tab
        const timer = setTimeout(() => setTabs((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const now = Date.now();
            const i = list.findIndex((t) => t.key === activeKey);
            if (i >= 0) {
                const t = list[i];
                if (t.path === fullPath && t.sub === sub && (t.crumbs || []).join("\u0000") === crumbKey) return list.map((x, j) => (j === i ? { ...x, used: now } : x));
                return list.map((x, j) => (j === i ? { ...x, path: fullPath, sub, crumbs, used: now } : x));
            }
            let next = [...list, { key: activeKey, label: page.label, path: fullPath, sub, crumbs, used: now }];
            // too many → drop the least recently used (never the current one)
            while (next.length > MAX_TABS) {
                const old = next.filter((t) => t.key !== activeKey).sort((a, b) => a.used - b.used)[0];
                next = next.filter((t) => t !== old);
            }
            return next;
        }), 80);
        return () => clearTimeout(timer);
    }, [ready, activeKey, fullPath, sub, crumbKey, page.label]); // eslint-disable-line react-hooks/exhaustive-deps

    // keep the active tab visible
    useLayoutEffect(() => {
        stripRef.current?.querySelector(".ptab.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [activeKey, tabs.length]);

    const go = (t) => t.key !== activeKey && navigate(t.path);

    const close = useCallback((keys) => {
        setMenu(null);
        const drop = new Set(keys);
        const left = allTabs.filter((t) => !drop.has(t.key));
        if (!drop.has(activeKey)) return setTabs(left);
        // like a browser: go to the tab on the right, else the one on the left, else Home
        const i = tabs.findIndex((t) => t.key === activeKey);
        const target = tabs.slice(i + 1).find((t) => !drop.has(t.key)) || tabs.slice(0, i).reverse().find((t) => !drop.has(t.key));
        if (target) {
            setTabs(left);
            navigate(target.path);
        } else {
            const start = startFor(pathname);
            const sp = pageOf(start);
            setTabs([...left.filter((t) => t.key !== sp.to), { key: sp.to, label: sp.label, path: start, sub: "", crumbs: metaFor(start)?.crumbs || [sp.label], used: Date.now() }]);
            if (pathname !== start || search) navigate(start);
        }
    }, [tabs, allTabs, activeKey, navigate, pathname, search]);

    // context menu: close on outside click / Esc / scroll
    useEffect(() => {
        if (!menu) return;
        const off = () => setMenu(null);
        const key = (e) => e.key === "Escape" && off();
        window.addEventListener("mousedown", off);
        window.addEventListener("keydown", key);
        window.addEventListener("resize", off);
        return () => {
            window.removeEventListener("mousedown", off);
            window.removeEventListener("keydown", key);
            window.removeEventListener("resize", off);
        };
    }, [menu]);

    // mouse wheel scrolls the strip sideways
    const onWheel = (e) => {
        const el = stripRef.current;
        if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
    };

    const onDrop = (overKey) => {
        if (!drag || drag === overKey) return setDrag(null);
        setTabs((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const from = list.findIndex((t) => t.key === drag);
            const to = list.findIndex((t) => t.key === overKey);
            if (from < 0 || to < 0) return list;
            const next = [...list];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
        setDrag(null);
    };

    const only = tabs.length === 1 && tabs[0].key === pageOf(startFor(pathname)).to;
    const menuTab = menu && tabs.find((t) => t.key === menu.key);
    const menuIdx = menuTab ? tabs.indexOf(menuTab) : -1;

    if (!ready || !tabs.length) return null;

    return (
        <div className="ptabs" role="tablist" aria-label="Open pages">
            {(edges.left || edges.right) && (
                <button type="button" className="ptabs-arrow" aria-label="Scroll tabs left" disabled={!edges.left} onClick={() => scrollBy(-1)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
            )}
            <div className="ptabs-strip" ref={stripRef} onWheel={onWheel}>
                {tabs.map((t) => {
                    const active = t.key === activeKey;
                    return (
                        <div
                            key={t.key}
                            role="tab"
                            aria-selected={active}
                            tabIndex={active ? 0 : -1}
                            title={(t.crumbs?.length ? t.crumbs : [t.label, t.sub].filter(Boolean)).filter((x, i, a) => !(i === 0 && a.length > 1 && SIDES.includes(x))).join(" / ")}
                            className={`ptab${active ? " is-active" : ""}${drag === t.key ? " is-drag" : ""}`}
                            draggable
                            onDragStart={(e) => { setDrag(t.key); e.dataTransfer.effectAllowed = "move"; }}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                            onDrop={(e) => { e.preventDefault(); onDrop(t.key); }}
                            onDragEnd={() => setDrag(null)}
                            onClick={() => go(t)}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go(t)}
                            onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
                            onAuxClick={(e) => { if (e.button === 1 && !only) close([t.key]); }}
                            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, key: t.key }); }}
                        >
                            <span className="ptab-dot" aria-hidden="true" />
                            <span className="ptab-text">
                                {(() => {
                                    // one line, without the side name (Accounting / Admin / Staff)
                                    const all = t.crumbs?.length ? t.crumbs : [t.label, t.sub].filter(Boolean);
                                    const c = all.length > 1 && SIDES.includes(all[0]) ? all.slice(1) : all;
                                    return (
                                        <>
                                            {c.length > 1 && <span className="ptab-crumbs">{c.slice(0, -1).join(" / ")} /</span>}
                                            <span className="ptab-label">{c[c.length - 1]}</span>
                                        </>
                                    );
                                })()}
                            </span>
                            {!only && (
                                <button
                                    type="button"
                                    className="ptab-x"
                                    aria-label={`Close ${t.label}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); close([t.key]); }}
                                >
                                    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            {(edges.left || edges.right) && (
                <button type="button" className="ptabs-arrow" aria-label="Scroll tabs right" disabled={!edges.right} onClick={() => scrollBy(1)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
            )}

            {menuTab && (
                <ul
                    className="ptabs-menu"
                    style={{ left: Math.min(menu.x, window.innerWidth - 210), top: menu.y + 4 }}
                    onMouseDown={(e) => e.stopPropagation()}
                    role="menu"
                >
                    {[
                        ["Close tab", [menuTab.key], only],
                        ["Close other tabs", tabs.filter((t) => t.key !== menuTab.key).map((t) => t.key), tabs.length < 2],
                        ["Close tabs to the right", tabs.slice(menuIdx + 1).map((t) => t.key), menuIdx >= tabs.length - 1],
                        null,
                        ["Close all tabs", tabs.map((t) => t.key), only],
                    ].map((m, i) =>
                        m ? (
                            <li key={m[0]} role="menuitem" aria-disabled={m[2]} onClick={() => !m[2] && close(m[1])}>{m[0]}</li>
                        ) : (
                            <li key={`sep${i}`} className="sep" aria-hidden="true" />
                        )
                    )}
                </ul>
            )}
        </div>
    );
}