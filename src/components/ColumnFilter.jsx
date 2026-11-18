// Column header with sort + Excel-style filter (funnel → search, (Select all), values with counts, Clear / Cancel / OK)
//   <ColumnFilter label="Customer / Vendor" values={[{ value, label, count }]} selected={Set|null}
//                 onApply={(Set|null) => …} sort={"asc"|"desc"|null} onSort={(dir|null) => …} align="right" />
//   selected = null → no filter (everything shown)
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ColumnFilter.css";

const Funnel = () => (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
);

export default function ColumnFilter({ label, values, selected, onApply, sort, onSort, align = "left" }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const [q, setQ] = useState("");
    const [draft, setDraft] = useState(new Set());
    const btn = useRef(null);
    const pop = useRef(null);
    const active = selected != null;

    const openPop = () => {
        setDraft(new Set(active ? selected : values.map((v) => v.value)));
        setQ("");
        setOpen(true);
    };

    // fixed position under the funnel (the table scrolls, so the popup lives on <body>)
    useLayoutEffect(() => {
        if (!open || !btn.current) return;
        const place = () => {
            const r = btn.current.getBoundingClientRect();
            const w = 280;
            const left = Math.max(8, Math.min(window.innerWidth - w - 8, align === "right" ? r.right - w : r.left - 8));
            setPos({ top: r.bottom + 6, left, width: w });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
    }, [open, align]);

    useEffect(() => {
        if (!open) return;
        const down = (e) => !pop.current?.contains(e.target) && !btn.current?.contains(e.target) && setOpen(false);
        const key = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", down);
        window.addEventListener("keydown", key);
        return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
    }, [open]);

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return s ? values.filter((v) => String(v.label).toLowerCase().includes(s)) : values;
    }, [values, q]);
    const allOn = shown.length > 0 && shown.every((v) => draft.has(v.value));
    const someOn = shown.some((v) => draft.has(v.value));

    const toggle = (v) => setDraft((d) => { const n = new Set(d); n.has(v) ? n.delete(v) : n.add(v); return n; });
    const toggleAll = () => setDraft((d) => { const n = new Set(d); shown.forEach((v) => (allOn ? n.delete(v.value) : n.add(v.value))); return n; });

    const ok = () => {
        // a search narrows the pick to what is shown (like Excel)
        const pick = q.trim() ? new Set(shown.filter((v) => draft.has(v.value)).map((v) => v.value)) : draft;
        onApply(pick.size === values.length ? null : pick);
        setOpen(false);
    };
    const clear = () => { onApply(null); setOpen(false); };
    const nextSort = () => onSort(sort === "asc" ? "desc" : sort === "desc" ? null : "asc");

    return (
        <span className={`cf-head${align === "right" ? " is-right" : ""}`}>
            <button type="button" className="cf-label" onClick={nextSort} title="Sort">
                {label}
                {sort && <span className="cf-arrow" aria-hidden="true">{sort === "asc" ? "▲" : "▼"}</span>}
            </button>
            <button ref={btn} type="button" className={`cf-btn${active ? " is-on" : ""}`} onClick={() => (open ? setOpen(false) : openPop())}
                aria-label={`Filter ${label}`} aria-expanded={open}>
                <Funnel />
            </button>

            {open && pos && createPortal(
                <div ref={pop} className="cf-pop" style={{ top: pos.top, left: pos.left, width: pos.width }} role="dialog" aria-label={`Filter ${label}`}>
                    <b className="cf-title">{label}</b>
                    <div className="cf-sort">
                        <button type="button" className={sort === "asc" ? "is-on" : ""} onClick={() => onSort(sort === "asc" ? null : "asc")}>Sort A → Z</button>
                        <button type="button" className={sort === "desc" ? "is-on" : ""} onClick={() => onSort(sort === "desc" ? null : "desc")}>Sort Z → A</button>
                    </div>
                    <input className="input cf-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." autoFocus />
                    <label className="cf-item cf-all">
                        <input type="checkbox" checked={allOn} ref={(el) => el && (el.indeterminate = someOn && !allOn)} onChange={toggleAll} />
                        <span>(Select all)</span>
                    </label>
                    <div className="cf-list">
                        {!shown.length && <div className="cf-none">No match.</div>}
                        {shown.map((v) => (
                            <label key={String(v.value)} className="cf-item">
                                <input type="checkbox" checked={draft.has(v.value)} onChange={() => toggle(v.value)} />
                                <span className="cf-text" title={v.label}>{v.label}</span>
                                <small className="cf-count">{v.count}</small>
                            </label>
                        ))}
                    </div>
                    <div className="cf-foot">
                        <button type="button" className="btn" onClick={clear} disabled={!active}>Clear</button>
                        <span />
                        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={ok} disabled={!draft.size}>OK</button>
                    </div>
                </div>,
                document.body
            )}
        </span>
    );
}

/** distinct values of one column with counts: [{ value, label, count }] sorted by label */
export function distinct(rows, get, show = (v) => v) {
    const m = new Map();
    rows.forEach((r) => { const v = get(r); m.set(v, (m.get(v) || 0) + 1); });
    return [...m.entries()]
        .map(([value, count]) => ({ value, label: String(show(value) ?? ""), count }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}