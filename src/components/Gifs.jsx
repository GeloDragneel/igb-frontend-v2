// Messenger GIF tray, two tabs:
//   GIPHY     – live GIPHY search (trending when empty) through /messenger/giphy (the key stays on the server);
//               ★ saves a GIF to "Our list"
//   Our list  – the shared GIF library (links pasted by employees): search, + Add GIFs, remove your own
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../context/AuthContext";

const loadTab = () => { try { return localStorage.getItem("ms-gif-tab") || "giphy"; } catch { return "giphy"; } };

export function GifPicker({ onPick, onClose, notify, className = "" }) {
    const [tab, setTab] = useState(loadTab);
    const [q, setQ] = useState("");
    const ref = useRef(null);
    const [adding, setAdding] = useState(false);

    useEffect(() => { try { localStorage.setItem("ms-gif-tab", tab); } catch { /* ignore */ } }, [tab]);
    useEffect(() => {
        const onDown = (e) => !ref.current?.contains(e.target) && !e.target.closest?.(".ms-gif-btn") && onClose();
        const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), adding ? setAdding(false) : onClose());
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey, true);
        return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true); };
    }, [onClose, adding]);

    return (
        <div className={`ms-gifs ${className}`} ref={ref} role="dialog" aria-label="GIFs">
            {!adding && (
                <>
                    <div className="ms-gifs-tabs" role="tablist">
                        <button role="tab" aria-selected={tab === "giphy"} className={tab === "giphy" ? "is-on" : ""} onClick={() => setTab("giphy")}>GIPHY</button>
                        <button role="tab" aria-selected={tab === "list"} className={tab === "list" ? "is-on" : ""} onClick={() => setTab("list")}>Our list</button>
                    </div>
                    <div className="ms-gifs-top">
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "giphy" ? "Search GIPHY" : "Search our GIFs"} aria-label="Search GIFs" autoFocus />
                        {tab === "list" && <button type="button" className="ms-btn" onClick={() => setAdding(true)} title="Add GIF links">+ Add GIFs</button>}
                    </div>
                </>
            )}
            {tab === "giphy" && !adding
                ? <GiphyTab q={q} onPick={onPick} notify={notify} onUseList={() => setTab("list")} />
                : <ListTab q={q} onPick={onPick} notify={notify} adding={adding} setAdding={setAdding} />}
        </div>
    );
}

/* ---------------- GIPHY ---------------- */

function GiphyTab({ q, onPick, notify, onUseList }) {
    const [items, setItems] = useState(null);
    const [state, setState] = useState({ ready: true, more: false, next: 0, error: "" });
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState({});
    const reqId = useRef(0);

    const load = async (offset = 0) => {
        const id = ++reqId.current;
        setLoading(true);
        try {
            const r = await apiFetch(`/messenger/giphy?offset=${offset}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`);
            if (id !== reqId.current) return;
            setItems((cur) => (offset ? [...(cur || []), ...r.items] : r.items));
            setState({ ready: r.ready !== false, more: !!r.more, next: r.next || 0, error: r.error || "" });
        } catch (e) {
            if (id === reqId.current) { setItems([]); setState((s) => ({ ...s, error: e.message || "Couldn't load GIPHY." })); }
        }
        if (id === reqId.current) setLoading(false);
    };
    useEffect(() => { setItems(null); const t = setTimeout(() => load(0), q ? 400 : 0); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

    const save = async (g) => {
        setSaved((s) => ({ ...s, [g.id]: "…" }));
        try {
            const r = await apiFetch("/messenger/gifs", { method: "POST", body: JSON.stringify({ lines: `${(g.title || "GIF").replace(/\|/g, " ")} | ${g.url}` }) });
            setSaved((s) => ({ ...s, [g.id]: "✓" }));
            notify?.(r.added ? "Saved to Our list" : "Already in Our list");
        } catch (e) { setSaved((s) => ({ ...s, [g.id]: undefined })); notify?.(e.message || "Couldn't save.", "error"); }
    };

    // more results when scrolled near the end
    const onScroll = (e) => {
        const el = e.currentTarget;
        if (state.more && !loading && el.scrollHeight - el.scrollTop - el.clientHeight < 120) load(state.next);
    };

    if (!state.ready) {
        return (
            <div className="ms-gifs-grid"><div className="ms-empty">
                GIPHY search isn't set up yet.<br />Add <code>GIPHY_API_KEY</code> to the server's .env.<br /><br />
                <button className="ms-btn" onClick={onUseList}>Use Our list</button>
            </div></div>
        );
    }
    return (
        <>
            <div className="ms-gifs-grid" onScroll={onScroll}>
                {state.error && <div className="ms-empty">{state.error}</div>}
                {items === null && !state.error && <div className="ms-empty">Loading…</div>}
                {items && items.length === 0 && !state.error && <div className="ms-empty">No GIFs found.</div>}
                {(items || []).map((g) => (
                    <span key={g.id} className="ms-gif-cell">
                        <button type="button" onClick={() => onPick(g.url)} title={g.title || "Send GIF"} aria-label={`Send GIF ${g.title || ""}`}
                            style={{ aspectRatio: `${g.w || 4} / ${g.h || 3}` }}>
                            <img src={g.thumb} alt={g.title || "GIF"} loading="lazy" />
                        </button>
                        <button type="button" className={`ms-gif-save${saved[g.id] === "✓" ? " is-on" : ""}`} onClick={() => save(g)} disabled={!!saved[g.id]}
                            title="Save to Our list" aria-label="Save to Our list">{saved[g.id] === "✓" ? "✓" : "★"}</button>
                    </span>
                ))}
                {loading && items?.length > 0 && <div className="ms-empty">Loading…</div>}
            </div>
            <div className="ms-giphy-credit">Powered by <b>GIPHY</b></div>
        </>
    );
}

/* ---------------- Our list (shared library) ---------------- */

function ListTab({ q, onPick, notify, adding, setAdding }) {
    const [list, setList] = useState(null);
    const [lines, setLines] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);    // { added, skipped: [{ line, why }] }
    const [broken, setBroken] = useState({});      // id → true when the link doesn't load

    const load = (term = q) => apiFetch(`/messenger/gifs${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ""}`)
        .then(setList).catch((e) => { setList([]); notify?.(e.message || "Couldn't load GIFs.", "error"); });
    useEffect(() => { const t = setTimeout(() => load(q), q ? 300 : 0); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

    const save = async () => {
        setBusy(true);
        try {
            const r = await apiFetch("/messenger/gifs", { method: "POST", body: JSON.stringify({ lines }) });
            notify?.(r.message || "GIFs added");
            setResult(r);
            // keep only the lines that didn't go in, so they can be fixed and added again
            setLines((r.skipped || []).map((x) => x.line).join("\n"));
            if (r.added) load("");
            if (!r.skipped?.length) setAdding(false);
        } catch (e) { notify?.(e.message || "Couldn't add the GIFs.", "error"); }
        setBusy(false);
    };
    const remove = async (g) => {
        try { await apiFetch(`/messenger/gifs/${g.id}`, { method: "DELETE" }); setList((l) => l.filter((x) => x.id !== g.id)); }
        catch (e) { notify?.(e.message || "Couldn't remove.", "error"); }
    };

    if (adding) {
        return (
            <div className="ms-gifs-add">
                <strong>Add GIF links</strong>
                <small>One per line. Add a title to make it easy to search: <code>Congrats | https://…gif</code></small>
                {result && (
                    <div className="ms-gifs-result" role="status">
                        <b>{result.added} added{result.skipped?.length ? `, ${result.skipped.length} not added:` : ""}</b>
                        {(result.skipped || []).map((x, i) => (
                            <span key={i}><code>{x.line.length > 60 ? `${x.line.slice(0, 60)}…` : x.line}</code> – {x.why}</span>
                        ))}
                    </div>
                )}
                <textarea autoFocus value={lines} onChange={(e) => setLines(e.target.value)} rows={7}
                    placeholder={"Thank you | https://media.giphy.com/media/…/giphy.gif\nhttps://media.tenor.com/…/tenor.gif"} />
                <div className="ms-gifs-add-btns">
                    <button type="button" className="ms-btn" onClick={() => { setAdding(false); setResult(null); }}>{result ? "Done" : "Cancel"}</button>
                    <button type="button" className="ms-btn is-primary" disabled={busy || !lines.trim()} onClick={save}>{busy ? "Adding…" : "Add"}</button>
                </div>
            </div>
        );
    }
    return (
        <div className="ms-gifs-grid">
            {list === null && <div className="ms-empty">Loading…</div>}
            {list && list.length === 0 && (
                <div className="ms-empty">{q ? "No GIFs match." : <>No GIFs yet.<br />Use <b>+ Add GIFs</b>, or ★ a GIF in the GIPHY tab.</>}</div>
            )}
            {(list || []).map((g) => (
                <span key={g.id} className={`ms-gif-cell${broken[g.id] ? " is-broken" : ""}`}>
                    <button type="button" onClick={() => !broken[g.id] && onPick(g.url)} disabled={!!broken[g.id]}
                        title={broken[g.id] ? `Broken link: ${g.url}` : g.title || "Send GIF"} aria-label={`Send GIF ${g.title || ""}`}>
                        {broken[g.id]
                            ? <span className="ms-gif-broken">⚠️ Broken link<br /><em>{g.title || "no title"}</em></span>
                            : <img src={g.url} alt={g.title || "GIF"} loading="lazy" onError={() => setBroken((b) => ({ ...b, [g.id]: true }))} />}
                        {g.title && !broken[g.id] && <small>{g.title}</small>}
                    </button>
                    {g.mine && <button type="button" className="ms-gif-del" onClick={() => remove(g)} aria-label="Remove GIF" title="Remove (you added it)">×</button>}
                </span>
            ))}
        </div>
    );
}