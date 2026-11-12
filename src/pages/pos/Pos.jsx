// Task → POS  (full screen, opens in its own browser tab: /pos)
// Stock Items only · Cash / GCash / Card / split · 58/80mm receipt · shift open/close · sales list (reprint / void)
// Every sale = Sales Invoice (PAID) + Collection per payment, so it shows in Sales, Banking, VAT and Inventory reports.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import "./pos.css";

const peso = (v) => `₱${(Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (v) => String(Math.round((Number(v) || 0) * 10000) / 10000);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const METHODS = [
    { key: "cash", label: "Cash", color: "#16a34a" },
    { key: "gcash", label: "GCash", color: "#0a6cff" },
    { key: "card", label: "Card", color: "#7c3aed" },
];
const methodOf = (k) => METHODS.find((m) => m.key === k) || METHODS[0];
const HUES = [212, 262, 152, 24, 340, 190, 45, 290];
const hueOf = (s) => HUES[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
const fmtTime = (v) => {
    const d = v ? new Date(String(v).replace(" ", "T")) : new Date();
    return isNaN(d) ? String(v || "") : d.toLocaleString("en-PH", { month: "short", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const store = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

/* ---------- product images: loaded one by one, cached for the tab ---------- */
const imgCache = new Map();          // id → url | "" (none)
const imgQueue = [];
let imgBusy = false;
function loadImage(id, cb) {
    if (imgCache.has(id)) return cb(imgCache.get(id));
    imgQueue.push([id, cb]);
    if (!imgBusy) pump();
}
async function pump() {
    imgBusy = true;
    while (imgQueue.length) {
        const [id, cb] = imgQueue.shift();
        if (!imgCache.has(id)) {
            try {
                const b = await apiBlob(`/products/${id}/image`);
                imgCache.set(id, b.type.startsWith("image/") ? URL.createObjectURL(b) : "");
            } catch { imgCache.set(id, ""); }
        }
        cb(imgCache.get(id));
    }
    imgBusy = false;
}
function Thumb({ item, size = "lg" }) {
    const [src, setSrc] = useState(imgCache.get(item.id) || "");
    const ref = useRef(null);
    useEffect(() => {
        if (item.has_image === false || imgCache.has(item.id)) { setSrc(imgCache.get(item.id) || ""); return; }
        let alive = true;
        const el = ref.current;
        const io = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) return;
            io.disconnect();
            loadImage(item.id, (u) => alive && setSrc(u));
        }, { rootMargin: "200px" });
        if (el) io.observe(el);
        return () => { alive = false; io.disconnect(); };
    }, [item.id, item.has_image]);
    const h = hueOf(item.name);
    return (
        <div ref={ref} className={`pos-thumb pos-thumb-${size}`} style={src ? undefined : { background: `linear-gradient(135deg, hsl(${h} 85% 92%), hsl(${h + 30} 80% 86%))`, color: `hsl(${h} 60% 32%)` }}>
            {src ? <img src={src} alt="" /> : <span>{item.name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•"}</span>}
        </div>
    );
}

/* ---------- small pieces ---------- */
const I = {
    search: <path d="m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" />,
    scan: <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8M18 8v8" />,
    receipt: <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2ZM9 7h6M9 11h6M9 15h4" />,
    clock: <path d="M12 7v5l3 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z" />,
    gear: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />,
    expand: <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
    sun: <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />,
    trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
    user: <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />,
    lock: <path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    print: <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />,
    tag: <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8ZM7 7h.01" />,
    back: <path d="M19 12H5M12 19l-7-7 7-7" />,
    cart: <path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h9.2a2 2 0 0 0 2-1.6L22 7H6M9 21h.01M18 21h.01" />,
};
const Ico = ({ n, s = 18 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n]}</svg>
);

function Dialog({ title, onClose, children, footer, wide, tone }) {
    useEffect(() => {
        const k = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [onClose]);
    return (
        <div className="pos-dlg-back" onMouseDown={onClose}>
            <div className={`pos-dlg ${wide ? "is-wide" : ""} ${tone ? `tone-${tone}` : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
                <header><h3>{title}</h3>{onClose && <button className="pos-icon" onClick={onClose} aria-label="Close"><Ico n="x" /></button>}</header>
                <div className="pos-dlg-body">{children}</div>
                {footer && <footer>{footer}</footer>}
            </div>
        </div>
    );
}

function Toast({ msg }) {
    if (!msg) return null;
    return <div className={`pos-toast ${msg.type === "error" ? "is-err" : ""}`} role="status">{msg.text}</div>;
}

/* =========================================================
   POS
   ========================================================= */
export default function Pos() {
    const { user } = useAuth();
    const [boot, setBoot] = useState(null);          // { settings, accounts, customers, shift, cashier }
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fatal, setFatal] = useState("");
    const [toast, setToast] = useState(null);
    const notify = useCallback((text, type = "ok") => {
        setToast({ text, type, at: Date.now() });
    }, []);
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

    const [dark, setDark] = useState(() => store.get("pos-dark", false));
    useEffect(() => store.set("pos-dark", dark), [dark]);

    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");      // all · stock · low
    const [cart, setCart] = useState([]);             // [{ item, qty, price, discount }]
    const [customerId, setCustomerId] = useState("");
    const [orderDisc, setOrderDisc] = useState(null); // { type: "pct"|"amt", value }
    const [dlg, setDlg] = useState(null);             // pay · receipt · shift · sales · settings · disc · close
    const [receipt, setReceipt] = useState(null);     // sale to show / print
    const [printSale, setPrintSale] = useState(null); // sale being printed
    const [now, setNow] = useState(new Date());
    const searchRef = useRef(null);

    useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
    useEffect(() => { document.title = "POS · IGB"; }, []);

    const loadItems = useCallback(async () => {
        try { setItems(await apiFetch("/pos/items")); } catch (e) { notify(e.message || "Couldn't load the items.", "error"); }
    }, [notify]);
    const loadBoot = useCallback(async () => {
        setLoading(true);
        setFatal("");
        try {
            const [b, it] = await Promise.all([apiFetch("/pos/bootstrap"), apiFetch("/pos/items")]);
            setBoot(b);
            setItems(it);
        } catch (e) {
            setFatal(e.message || "Couldn't open the POS.");
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { loadBoot(); }, [loadBoot, user?.id, user?.caid]);

    const settings = boot?.settings;
    const shift = boot?.shift;
    const needsSetup = settings && (!settings.ar_account || !settings.cash_account);

    /* ---------- items ---------- */
    const inCart = useMemo(() => Object.fromEntries(cart.map((l) => [l.item.id, l.qty])), [cart]);
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((i) => {
            if (filter === "stock" && i.stock <= 0) return false;
            if (filter === "low" && !(i.stock > 0 && i.stock <= 5)) return false;
            if (filter === "out" && i.stock > 0) return false;
            return !q || `${i.name} ${i.code} ${i.upc}`.toLowerCase().includes(q);
        });
    }, [items, query, filter]);
    const counts = useMemo(() => ({
        all: items.length,
        stock: items.filter((i) => i.stock > 0).length,
        low: items.filter((i) => i.stock > 0 && i.stock <= 5).length,
        out: items.filter((i) => i.stock <= 0).length,
    }), [items]);

    const add = useCallback((item, n = 1) => {
        const have = (inCart[item.id] || 0) + n;
        if (!settings?.allow_negative && have > item.stock + 1e-9) {
            notify(item.stock > 0 ? `Only ${qtyText(item.stock)} left of ${item.name}.` : `${item.name} is out of stock.`, "error");
            return;
        }
        setCart((c) => {
            const i = c.findIndex((l) => l.item.id === item.id);
            if (i < 0) return [...c, { item, qty: n, price: item.price, discount: 0 }];
            const next = [...c];
            next[i] = { ...next[i], qty: next[i].qty + n };
            return next;
        });
    }, [inCart, settings?.allow_negative, notify]);

    const setQty = (id, qty) => {
        const line = cart.find((l) => l.item.id === id);
        if (!line) return;
        const q = Math.max(0, Math.round((Number(qty) || 0) * 10000) / 10000);
        if (q === 0) return setCart((c) => c.filter((l) => l.item.id !== id));
        if (!settings?.allow_negative && q > line.item.stock + 1e-9) return notify(`Only ${qtyText(line.item.stock)} left of ${line.item.name}.`, "error");
        setCart((c) => c.map((l) => (l.item.id === id ? { ...l, qty: q } : l)));
    };
    const patchLine = (id, patch) => setCart((c) => c.map((l) => (l.item.id === id ? { ...l, ...patch } : l)));

    // barcode / code: exact match on Enter adds it
    const onSearchKey = (e) => {
        if (e.key !== "Enter") return;
        const q = query.trim().toLowerCase();
        if (!q) return;
        const hit = items.find((i) => i.upc.toLowerCase() === q || i.code.toLowerCase() === q) || (shown.length === 1 ? shown[0] : null);
        if (hit) { add(hit); setQuery(""); } else notify(`No item for "${query.trim()}".`, "error");
    };

    /* ---------- totals ---------- */
    const lineAmt = (l) => r2(l.qty * l.price - (Number(l.discount) || 0));
    const gross = r2(cart.reduce((a, l) => a + l.qty * l.price, 0));
    const lineDisc = r2(cart.reduce((a, l) => a + (Number(l.discount) || 0), 0));
    const beforeOrder = r2(gross - lineDisc);
    const orderDiscAmt = !orderDisc ? 0 : r2(Math.min(beforeOrder, orderDisc.type === "pct" ? beforeOrder * (Number(orderDisc.value) || 0) / 100 : Number(orderDisc.value) || 0));
    // order discount is spread over the lines (biggest line takes the rounding)
    const lines = useMemo(() => {
        if (!orderDiscAmt || !beforeOrder) return cart.map((l) => ({ ...l, extra: 0 }));
        let left = orderDiscAmt;
        const big = cart.reduce((b, l, i) => (lineAmt(l) > lineAmt(cart[b]) ? i : b), 0);
        const out = cart.map((l, i) => {
            if (i === big) return { ...l, extra: 0 };
            const e = r2(orderDiscAmt * lineAmt(l) / beforeOrder);
            left = r2(left - e);
            return { ...l, extra: e };
        });
        out[big] = { ...out[big], extra: left };
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart, orderDiscAmt, beforeOrder]);
    const total = r2(beforeOrder - orderDiscAmt);
    const vat = r2(lines.filter((l) => l.item.vat_type === "vatable").reduce((a, l) => a + (lineAmt(l) - l.extra) * 12 / 112, 0));
    const itemCount = cart.reduce((a, l) => a + l.qty, 0);

    const clearSale = () => { setCart([]); setOrderDisc(null); setCustomerId(""); };

    /* ---------- keyboard ---------- */
    useEffect(() => {
        const k = (e) => {
            if (dlg) return;
            if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
            if (e.key === "F9" && cart.length && shift) { e.preventDefault(); setDlg("pay"); }
            if (e.key === "F4") { e.preventDefault(); setDlg("sales"); }
        };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [dlg, cart.length, shift]);

    /* ---------- print ---------- */
    const doPrint = (sale) => {
        setPrintSale(sale);
        setTimeout(() => window.print(), 80);
    };

    const fullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => { });
    };

    /* ---------- screens ---------- */
    if (loading) {
        return <div className={`pos ${dark ? "pos-dark" : ""}`}><div className="pos-center"><div className="pos-spinner" /><p>Opening POS…</p></div></div>;
    }
    if (fatal) {
        return (
            <div className={`pos ${dark ? "pos-dark" : ""}`}>
                <div className="pos-center">
                    <div className="pos-card pos-gate">
                        <h2>POS can't open</h2>
                        <p className="pos-muted">{fatal}</p>
                        <button className="pos-btn pos-btn-primary" onClick={loadBoot}>Try again</button>
                    </div>
                </div>
            </div>
        );
    }

    const customers = boot?.customers || [];

    return (
        <div className={`pos ${dark ? "pos-dark" : ""}`}>
            {/* ===== top bar ===== */}
            <header className="pos-top">
                <div className="pos-brand">
                    <span className="pos-logo"><Ico n="cart" s={18} /></span>
                    <div>
                        <b>{settings?.store_name || "Point of Sale"}</b>
                        <small>{shift ? `${shift.shift_no} · ${shift.cashier}` : boot?.cashier}</small>
                    </div>
                </div>
                <div className="pos-top-mid">
                    <span className="pos-chip"><Ico n="clock" s={15} />{now.toLocaleString("en-PH", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    {shift && <span className="pos-chip is-live"><i />Shift open</span>}
                </div>
                <nav className="pos-top-act">
                    <button className="pos-tbtn" onClick={() => setDlg("sales")} title="Sales (F4)"><Ico n="receipt" /><span>Sales</span></button>
                    {shift && <button className="pos-tbtn" onClick={() => setDlg("close")} title="Close shift"><Ico n="lock" /><span>Close shift</span></button>}
                    <button className="pos-tbtn" onClick={() => setDlg("settings")} title="Settings"><Ico n="gear" /><span>Settings</span></button>
                    <button className="pos-icon" onClick={() => setDark((d) => !d)} title={dark ? "Light" : "Dark"} aria-label="Theme"><Ico n={dark ? "sun" : "moon"} /></button>
                    <button className="pos-icon" onClick={fullscreen} title="Full screen" aria-label="Full screen"><Ico n="expand" /></button>
                </nav>
            </header>

            {/* ===== gates ===== */}
            {needsSetup ? (
                <div className="pos-center">
                    <div className="pos-card pos-gate">
                        <span className="pos-gate-ico"><Ico n="gear" s={26} /></span>
                        <h2>Set up the POS first</h2>
                        <p className="pos-muted">Choose the Accounts Receivable and Cash accounts the sales and collections will use.</p>
                        <button className="pos-btn pos-btn-primary pos-btn-lg" onClick={() => setDlg("settings")}>Open settings</button>
                    </div>
                </div>
            ) : !shift ? (
                <OpenShift cashier={boot?.cashier} onOpened={(s) => { setBoot((b) => ({ ...b, shift: s })); notify("Shift opened. Ready to sell."); }} />
            ) : (
                <main className="pos-main">
                    {/* ===== products ===== */}
                    <section className="pos-left">
                        <div className="pos-search">
                            <span className="pos-search-ico"><Ico n="search" /></span>
                            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} autoFocus
                                placeholder="Search item or scan barcode…" aria-label="Search item or scan barcode" />
                            <span className="pos-kbd">F2</span>
                            <span className="pos-search-scan" title="Scan a barcode then press Enter"><Ico n="scan" /></span>
                        </div>
                        <div className="pos-filters" role="tablist">
                            {[["all", "All items"], ["stock", "In stock"], ["low", "Low stock"], ["out", "Out of stock"]].map(([k, l]) => (
                                <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>
                                    {l}<em>{counts[k]}</em>
                                </button>
                            ))}
                            <button className="pos-refresh" onClick={loadItems} title="Refresh items">↻</button>
                        </div>
                        <div className={`pos-grid ${shown.length <= 12 ? "is-few" : ""}`}>
                            {shown.map((i) => {
                                const out = i.stock <= 0 && !settings?.allow_negative;
                                const n = inCart[i.id];
                                return (
                                    <button key={i.id} className={`pos-item ${out ? "is-out" : ""} ${n ? "is-in" : ""}`} onClick={() => add(i)} disabled={out} title={i.name}>
                                        <Thumb item={i} />
                                        {n ? <span className="pos-item-n">{qtyText(n)}</span> : null}
                                        <span className={`pos-stock ${i.stock <= 0 ? "is-zero" : i.stock <= 5 ? "is-low" : ""}`}>{i.stock <= 0 ? "Out" : `${(Math.round(i.stock * 100) / 100).toLocaleString("en-PH")} left`}</span>
                                        <div className="pos-item-body">
                                            <b>{i.name}</b>
                                            <small>{i.code}</small>
                                            <strong>{peso(i.price)}</strong>
                                        </div>
                                    </button>
                                );
                            })}
                            {!shown.length && (
                                <div className="pos-empty">
                                    <Ico n="search" s={28} />
                                    <p>{items.length ? "No item matches." : "No Stock Items yet. Add them in Setup → Products (Item Class: Stock Item)."}</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* ===== cart ===== */}
                    <aside className="pos-cart">
                        <div className="pos-cart-head">
                            <div>
                                <h2>Current sale</h2>
                                <small>{itemCount ? `${qtyText(itemCount)} item${itemCount === 1 ? "" : "s"}` : "No items yet"}</small>
                            </div>
                            {cart.length > 0 && <button className="pos-link-danger" onClick={clearSale}><Ico n="trash" s={15} />Clear</button>}
                        </div>

                        <CustomerPick customers={customers} value={customerId} onChange={setCustomerId} />

                        <div className="pos-lines">
                            {!cart.length && (
                                <div className="pos-cart-empty">
                                    <span><Ico n="cart" s={30} /></span>
                                    <p>Tap an item or scan a barcode<br />to start a sale.</p>
                                </div>
                            )}
                            {lines.map((l) => (
                                <div key={l.item.id} className="pos-line">
                                    <Thumb item={l.item} size="sm" />
                                    <div className="pos-line-mid">
                                        <b title={l.item.name}>{l.item.name}</b>
                                        <div className="pos-line-sub">
                                            <span>{peso(l.price)}</span>
                                            {Number(l.discount) > 0 && <span className="pos-disc">−{n2(l.discount)}</span>}
                                            <button className="pos-mini" onClick={() => setDlg({ kind: "line", id: l.item.id })}><Ico n="tag" s={12} />Edit</button>
                                        </div>
                                    </div>
                                    <div className="pos-qty">
                                        <button onClick={() => setQty(l.item.id, l.qty - 1)} aria-label="Less"><Ico n="minus" s={14} /></button>
                                        <input value={qtyText(l.qty)} inputMode="decimal" onChange={(e) => setQty(l.item.id, e.target.value.replace(/[^\d.]/g, ""))} aria-label="Quantity" />
                                        <button onClick={() => setQty(l.item.id, l.qty + 1)} aria-label="More"><Ico n="plus" s={14} /></button>
                                    </div>
                                    <strong className="pos-line-amt">{n2(lineAmt(l))}</strong>
                                </div>
                            ))}
                        </div>

                        <div className="pos-sum">
                            <div><span>Subtotal</span><span>{n2(gross)}</span></div>
                            {lineDisc > 0 && <div className="is-disc"><span>Item discounts</span><span>−{n2(lineDisc)}</span></div>}
                            <div className={orderDiscAmt ? "is-disc" : ""}>
                                <button className="pos-mini" onClick={() => setDlg("disc")} disabled={!cart.length}>
                                    <Ico n="tag" s={12} />{orderDisc ? `Discount ${orderDisc.type === "pct" ? `${orderDisc.value}%` : ""}` : "Add discount"}
                                </button>
                                <span>{orderDiscAmt ? `−${n2(orderDiscAmt)}` : "0.00"}</span>
                            </div>
                            <div className="is-muted"><span>VAT (incl.)</span><span>{n2(vat)}</span></div>
                            <div className="pos-total"><span>Total</span><span>{peso(total)}</span></div>
                        </div>

                        <button className="pos-charge" disabled={!cart.length} onClick={() => setDlg("pay")}>
                            <span>Charge</span><b>{peso(total)}</b><em>F9</em>
                        </button>
                    </aside>
                </main>
            )}

            {/* ===== dialogs ===== */}
            {dlg === "pay" && (
                <PayDialog total={total} shift={shift} customerId={customerId} lines={lines} methods={METHODS.filter((m) => m.key === "cash" || settings?.[`${m.key}_account`])}
                    onClose={() => setDlg(null)}
                    onPaid={(sale) => {
                        setDlg("receipt");
                        setReceipt(sale);
                        clearSale();
                        // stock on the cards
                        setItems((list) => list.map((i) => {
                            const sold = sale.lines.filter((l) => l.item_id === i.id).reduce((a, l) => a + Number(l.qty), 0);
                            return sold ? { ...i, stock: Math.round((i.stock - sold) * 10000) / 10000 } : i;
                        }));
                    }} />
            )}
            {dlg === "receipt" && receipt && (
                <Dialog title="Payment complete" tone="ok" onClose={() => { setDlg(null); searchRef.current?.focus(); }}
                    footer={<>
                        <button className="pos-btn" onClick={() => doPrint(receipt)}><Ico n="print" s={16} />Print receipt</button>
                        <button className="pos-btn pos-btn-primary" autoFocus onClick={() => { setDlg(null); searchRef.current?.focus(); }}>New sale</button>
                    </>}>
                    <div className="pos-done">
                        <span className="pos-done-ico">✓</span>
                        {receipt.change > 0 ? (
                            <><small>Change</small><b>{peso(receipt.change)}</b></>
                        ) : (<><small>Paid</small><b>{peso(receipt.total)}</b></>)}
                        <p className="pos-muted">{receipt.receipt_no} · {receipt.payments.map((p) => `${methodOf(p.method).label} ${n2(p.amount)}`).join(" + ")}</p>
                    </div>
                    <ReceiptPaper sale={receipt} settings={settings} />
                </Dialog>
            )}
            {dlg === "disc" && (
                <DiscountDialog value={orderDisc} max={beforeOrder} onClose={() => setDlg(null)} onSave={(v) => { setOrderDisc(v); setDlg(null); }} />
            )}
            {dlg?.kind === "line" && (() => {
                const l = cart.find((x) => x.item.id === dlg.id);
                return l ? (
                    <LineDialog line={l} onClose={() => setDlg(null)}
                        onSave={(p) => { patchLine(l.item.id, p); setDlg(null); }}
                        onRemove={() => { setCart((c) => c.filter((x) => x.item.id !== l.item.id)); setDlg(null); }} />
                ) : null;
            })()}
            {dlg === "sales" && (
                <SalesDialog shift={shift} settings={settings} onClose={() => setDlg(null)} onPrint={doPrint} notify={notify}
                    onVoided={() => loadItems()} />
            )}
            {dlg === "close" && shift && (
                <CloseShiftDialog shift={shift} onClose={() => setDlg(null)} onPrint={(z) => { setPrintSale({ z }); setTimeout(() => window.print(), 80); }}
                    onClosed={() => { setBoot((b) => ({ ...b, shift: null })); clearSale(); }} notify={notify} />
            )}
            {dlg === "settings" && (
                <SettingsDialog settings={settings} accounts={boot?.accounts || []} onClose={() => setDlg(null)} notify={notify}
                    onSaved={(s) => { setBoot((b) => ({ ...b, settings: s })); setDlg(null); }} />
            )}

            {/* ===== what window.print() prints ===== */}
            <div className={`pos-print pos-print-${settings?.paper || 80}`} aria-hidden="true">
                {printSale?.z ? <ZReport data={printSale.z} settings={settings} /> : printSale ? <ReceiptPaper sale={printSale} settings={settings} /> : null}
            </div>
            <Toast msg={toast} />
        </div>
    );
}

/* =========================================================
   Customer picker (Walk-in by default)
   ========================================================= */
function CustomerPick({ customers, value, onChange }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const box = useRef(null);
    useEffect(() => {
        if (!open) return;
        const h = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);
    const cur = customers.find((c) => String(c.id) === String(value));
    const list = customers.filter((c) => !q || `${c.name} ${c.tin || ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
    return (
        <div className="pos-cust" ref={box}>
            <button className="pos-cust-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <span className="pos-cust-av"><Ico n="user" s={16} /></span>
                <span><small>Customer</small><b>{cur ? cur.name : "Walk-in customer"}</b></span>
                <span className="pos-caret">▾</span>
            </button>
            {open && (
                <div className="pos-pop">
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer…" aria-label="Search customer" />
                    <ul>
                        <li><button className={!value ? "is-on" : ""} onClick={() => { onChange(""); setOpen(false); }}>Walk-in customer</button></li>
                        {list.map((c) => (
                            <li key={c.id}><button className={String(c.id) === String(value) ? "is-on" : ""} onClick={() => { onChange(String(c.id)); setOpen(false); setQ(""); }}>
                                {c.name}{c.tin ? <small>{c.tin}</small> : null}
                            </button></li>
                        ))}
                        {!list.length && <li className="pos-muted" style={{ padding: 10 }}>No customer found.</li>}
                    </ul>
                </div>
            )}
        </div>
    );
}

/* =========================================================
   Open shift
   ========================================================= */
function OpenShift({ cashier, onOpened }) {
    const [cash, setCash] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const open = async () => {
        setBusy(true);
        setErr("");
        try {
            const r = await apiFetch("/pos/shift/open", { method: "POST", body: JSON.stringify({ opening_cash: Number(String(cash).replace(/,/g, "")) || 0 }) });
            onOpened(r.shift);
        } catch (e) { setErr(e.message || "Couldn't open the shift."); } finally { setBusy(false); }
    };
    return (
        <div className="pos-center">
            <div className="pos-card pos-gate">
                <span className="pos-gate-ico"><Ico n="clock" s={26} /></span>
                <h2>Start your shift</h2>
                <p className="pos-muted">Hi {cashier}. Count the cash in the drawer before your first sale.</p>
                <label className="pos-field">
                    <span>Opening cash</span>
                    <div className="pos-money"><em>₱</em><input autoFocus inputMode="decimal" value={cash} placeholder="0.00"
                        onChange={(e) => setCash(e.target.value.replace(/[^\d.,]/g, ""))} onKeyDown={(e) => e.key === "Enter" && open()} /></div>
                </label>
                {err && <div className="pos-err">{err}</div>}
                <button className="pos-btn pos-btn-primary pos-btn-lg" onClick={open} disabled={busy}>{busy ? "Opening…" : "Open shift"}</button>
            </div>
        </div>
    );
}

/* =========================================================
   Payment
   ========================================================= */
function PayDialog({ total, shift, customerId, lines, methods, onClose, onPaid }) {
    const [pays, setPays] = useState([]);                 // [{ method, amount, reference }]
    const [method, setMethod] = useState("cash");
    const [entry, setEntry] = useState(String(total.toFixed(2)));
    const fresh = useRef(true);                           // first key replaces the pre-filled amount
    const [ref, setRef] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const paid = r2(pays.reduce((a, p) => a + p.amount, 0));
    const due = r2(Math.max(0, total - paid));
    const change = r2(Math.max(0, paid - total));
    const typed = Number(String(entry).replace(/,/g, "")) || 0;

    useEffect(() => { setEntry(due ? due.toFixed(2) : ""); setRef(""); fresh.current = true; }, [due, method]);

    const addPay = (amt = typed) => {
        setErr("");
        if (amt <= 0) return;
        if (method !== "cash" && amt - due > 0.001) return setErr(`${methodOf(method).label} can't be more than the amount due (${n2(due)}).`);
        if (method !== "cash" && !ref.trim()) return setErr(`Type the ${methodOf(method).label} reference no.`);
        setPays((p) => [...p, { method, amount: r2(amt), reference: ref.trim() }]);
    };
    const key = (k) => {
        const first = fresh.current;
        fresh.current = false;
        setEntry((prev) => {
            const e = first && k !== "⌫" ? "" : prev;
            if (k === "C") return "";
            if (k === "⌫") return e.slice(0, -1);
            if (k === "." && e.includes(".")) return e;
            if (/\.\d\d$/.test(e)) return e;
            return (e === "0" && k !== "." ? "" : e) + k;
        });
    };
    const quick = [...new Set([due, ...[20, 50, 100, 200, 500, 1000].map((b) => Math.ceil(due / b) * b)].filter((v) => v >= due && v > 0))].slice(0, 5);

    const finish = async () => {
        setBusy(true);
        setErr("");
        try {
            const r = await apiFetch("/pos/checkout", {
                method: "POST",
                body: JSON.stringify({
                    shift_id: shift.id,
                    customer_id: customerId ? Number(customerId) : null,
                    lines: lines.map((l) => ({ item_id: l.item.id, qty: l.qty, price: l.price, discount: r2((Number(l.discount) || 0) + (l.extra || 0)) })),
                    payments: pays,
                }),
            });
            onPaid(r.sale);
        } catch (e) { setErr(e.message || "Couldn't save the sale."); } finally { setBusy(false); }
    };

    const ready = paid + 0.001 >= total;
    return (
        <Dialog title="Payment" wide onClose={busy ? undefined : onClose}>
            <div className="pos-pay">
                <div className="pos-pay-left">
                    <div className="pos-due">
                        <small>{ready ? (change ? "Change" : "Fully paid") : paid ? "Remaining" : "Amount due"}</small>
                        <b className={ready ? "is-ok" : ""}>{peso(ready ? change : due)}</b>
                        <span>Total {peso(total)}</span>
                    </div>
                    <div className="pos-methods">
                        {methods.map((m) => (
                            <button key={m.key} className={method === m.key ? "is-on" : ""} style={{ "--m": m.color }} onClick={() => setMethod(m.key)} disabled={ready}>
                                <i>{m.label[0]}</i>{m.label}
                            </button>
                        ))}
                    </div>
                    {!ready && (
                        <>
                            <div className="pos-money pos-money-xl"><em>₱</em>
                                <input value={entry} inputMode="decimal" onChange={(e) => { fresh.current = false; setEntry(e.target.value.replace(/[^\d.]/g, "")); }} onFocus={(e) => e.target.select()}
                                    onKeyDown={(e) => e.key === "Enter" && addPay()} aria-label="Amount" autoFocus />
                            </div>
                            {method !== "cash" && (
                                <input className="pos-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={`${methodOf(method).label} reference no.`}
                                    onKeyDown={(e) => e.key === "Enter" && addPay()} aria-label="Reference no." />
                            )}
                            {method === "cash" && (
                                <div className="pos-quick">
                                    {quick.map((v) => <button key={v} onClick={() => addPay(v)}>{v === due ? "Exact" : n2(v)}</button>)}
                                </div>
                            )}
                            <button className="pos-btn pos-btn-primary pos-btn-lg" onClick={() => addPay()} disabled={typed <= 0}>
                                Add {methodOf(method).label} {typed > 0 ? n2(typed) : ""}
                            </button>
                        </>
                    )}
                    {pays.length > 0 && (
                        <ul className="pos-paylist">
                            {pays.map((p, i) => (
                                <li key={i} style={{ "--m": methodOf(p.method).color }}>
                                    <i>{methodOf(p.method).label[0]}</i>
                                    <span>{methodOf(p.method).label}{p.reference ? <small>Ref {p.reference}</small> : null}</span>
                                    <b>{n2(p.amount)}</b>
                                    <button className="pos-icon" onClick={() => setPays((x) => x.filter((_, j) => j !== i))} aria-label="Remove payment" disabled={busy}><Ico n="x" s={14} /></button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="pos-pay-right">
                    {!ready ? (
                        <div className="pos-keypad">
                            {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"].map((k) => <button key={k} onClick={() => key(k)}>{k}</button>)}
                            <button className="is-wide" onClick={() => key("C")}>Clear</button>
                        </div>
                    ) : (
                        <div className="pos-ready">
                            <span className="pos-done-ico">✓</span>
                            <p>{change ? <>Give change <b>{peso(change)}</b></> : "Amount fully covered"}</p>
                        </div>
                    )}
                    {err && <div className="pos-err">{err}</div>}
                    <button className="pos-charge" disabled={!ready || busy} onClick={finish}>
                        <span>{busy ? "Saving…" : "Complete sale"}</span><b>{peso(total)}</b>
                    </button>
                </div>
            </div>
        </Dialog>
    );
}

/* =========================================================
   Discounts
   ========================================================= */
function DiscountDialog({ value, max, onClose, onSave }) {
    const [type, setType] = useState(value?.type || "pct");
    const [v, setV] = useState(value ? String(value.value) : "");
    const num = Number(v) || 0;
    const amt = type === "pct" ? Math.min(max, max * num / 100) : Math.min(max, num);
    return (
        <Dialog title="Order discount" onClose={onClose}
            footer={<>
                {value && <button className="pos-btn" onClick={() => onSave(null)}>Remove</button>}
                <button className="pos-btn pos-btn-primary" onClick={() => onSave(num > 0 ? { type, value: num } : null)}>Apply</button>
            </>}>
            <div className="pos-seg">
                <button className={type === "pct" ? "is-on" : ""} onClick={() => setType("pct")}>Percent %</button>
                <button className={type === "amt" ? "is-on" : ""} onClick={() => setType("amt")}>Amount ₱</button>
            </div>
            <div className="pos-quick" style={{ margin: "12px 0" }}>
                {(type === "pct" ? [5, 10, 20] : [10, 20, 50, 100]).map((x) => <button key={x} onClick={() => setV(String(x))}>{type === "pct" ? `${x}%` : n2(x)}</button>)}
            </div>
            <div className="pos-money"><em>{type === "pct" ? "%" : "₱"}</em>
                <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))} onKeyDown={(e) => e.key === "Enter" && onSave(num > 0 ? { type, value: num } : null)} />
            </div>
            <p className="pos-muted" style={{ marginTop: 10 }}>Discount: <b>{peso(amt)}</b> · 20% for Senior / PWD if applicable.</p>
        </Dialog>
    );
}

function LineDialog({ line, onClose, onSave, onRemove }) {
    const [price, setPrice] = useState(String(line.price));
    const [disc, setDisc] = useState(line.discount ? String(line.discount) : "");
    const gross = (Number(price) || 0) * line.qty;
    return (
        <Dialog title={line.item.name} onClose={onClose}
            footer={<>
                <button className="pos-btn pos-btn-danger" onClick={onRemove}><Ico n="trash" s={15} />Remove</button>
                <button className="pos-btn pos-btn-primary" onClick={() => onSave({ price: Number(price) || 0, discount: Math.min(gross, Number(disc) || 0) })}>Save</button>
            </>}>
            <div className="pos-two">
                <label className="pos-field"><span>Price</span>
                    <div className="pos-money"><em>₱</em><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} /></div>
                </label>
                <label className="pos-field"><span>Discount (₱, this line)</span>
                    <div className="pos-money"><em>₱</em><input autoFocus inputMode="decimal" value={disc} placeholder="0.00" onChange={(e) => setDisc(e.target.value.replace(/[^\d.]/g, ""))} /></div>
                </label>
            </div>
            <p className="pos-muted" style={{ marginTop: 10 }}>{qtyText(line.qty)} × {n2(Number(price) || 0)} = {n2(gross)} · Line total <b>{peso(gross - Math.min(gross, Number(disc) || 0))}</b></p>
        </Dialog>
    );
}

/* =========================================================
   Sales list (reprint / void)
   ========================================================= */
function SalesDialog({ shift, settings, onClose, onPrint, notify, onVoided }) {
    const [rows, setRows] = useState(null);
    const [sel, setSel] = useState(null);
    const [voiding, setVoiding] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        try {
            const r = await apiFetch(`/pos/sales?${new URLSearchParams(shift ? { shift_id: shift.id } : {})}`);
            setRows(r);
            setSel((s) => (s ? r.find((x) => x.id === s.id) || null : r[0] || null));
        } catch (e) { notify(e.message || "Couldn't load the sales.", "error"); setRows([]); }
    }, [shift, notify]);
    useEffect(() => { load(); }, [load]);

    const doVoid = async () => {
        setBusy(true);
        try {
            const r = await apiFetch(`/pos/sales/${sel.id}/void`, { method: "POST", body: JSON.stringify({ reason }) });
            notify(r.message || "Voided.");
            setVoiding(false);
            setReason("");
            await load();
            onVoided();
        } catch (e) { notify(e.message || "Couldn't void.", "error"); } finally { setBusy(false); }
    };
    const paid = (rows || []).filter((r) => r.status === "PAID");

    return (
        <Dialog title={shift ? `Sales · ${shift.shift_no}` : "Today's sales"} wide onClose={onClose}>
            <div className="pos-sales">
                <div className="pos-sales-list">
                    <div className="pos-sales-sum"><span>{paid.length} sale{paid.length === 1 ? "" : "s"}</span><b>{peso(paid.reduce((a, r) => a + r.total, 0))}</b></div>
                    {!rows && <p className="pos-muted" style={{ padding: 12 }}>Loading…</p>}
                    {rows?.length === 0 && <p className="pos-muted" style={{ padding: 12 }}>No sales yet.</p>}
                    {rows?.map((r) => (
                        <button key={r.id} className={`pos-sale-row ${sel?.id === r.id ? "is-on" : ""} ${r.status === "VOID" ? "is-void" : ""}`} onClick={() => { setSel(r); setVoiding(false); }}>
                            <span><b>{r.receipt_no}</b><small>{fmtTime(r.date)} · {r.customer}</small></span>
                            <span className="pos-sale-amt">{r.status === "VOID" ? <em>VOID</em> : null}{n2(r.total)}</span>
                        </button>
                    ))}
                </div>
                <div className="pos-sales-view">
                    {sel ? (
                        <>
                            <ReceiptPaper sale={sel} settings={settings} />
                            {sel.status === "VOID" ? (
                                <p className="pos-err">Voided: {sel.void_reason}</p>
                            ) : voiding ? (
                                <div className="pos-void">
                                    <input className="pos-input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for voiding" />
                                    <button className="pos-btn" onClick={() => setVoiding(false)} disabled={busy}>Cancel</button>
                                    <button className="pos-btn pos-btn-danger" onClick={doVoid} disabled={busy || !reason.trim()}>{busy ? "Voiding…" : "Void sale"}</button>
                                </div>
                            ) : (
                                <div className="pos-void">
                                    <button className="pos-btn pos-btn-danger" onClick={() => setVoiding(true)}><Ico n="x" s={15} />Void</button>
                                    <button className="pos-btn pos-btn-primary" onClick={() => onPrint(sel)}><Ico n="print" s={15} />Reprint</button>
                                </div>
                            )}
                        </>
                    ) : <p className="pos-muted">Pick a sale.</p>}
                </div>
            </div>
        </Dialog>
    );
}

/* =========================================================
   Close shift (Z-report)
   ========================================================= */
function CloseShiftDialog({ shift, onClose, onClosed, onPrint, notify }) {
    const [sum, setSum] = useState(null);
    const [counted, setCounted] = useState("");
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(null);
    useEffect(() => {
        apiFetch(`/pos/shift/${shift.id}/summary`).then(setSum).catch((e) => notify(e.message || "Couldn't load the shift.", "error"));
    }, [shift.id, notify]);
    const c = Number(String(counted).replace(/,/g, "")) || 0;
    const diff = sum ? r2(c - sum.expected_cash) : 0;

    const close = async () => {
        setBusy(true);
        try {
            const r = await apiFetch("/pos/shift/close", { method: "POST", body: JSON.stringify({ shift_id: shift.id, counted_cash: c, notes }) });
            setDone(r);
            notify("Shift closed.");
        } catch (e) { notify(e.message || "Couldn't close the shift.", "error"); } finally { setBusy(false); }
    };
    const data = done || sum;

    return (
        <Dialog title={done ? "Shift closed" : "Close shift"} onClose={done ? () => { onClose(); onClosed(); } : onClose}
            footer={done ? <>
                <button className="pos-btn" onClick={() => onPrint(done)}><Ico n="print" s={15} />Print Z-report</button>
                <button className="pos-btn pos-btn-primary" onClick={() => { onClose(); onClosed(); }}>Done</button>
            </> : <>
                <button className="pos-btn" onClick={onClose}>Cancel</button>
                <button className="pos-btn pos-btn-primary" onClick={close} disabled={busy || !sum || counted === ""}>{busy ? "Closing…" : "Close shift"}</button>
            </>}>
            {!data ? <p className="pos-muted">Loading…</p> : (
                <>
                    <div className="pos-zgrid">
                        <div><small>Sales</small><b>{data.sales_count}</b></div>
                        <div><small>Net sales</small><b>{peso(data.net)}</b></div>
                        <div><small>Voids</small><b>{data.void_count}</b></div>
                    </div>
                    <div className="pos-zlist">
                        <div><span>Opening cash</span><b>{n2(data.shift.opening_cash)}</b></div>
                        {METHODS.map((m) => <div key={m.key}><span><i style={{ background: m.color }} />{m.label}</span><b>{n2(data.by_method[m.key])}</b></div>)}
                        <div><span>Discounts</span><b>{n2(data.discount)}</b></div>
                        <div className="is-strong"><span>Expected cash in drawer</span><b>{n2(data.expected_cash)}</b></div>
                    </div>
                    {!done ? (
                        <>
                            <label className="pos-field" style={{ marginTop: 14 }}>
                                <span>Counted cash</span>
                                <div className="pos-money"><em>₱</em><input autoFocus inputMode="decimal" value={counted} placeholder="0.00" onChange={(e) => setCounted(e.target.value.replace(/[^\d.,]/g, ""))} /></div>
                            </label>
                            {counted !== "" && <p className={`pos-over ${diff < 0 ? "is-short" : diff > 0 ? "is-over" : "is-even"}`}>{diff === 0 ? "Drawer is balanced" : diff < 0 ? `Short ${peso(-diff)}` : `Over ${peso(diff)}`}</p>}
                            <label className="pos-field"><span>Notes</span><textarea className="pos-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
                        </>
                    ) : (
                        <p className={`pos-over ${done.shift.over_short < 0 ? "is-short" : done.shift.over_short > 0 ? "is-over" : "is-even"}`}>
                            Counted {peso(done.shift.counted_cash)} · {done.shift.over_short === 0 ? "balanced" : done.shift.over_short < 0 ? `short ${peso(-done.shift.over_short)}` : `over ${peso(done.shift.over_short)}`}
                        </p>
                    )}
                </>
            )}
        </Dialog>
    );
}

/* =========================================================
   Settings
   ========================================================= */
function SettingsDialog({ settings, accounts, onClose, onSaved, notify }) {
    const [f, setF] = useState({
        store_name: settings?.store_name || "", address: settings?.address || "", tin: settings?.tin || "", footer: settings?.footer || "",
        paper: String(settings?.paper || 80), ar_account: settings?.ar_account || "", cash_account: settings?.cash_account || "",
        gcash_account: settings?.gcash_account || "", card_account: settings?.card_account || "", allow_negative: !!settings?.allow_negative,
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
    const save = async () => {
        setBusy(true);
        setErr("");
        try {
            const r = await apiFetch("/pos/settings", { method: "POST", body: JSON.stringify({ ...f, paper: Number(f.paper) }) });
            notify(r.message || "Saved.");
            onSaved(r.settings);
        } catch (e) { setErr(e.message || "Couldn't save."); } finally { setBusy(false); }
    };
    const acct = (k, label, required) => (
        <label key={k} className="pos-field"><span>{label}{required && <b className="pos-req"> *</b>}</span>
            <select className="pos-input" value={f[k]} onChange={(e) => set(k, e.target.value)}>
                <option value="">{required ? "— Choose —" : "— Not used —"}</option>
                {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}
            </select>
        </label>
    );
    return (
        <Dialog title="POS settings" wide onClose={onClose}
            footer={<>
                <button className="pos-btn" onClick={onClose}>Cancel</button>
                <button className="pos-btn pos-btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
            </>}>
            {err && <div className="pos-err" style={{ marginBottom: 10 }}>{err}</div>}
            <h4 className="pos-h">Receipt</h4>
            <div className="pos-two">
                <label className="pos-field"><span>Store name</span><input className="pos-input" value={f.store_name} onChange={(e) => set("store_name", e.target.value)} /></label>
                <label className="pos-field"><span>TIN</span><input className="pos-input" value={f.tin} onChange={(e) => set("tin", e.target.value)} /></label>
                <label className="pos-field"><span>Address</span><input className="pos-input" value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
                <label className="pos-field"><span>Paper</span>
                    <div className="pos-seg">
                        {["58", "80"].map((p) => <button key={p} type="button" className={f.paper === p ? "is-on" : ""} onClick={() => set("paper", p)}>{p} mm</button>)}
                    </div>
                </label>
            </div>
            <label className="pos-field"><span>Footer</span><input className="pos-input" value={f.footer} onChange={(e) => set("footer", e.target.value)} /></label>
            <h4 className="pos-h">Accounts</h4>
            <div className="pos-two">
                {acct("ar_account", "Sales invoice debit (Accounts Receivable)", true)}
                {acct("cash_account", "Cash", true)}
                {acct("gcash_account", "GCash")}
                {acct("card_account", "Card")}
            </div>
            <label className="pos-check">
                <input type="checkbox" checked={f.allow_negative} onChange={(e) => set("allow_negative", e.target.checked)} />
                <span>Allow selling items with no stock</span>
            </label>
        </Dialog>
    );
}

/* =========================================================
   Receipt (58 / 80 mm) and Z-report
   ========================================================= */
function ReceiptPaper({ sale, settings }) {
    return (
        <div className="pos-paper">
            <div className="pp-c">
                <b className="pp-store">{settings?.store_name || "Store"}</b>
                {settings?.address && <div>{settings.address}</div>}
                {settings?.tin && <div>TIN {settings.tin}</div>}
            </div>
            <div className="pp-hr" />
            <div className="pp-row"><span>Receipt</span><span>{sale.receipt_no}</span></div>
            <div className="pp-row"><span>Date</span><span>{fmtTime(sale.date)}</span></div>
            <div className="pp-row"><span>Cashier</span><span>{sale.cashier}</span></div>
            <div className="pp-row"><span>Customer</span><span>{sale.customer}</span></div>
            {sale.customer_tin && <div className="pp-row"><span>TIN</span><span>{sale.customer_tin}</span></div>}
            <div className="pp-hr" />
            {sale.lines.map((l, i) => (
                <div key={i} className="pp-line">
                    <div>{l.name}</div>
                    <div className="pp-row"><span>{qtyText(l.qty)} × {n2(l.price)}{l.discount > 0 ? ` (−${n2(l.discount)})` : ""}{l.vat_type !== "vatable" ? ` ${l.vat_type === "exempt" ? "E" : l.vat_type === "zero" ? "Z" : "N"}` : ""}</span><span>{n2(l.amount)}</span></div>
                </div>
            ))}
            <div className="pp-hr" />
            <div className="pp-row"><span>Subtotal</span><span>{n2(sale.sub_total)}</span></div>
            {sale.discount > 0 && <div className="pp-row"><span>Discount</span><span>−{n2(sale.discount)}</span></div>}
            <div className="pp-row pp-total"><span>TOTAL</span><span>{n2(sale.total)}</span></div>
            {sale.payments.map((p, i) => (
                <div key={i} className="pp-row"><span>{p.label || methodOf(p.method).label}{p.reference ? ` #${p.reference}` : ""}</span><span>{n2(p.tendered ?? p.amount)}</span></div>
            ))}
            {sale.change > 0 && <div className="pp-row"><span>Change</span><span>{n2(sale.change)}</span></div>}
            <div className="pp-hr" />
            <div className="pp-row"><span>VATable sales</span><span>{n2(sale.lines.filter((l) => l.vat_type === "vatable").reduce((a, l) => a + l.amount, 0) - sale.vat)}</span></div>
            <div className="pp-row"><span>VAT (12%)</span><span>{n2(sale.vat)}</span></div>
            <div className="pp-row"><span>VAT-exempt</span><span>{n2(sale.lines.filter((l) => l.vat_type === "exempt").reduce((a, l) => a + l.amount, 0))}</span></div>
            <div className="pp-row"><span>Zero-rated</span><span>{n2(sale.lines.filter((l) => l.vat_type === "zero").reduce((a, l) => a + l.amount, 0))}</span></div>
            <div className="pp-hr" />
            {sale.status === "VOID" && <div className="pp-c pp-void">*** VOID ***</div>}
            <div className="pp-c">{settings?.footer || "Thank you!"}</div>
            <div className="pp-c pp-small">{sale.invoice_no}</div>
        </div>
    );
}

function ZReport({ data, settings }) {
    return (
        <div className="pos-paper">
            <div className="pp-c"><b className="pp-store">{settings?.store_name || "Store"}</b><div>Z-READING</div></div>
            <div className="pp-hr" />
            <div className="pp-row"><span>Shift</span><span>{data.shift.shift_no}</span></div>
            <div className="pp-row"><span>Cashier</span><span>{data.shift.cashier}</span></div>
            <div className="pp-row"><span>Opened</span><span>{fmtTime(data.shift.opened_at)}</span></div>
            <div className="pp-row"><span>Closed</span><span>{fmtTime(data.shift.closed_at)}</span></div>
            <div className="pp-hr" />
            <div className="pp-row"><span>Sales</span><span>{data.sales_count}</span></div>
            <div className="pp-row"><span>Gross</span><span>{n2(data.gross)}</span></div>
            <div className="pp-row"><span>Discounts</span><span>{n2(data.discount)}</span></div>
            <div className="pp-row pp-total"><span>NET</span><span>{n2(data.net)}</span></div>
            <div className="pp-row"><span>VAT</span><span>{n2(data.vat)}</span></div>
            <div className="pp-row"><span>Voids ({data.void_count})</span><span>{n2(data.void_total)}</span></div>
            <div className="pp-hr" />
            {METHODS.map((m) => <div key={m.key} className="pp-row"><span>{m.label}</span><span>{n2(data.by_method[m.key])}</span></div>)}
            <div className="pp-hr" />
            <div className="pp-row"><span>Opening cash</span><span>{n2(data.shift.opening_cash)}</span></div>
            <div className="pp-row"><span>Expected cash</span><span>{n2(data.expected_cash)}</span></div>
            <div className="pp-row"><span>Counted cash</span><span>{n2(data.shift.counted_cash)}</span></div>
            <div className="pp-row pp-total"><span>Over / Short</span><span>{n2(data.shift.over_short)}</span></div>
        </div>
    );
}