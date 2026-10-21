// STAFF → ARCHIVE: every file in the S3 bucket, like a file manager.
// View / open / download: all staff. New folder, rename folder, upload: IT OFFICER only. Nothing can be deleted.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal, { Field } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiForm } from "../../context/AuthContext";
import "./Archive.css";

/* ---------- helpers ---------- */
const TYPES = [
    { key: "documents", label: "Documents", icon: "doc", tone: "blue" },
    { key: "photos", label: "Photos", icon: "photo", tone: "green" },
    { key: "videos", label: "Videos", icon: "video", tone: "orange" },
    { key: "others", label: "Others", icon: "file", tone: "teal" },
];
const TYPE_COLOR = { documents: "#2f6fe4", photos: "#22a06b", videos: "#f5a524", others: "#ef4444" };
const EXT_COLOR = {
    pdf: "#e5383b", doc: "#2f6fe4", docx: "#2f6fe4", xls: "#21a366", xlsx: "#21a366", csv: "#21a366",
    ppt: "#e5383b", pptx: "#e5383b", txt: "#3b82f6", jpg: "#e5383b", jpeg: "#e5383b", png: "#8b5cf6", gif: "#8b5cf6",
    webp: "#8b5cf6", mp4: "#f5a524", mov: "#f5a524", zip: "#1d6fe8", rar: "#1d6fe8", gz: "#1d6fe8", sql: "#0ea5a4",
};

// how the folders panel shows items: list, small, medium, large
const LAYOUTS = [
    { key: "list", label: "List", icon: "list" },
    { key: "small", label: "Small icons", icon: "gridS" },
    { key: "medium", label: "Medium icons", icon: "gridM" },
    { key: "large", label: "Large icons", icon: "gridL" },
];
const ART = { small: 30, medium: 46, large: 72, list: 24 };

const unitOf = (max) => (max >= 1024 ** 3 ? ["GB", 1024 ** 3] : max >= 1024 ** 2 ? ["MB", 1024 ** 2] : ["KB", 1024]);
export function bytes(n) {
    if (n == null) return "—";
    if (n < 1024) return `${n} B`;
    const [u, d] = unitOf(n);
    const v = n / d;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${u}`;
}
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-PH", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const shortDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-PH", { day: "2-digit", month: "short" }) : "—");

const store = {
    get(k, d) { try { const v = JSON.parse(sessionStorage.getItem(k) ?? "null"); return v ?? d; } catch { return d; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
    lget(k, d) { try { const v = JSON.parse(localStorage.getItem(k) ?? "null"); return v ?? d; } catch { return d; } },
    lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

/* ---------- icons ---------- */
function I({ n, s = 18 }) {
    const p = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
    switch (n) {
        case "video": return <svg {...p}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3" /></svg>;
        case "photo": return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>;
        case "doc": return <svg {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>;
        case "file": return <svg {...p}><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>;
        case "menu": return <svg {...p}><path d="M5 8h14M5 12h14M5 16h14" /></svg>;
        case "dots": return <svg {...p}><circle cx="12" cy="5" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="19" r="1.4" fill="currentColor" /></svg>;
        case "star": return <svg {...p}><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z" /></svg>;
        case "upload": return <svg {...p}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>;
        case "plus": return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
        case "refresh": return <svg {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg>;
        case "search": return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
        case "x": return <svg {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>;
        case "back": return <svg {...p}><path d="m15 18-6-6 6-6" /></svg>;
        case "list": return <svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
        case "gridS": return <svg {...p}><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="10" y="3" width="5" height="5" rx="1" /><rect x="17" y="3" width="4" height="5" rx="1" /><rect x="3" y="10" width="5" height="5" rx="1" /><rect x="10" y="10" width="5" height="5" rx="1" /><rect x="17" y="10" width="4" height="5" rx="1" /><rect x="3" y="17" width="5" height="4" rx="1" /><rect x="10" y="17" width="5" height="4" rx="1" /><rect x="17" y="17" width="4" height="4" rx="1" /></svg>;
        case "gridM": return <svg {...p}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>;
        case "gridL": return <svg {...p}><rect x="3" y="3" width="18" height="11" rx="2" /><rect x="3" y="17" width="18" height="4" rx="1.5" /></svg>;
        case "home": return <svg {...p}><path d="M3 11 12 3l9 8M5 10v10h14V10" /></svg>;
        default: return null;
    }
}
const FolderArt = ({ s = 46 }) => (
    <svg width={s} height={s * 0.8} viewBox="0 0 48 38" aria-hidden="true">
        <path d="M2 6a4 4 0 0 1 4-4h11l5 5h20a4 4 0 0 1 4 4v3H2z" fill="#f0a500" />
        <path d="M2 12h44v20a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" fill="#ffc83d" />
    </svg>
);
const FileArt = ({ ext, s = 46 }) => {
    const c = EXT_COLOR[ext] || "#64748b";
    const label = (ext || "file").slice(0, 4).toUpperCase();
    return (
        <svg width={s * 0.82} height={s} viewBox="0 0 38 46" aria-hidden="true">
            <path d="M4 0h21l13 13v29a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill={c} />
            <path d="M25 0v9a4 4 0 0 0 4 4h9z" fill="#fff" opacity=".45" />
            <text x="19" y="34" textAnchor="middle" fontSize={label.length > 3 ? 7.5 : 9} fontWeight="700" fill="#fff" fontFamily="inherit">{label}</text>
        </svg>
    );
};

/* ============================================================== */
export default function Archive() {
    const notify = useToast();
    const { user } = useAuth();
    const starKey = `archive.stars:${user?.id ?? "me"}`;

    const [prefix, setPrefix] = useState(() => store.get("archive.prefix", ""));
    const [list, setList] = useState(null);           // { folders, files, next, can_manage }
    const [listErr, setListErr] = useState("");
    const [more, setMore] = useState(false);
    const [summary, setSummary] = useState(null);
    const [sumBusy, setSumBusy] = useState(false);
    const [q, setQ] = useState("");
    const [view, setView] = useState(null);           // category key → newest files of that type
    const [starOnly, setStarOnly] = useState(false);
    const [layout, setLayout] = useState(() => {
        const v = store.lget("archive.layout", "medium");
        return LAYOUTS.some((l) => l.key === v) ? v : "medium";
    });
    useEffect(() => store.lset("archive.layout", layout), [layout]);
    const [stars, setStars] = useState(() => store.lget(starKey, []));
    const [uploads, setUploads] = useState([]);       // this session: { id, name, size, state, pct }
    const [folderDlg, setFolderDlg] = useState(null); // { mode: "new" | "rename", path?, name }
    const fileInput = useRef(null);

    const canManage = !!(list?.can_manage ?? summary?.can_manage);

    /* ---------- data ---------- */
    const load = useCallback((p = prefix) => {
        setListErr("");
        setList(null);
        apiFetch(`/archive?prefix=${encodeURIComponent(p)}`)
            .then(setList)
            .catch((e) => setListErr(e.message || "Couldn't open the folder."));
    }, [prefix]);

    const loadSummary = useCallback((refresh = false) => {
        setSumBusy(true);
        apiFetch(`/archive/summary${refresh ? "?refresh=1" : ""}`)
            .then((s) => { setSummary(s); if (refresh) load(); })
            .catch(() => { /* the folders still work without it */ })
            .finally(() => setSumBusy(false));
    }, [load]);

    useEffect(() => { store.set("archive.prefix", prefix); load(prefix); }, [prefix]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { loadSummary(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => store.lset(starKey, stars), [starKey, stars]);

    const loadMore = async () => {
        if (!list?.next) return;
        setMore(true);
        try {
            const r = await apiFetch(`/archive?prefix=${encodeURIComponent(prefix)}&token=${encodeURIComponent(list.next)}`);
            setList((l) => ({ ...r, folders: [...l.folders, ...r.folders], files: [...l.files, ...r.files] }));
        } catch (e) {
            notify(e.message || "Couldn't load more.", "error");
        } finally {
            setMore(false);
        }
    };

    const go = (p) => { setView(null); setQ(""); setPrefix(p); };
    const crumbs = useMemo(() => {
        const parts = prefix.split("/").filter(Boolean);
        return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join("/") + "/" }));
    }, [prefix]);

    const isStar = (id) => stars.includes(id);
    const toggleStar = (id) => setStars((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

    /* ---------- open / download ---------- */
    const openFile = async (f, download = false) => {
        // open the tab first (popup blockers), then point it at the signed link
        const w = download ? null : window.open("about:blank", "_blank");
        try {
            const r = await apiFetch(`/archive/file?key=${encodeURIComponent(f.key)}${download ? "&download=1" : ""}`);
            if (w) w.location.href = r.url;
            else {
                const a = document.createElement("a");
                a.href = r.url; a.download = r.name; a.rel = "noopener";
                document.body.appendChild(a); a.click(); a.remove();
            }
        } catch (e) {
            w?.close();
            notify(e.message || "Couldn't open the file.", "error");
        }
    };
    const copy = (text) => navigator.clipboard?.writeText(text).then(() => notify("Copied."));

    /* ---------- IT Officer ---------- */
    const saveFolder = async () => {
        const d = folderDlg;
        setFolderDlg({ ...d, busy: true, error: "" });
        try {
            const r = d.mode === "new"
                ? await apiFetch("/archive/folder", { method: "POST", body: JSON.stringify({ prefix, name: d.name }) })
                : await apiFetch("/archive/folder", { method: "PUT", body: JSON.stringify({ path: d.path, name: d.name }) });
            notify(r.message);
            setFolderDlg(null);
            if (d.mode === "rename" && stars.includes(d.path)) setStars((s) => s.map((x) => (x === d.path ? r.path : x)));
            if (d.mode === "rename" && prefix.startsWith(d.path)) go(r.path + prefix.slice(d.path.length));
            else load();
            loadSummary(false);
        } catch (e) {
            setFolderDlg({ ...d, busy: false, error: e.message || "Couldn't save the folder." });
        }
    };

    const pickFiles = async (e) => {
        const files = [...(e.target.files || [])];
        e.target.value = "";
        if (!files.length) return;
        const target = prefix;
        const rows = files.map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.name, size: f.size, state: f.size > 20 * 1024 * 1024 ? "error" : "wait", error: f.size > 20 * 1024 * 1024 ? "Too big (20 MB max)" : "" }));
        setUploads((u) => [...rows, ...u].slice(0, 12));
        let ok = 0;
        for (let i = 0; i < files.length; i++) {
            if (rows[i].state === "error") continue;
            setUploads((u) => u.map((x) => (x.id === rows[i].id ? { ...x, state: "up" } : x)));
            try {
                const fd = new FormData();
                fd.append("prefix", target);
                fd.append("file", files[i]);
                await apiForm("/archive/upload", fd);
                ok++;
                setUploads((u) => u.map((x) => (x.id === rows[i].id ? { ...x, state: "done" } : x)));
            } catch (err) {
                setUploads((u) => u.map((x) => (x.id === rows[i].id ? { ...x, state: "error", error: err.message || "Upload failed" } : x)));
            }
        }
        if (ok) { notify(`${ok} file(s) uploaded.`); if (target === prefix) load(target); loadSummary(false); }
    };

    /* ---------- what the panel shows ---------- */
    const needle = q.trim().toLowerCase();
    const match = (name) => !needle || name.toLowerCase().includes(needle);
    const catType = TYPES.find((t) => t.key === view);
    const folders = view ? [] : (list?.folders || []).filter((f) => match(f.name) && (!starOnly || isStar(f.path)));
    const files = (view ? summary?.latest?.[view] || [] : list?.files || []).filter((f) => match(f.name) && (!starOnly || isStar(f.key)));

    return (
        <div className="arc">
            <div className="arc-grid">
                {/* ---------------- left column ---------------- */}
                <aside className="arc-side">
                    <StorageChart summary={summary} busy={sumBusy} onRefresh={() => loadSummary(true)} />

                    <section className="arc-card arc-history">
                        <header><h3>File Upload History</h3></header>
                        {uploads.length > 0 && (
                            <ul className="arc-up">
                                {uploads.map((u) => (
                                    <li key={u.id} className={`is-${u.state}`}>
                                        <span className="arc-up-ico" style={{ background: (EXT_COLOR[u.name.split(".").pop().toLowerCase()] || "#64748b") + "22" }}>
                                            <FileArt ext={u.name.split(".").pop().toLowerCase()} s={22} />
                                        </span>
                                        <span className="arc-up-body">
                                            <b title={u.name}>{u.name}</b>
                                            <small>{u.state === "error" ? u.error : bytes(u.size)}</small>
                                            <span className="arc-bar"><i style={{ width: u.state === "done" ? "100%" : u.state === "up" ? undefined : u.state === "error" ? "100%" : "0%" }} /></span>
                                        </span>
                                        <span className="arc-up-end">
                                            <button className="arc-icon-btn" onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))} aria-label={`Remove ${u.name}`} disabled={u.state === "up"}><I n="x" s={14} /></button>
                                            <em>{u.state === "done" ? "100%" : u.state === "up" ? "…" : u.state === "error" ? "Failed" : "0%"}</em>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <h4 className="arc-sub">Recently added</h4>
                        {!summary && <p className="arc-muted">{sumBusy ? "Reading the archive…" : "—"}</p>}
                        {summary && (
                            <ul className="arc-recent">
                                {summary.recent.map((f) => (
                                    <li key={f.key}>
                                        <button onClick={() => openFile(f)} title={f.key}>
                                            <FileArt ext={f.ext} s={26} />
                                            <span><b>{f.name}</b><small>{bytes(f.size)} · {day(f.modified)}</small></span>
                                        </button>
                                    </li>
                                ))}
                                {!summary.recent.length && <li className="arc-muted">No files yet.</li>}
                            </ul>
                        )}
                    </section>
                </aside>

                {/* ---------------- right column ---------------- */}
                <main className="arc-main">
                    <div className="arc-types">
                        {TYPES.map((t) => {
                            const s = summary?.types?.[t.key];
                            return (
                                <button key={t.key} className={`arc-type tone-${t.tone}${view === t.key ? " is-on" : ""}`} onClick={() => { setView(view === t.key ? null : t.key); setQ(""); }}>
                                    <span className="arc-tab" />
                                    <span className="arc-type-top">
                                        <span className="arc-type-ico"><I n={t.icon} s={20} /></span>
                                        <span className="arc-type-txt"><b>{t.label}</b><small>{s ? `${s.count.toLocaleString()} file${s.count === 1 ? "" : "s"} · ${bytes(s.size)}` : "…"}</small></span>
                                        <span className="arc-type-menu"><I n="menu" s={15} /></span>
                                    </span>
                                    <span className="arc-type-pill">Last Modified:<b>{s?.last ? shortDay(s.last) : "—"}</b></span>
                                </button>
                            );
                        })}
                    </div>

                    <section className="arc-card arc-panel">
                        <header className="arc-panel-head">
                            <div className="arc-crumbs">
                                {view ? (
                                    <>
                                        <button className="arc-icon-btn" onClick={() => setView(null)} aria-label="Back to folders"><I n="back" s={16} /></button>
                                        <h3>Latest {catType?.label}</h3>
                                    </>
                                ) : (
                                    <>
                                        <h3>Folders</h3>
                                        <nav aria-label="Folder path">
                                            <button onClick={() => go("")} className={crumbs.length ? "" : "is-on"}><I n="home" s={14} /> Archive</button>
                                            {crumbs.map((c, i) => (
                                                <span key={c.path}>
                                                    <i>/</i>
                                                    <button onClick={() => go(c.path)} className={i === crumbs.length - 1 ? "is-on" : ""}>{c.name}</button>
                                                </span>
                                            ))}
                                        </nav>
                                    </>
                                )}
                            </div>
                            <div className="arc-tools">
                                <label className="arc-search">
                                    <I n="search" s={15} />
                                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={view ? "Search files" : "Search this folder"} aria-label="Search" />
                                </label>
                                <button className={`arc-btn${starOnly ? " is-on" : ""}`} onClick={() => setStarOnly(!starOnly)} title="Starred only"><I n="star" s={15} /> Starred</button>
                                <div className="arc-seg" role="radiogroup" aria-label="View">
                                    {LAYOUTS.map((l) => (
                                        <button key={l.key} role="radio" aria-checked={layout === l.key} className={layout === l.key ? "is-on" : ""}
                                            onClick={() => setLayout(l.key)} title={l.label} aria-label={l.label}><I n={l.icon} s={15} /></button>
                                    ))}
                                </div>
                                <button className="arc-btn" onClick={() => (view ? loadSummary(true) : load())} title="Refresh"><I n="refresh" s={15} /></button>
                                {canManage && !view && (
                                    <>
                                        <button className="arc-btn" onClick={() => setFolderDlg({ mode: "new", name: "" })}><I n="plus" s={15} /> New folder</button>
                                        <button className="arc-btn arc-btn-primary" onClick={() => fileInput.current?.click()}><I n="upload" s={15} /> Upload</button>
                                        <input ref={fileInput} type="file" multiple hidden onChange={pickFiles} />
                                    </>
                                )}
                            </div>
                        </header>

                        {!view && listErr && <div className="alert-error" role="alert">{listErr} <button className="btn btn-sm" onClick={() => load()}>Try again</button></div>}
                        {!view && !list && !listErr && (
                            <div className={`arc-items is-${layout}`}>{Array.from({ length: 8 }, (_, i) => <div key={i} className="arc-item is-sk">{layout !== "list" && <span className="arc-tab" />}</div>)}</div>
                        )}
                        {view && !summary && <p className="arc-muted">{sumBusy ? "Reading the archive…" : "—"}</p>}

                        {(view ? summary : list) && (
                            <>
                                <div className={`arc-items is-${layout}`} role={layout === "list" ? "table" : undefined}>
                                    {layout === "list" && (folders.length > 0 || files.length > 0) && (
                                        <div className="arc-row arc-row-head" role="row">
                                            <span /><span role="columnheader">Name</span><span role="columnheader">Size</span>
                                            <span role="columnheader">{view ? "Folder" : "Type"}</span><span role="columnheader">Last modified</span><span />
                                        </div>
                                    )}
                                    {folders.map((f) => (
                                        <Item key={f.path} layout={layout} kind="Folder" size={f.size} extra={f.count != null ? `${f.count.toLocaleString()} file${f.count === 1 ? "" : "s"}` : "—"} modified={f.modified} star={isStar(f.path)} onStar={() => toggleStar(f.path)} onOpen={() => go(f.path)}
                                            art={<FolderArt s={ART[layout]} />} name={f.name} meta={f.size != null ? `${bytes(f.size)} · ${f.count.toLocaleString()} file${f.count === 1 ? "" : "s"}` : "Folder"}
                                            menu={[
                                                ["Open", () => go(f.path)],
                                                ["Copy path", () => copy(f.path)],
                                                canManage && ["Rename", () => setFolderDlg({ mode: "rename", path: f.path, name: f.name })],
                                            ]} />
                                    ))}
                                    {files.map((f) => (
                                        <Item key={f.key} layout={layout} kind={(f.ext || "file").toUpperCase()} size={f.size} modified={f.modified}
                                            extra={view ? f.key.slice(0, f.key.lastIndexOf("/") + 1) || "/" : (f.ext || "file").toUpperCase()} star={isStar(f.key)} onStar={() => toggleStar(f.key)} onOpen={() => openFile(f)}
                                            art={<FileArt ext={f.ext} s={ART[layout]} />} name={f.name} title={f.key} meta={`${bytes(f.size)}${view ? ` · ${shortDay(f.modified)}` : ""}`}
                                            menu={[
                                                ["Open", () => openFile(f)],
                                                ["Download", () => openFile(f, true)],
                                                ["Copy path", () => copy(f.key)],
                                                view && ["Show folder", () => go(f.key.slice(0, f.key.lastIndexOf("/") + 1))],
                                            ]} />
                                    ))}
                                </div>
                                {!folders.length && !files.length && (
                                    <p className="arc-empty">{needle || starOnly ? "Nothing matches." : "This folder is empty."}</p>
                                )}
                                {!view && list?.next && (
                                    <div className="arc-more"><button className="arc-btn" onClick={loadMore} disabled={more}>{more ? "Loading…" : "Load more"}</button></div>
                                )}
                            </>
                        )}
                    </section>
                </main>
            </div>

            {folderDlg && (
                <Modal title={folderDlg.mode === "new" ? "New folder" : `Rename “${folderDlg.path.split("/").filter(Boolean).pop()}”`}
                    onClose={() => !folderDlg.busy && setFolderDlg(null)} size="sm"
                    footer={
                        <>
                            <button className="btn" onClick={() => setFolderDlg(null)} disabled={folderDlg.busy}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveFolder} disabled={folderDlg.busy || !folderDlg.name.trim()}>
                                {folderDlg.busy ? "Saving…" : folderDlg.mode === "new" ? "Create" : "Rename"}
                            </button>
                        </>
                    }>
                    {folderDlg.error && <div className="alert-error" role="alert">{folderDlg.error}</div>}
                    <Field label="Folder name">
                        <input className="input" autoFocus value={folderDlg.name} maxLength={120}
                            onChange={(e) => setFolderDlg({ ...folderDlg, name: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && folderDlg.name.trim() && !folderDlg.busy && saveFolder()} />
                    </Field>
                    <p className="arc-muted">
                        {folderDlg.mode === "new" ? `Inside: ${prefix || "Archive (top level)"}` : "Every file inside is moved to the new name. Big folders take a while."}
                    </p>
                </Modal>
            )}

        </div>
    );
}

/* ---------- one folder / file card ---------- */
function Item({ art, name, title, meta, star, onStar, onOpen, menu, layout = "medium", size, extra, modified }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const off = (e) => !ref.current?.contains(e.target) && setOpen(false);
        document.addEventListener("mousedown", off);
        return () => document.removeEventListener("mousedown", off);
    }, [open]);
    const items = menu.filter(Boolean);
    const dots = (
        <span className="arc-dots" ref={ref}>
            <button onClick={() => setOpen(!open)} aria-label={`Actions for ${name}`} aria-expanded={open}><I n="dots" s={16} /></button>
            {open && (
                <ul className="arc-menu" role="menu">
                    {items.map(([label, fn, tone]) => (
                        <li key={label}><button role="menuitem" className={tone === "danger" ? "is-danger" : ""} onClick={() => { setOpen(false); fn(); }}>{label}</button></li>
                    ))}
                </ul>
            )}
        </span>
    );
    const starBtn = <button className={`arc-star${star ? " is-on" : ""}`} onClick={onStar} aria-label={star ? "Unstar" : "Star"} aria-pressed={star}><I n="star" s={layout === "list" ? 15 : 17} /></button>;

    if (layout === "list") {
        return (
            <div className={`arc-row${open ? " is-menu" : ""}`} role="row">
                {starBtn}
                <button className="arc-row-name" onClick={onOpen} title={title || name} role="cell">
                    <span className="arc-art">{art}</span><b>{name}</b>
                </button>
                <span role="cell">{bytes(size)}</span>
                <span role="cell" className="arc-row-extra" title={extra}>{extra}</span>
                <span role="cell">{day(modified)}</span>
                {dots}
            </div>
        );
    }

    return (
        <div className={`arc-item${open ? " is-menu" : ""}`}>
            <span className="arc-tab" />
            {starBtn}
            {dots}
            <button className="arc-open" onClick={onOpen} title={title || name}>
                <span className="arc-art">{art}</span>
                <b>{name}</b>
                <small>{meta}</small>
            </button>
        </div>
    );
}

/* ---------- stacked bars: size added per month, by type ---------- */
function StorageChart({ summary, busy, onRefresh }) {
    const [hover, setHover] = useState(null);
    const months = summary?.months || [];
    const totals = months.map((m) => TYPES.reduce((a, t) => a + (m[t.key] || 0), 0));
    const max = Math.max(1, ...totals);
    const [unit, div] = unitOf(max);
    const top = (() => {                                   // a round axis maximum
        const v = max / div;
        const step = 10 ** Math.floor(Math.log10(v || 1));
        return Math.ceil(v / step) * step || 1;
    })();
    const ticks = [5, 4, 3, 2, 1, 0].map((i) => (top / 5) * i);

    return (
        <section className="arc-card arc-chart">
            <header>
                <h3>Storage</h3>
                <span className="arc-muted">{summary ? `${bytes(summary.total.size)} · ${summary.total.count.toLocaleString()} files` : busy ? "Reading…" : ""}</span>
                <button className="arc-icon-btn" onClick={onRefresh} disabled={busy} title={summary ? `Counted ${new Date(summary.scanned_at).toLocaleString()} – count again` : "Count again"}>
                    <I n="refresh" s={14} />
                </button>
            </header>
            <div className="arc-plot" onMouseLeave={() => setHover(null)}>
                <div className="arc-yaxis">{ticks.map((t) => <span key={t}>{`${+t.toFixed(1)}${unit}`}</span>)}</div>
                <div className="arc-bars">
                    {ticks.map((t) => <i key={t} className="arc-grid-line" style={{ bottom: `${(t / top) * 100}%` }} />)}
                    {months.map((m, i) => (
                        <div key={m.month} className="arc-col" onMouseEnter={() => setHover(i)}>
                            <div className="arc-stack" style={{ height: `${(totals[i] / div / top) * 100}%` }}>
                                {TYPES.filter((t) => m[t.key] > 0).map((t) => (
                                    <span key={t.key} style={{ flexGrow: m[t.key], background: TYPE_COLOR[t.key] }} />
                                ))}
                            </div>
                            <em>{m.label}</em>
                            {hover === i && (
                                <div className="arc-tip" role="tooltip">
                                    <b>{m.label} {m.month.slice(0, 4)}</b>
                                    {TYPES.map((t) => <span key={t.key}><i style={{ background: TYPE_COLOR[t.key] }} />{t.label}: {bytes(m[t.key] || 0)}</span>)}
                                </div>
                            )}
                        </div>
                    ))}
                    {!summary && <div className="arc-plot-empty">{busy ? "Counting every file… (first time takes a minute)" : "—"}</div>}
                </div>
            </div>
            <ul className="arc-legend">
                {TYPES.map((t) => <li key={t.key}><i style={{ background: TYPE_COLOR[t.key] }} />{t.label}</li>)}
            </ul>
        </section>
    );
}