// Financial Report → Financial Statement
// Comparative AFS from the ledger shown as an Excel workbook:
//   sheets SFP · SI · SCE · SCF · NFS, column letters, row numbers, name box, fx bar,
//   live formulas (totals = SUM, captions = note totals, net income = SI), editable cells.
// Download Excel = the same cells with the same formulas. Download PDF = what's on screen.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { acct, downloadPdf } from "./fsExport";
import { SHEETS, buildWorkbook, calculate, downloadWorkbook, toData, refsOf, colLetter, addr, parseAddr } from "./fsWorkbook";
import "./FsGrid.css";

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 12 }, (_, i) => thisYear - i);

export default function FinancialStatement() {
  const { user } = useAuth();
  const notify = useToast();
  const [year, setYear] = useState(thisYear - 1);
  const [compare, setCompare] = useState(thisYear - 2);
  const [branch, setBranch] = useState("current");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const [wb, setWb] = useState(null);              // workbook (cells + formulas)
  const [dirty, setDirty] = useState(false);
  const [sheet, setSheet] = useState("sfp");
  const [sel, setSel] = useState("A1");
  const [edit, setEdit] = useState(null);          // { text, from: "cell" | "bar" }
  const gridRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ year: String(year), branch });
      if (compare) q.set("compare", String(compare));
      const d = await apiFetch(`/reports/financial-statement?${q}`);
      setData(d);
      setWb(buildWorkbook(d));
      setDirty(false);
      setEdit(null);
    } catch (e) {
      setError(e.message || "Couldn't build the financial statement.");
      setData(null);
      setWb(null);
    } finally {
      setLoading(false);
    }
  }, [year, compare, branch]);

  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const calc = useMemo(() => (wb ? calculate(wb) : {}), [wb]);
  const sh = wb?.sheets[sheet];
  const sheetName = sh?.name;
  const cellAt = (a) => sh?.cells[a];
  const shown = (a) => calc[`${sheetName}!${a}`];
  const selCell = cellAt(sel);
  const selRefs = useMemo(() => refsOf(selCell?.f, sheet), [selCell?.f, sheet]);

  const problems = (data?.checks || []).filter((c) => Math.abs(c.diff) >= 1);
  const empty = data && data.statements.every((s) => s.lines.every((l) => !l.values || Object.values(l.values).every((v) => !Number(v))));

  /* ---------- editing ---------- */
  const commit = (text) => {
    const t = String(text ?? "").trim();
    setWb((w) => {
      const cells = { ...w.sheets[sheet].cells };
      const old = cells[sel] || {};
      if (t === "") {
        if (old.num) cells[sel] = { ...old, f: undefined, v: 0 };
        else delete cells[sel];
      } else if (t.startsWith("=")) {
        cells[sel] = { ...old, f: t.slice(1).toUpperCase().replace(/\s+/g, ""), num: true };
      } else {
        const n = Number(t.replace(/[,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
        const c = parseAddr(sel)?.c || 1;
        cells[sel] = c >= 3 && Number.isFinite(n) ? { ...old, f: undefined, v: n, num: true } : { ...old, f: undefined, v: t, num: false };
      }
      const p = parseAddr(sel);
      const s2 = { ...w.sheets[sheet], cells, rows: Math.max(w.sheets[sheet].rows, p?.r || 0) };
      return { ...w, sheets: { ...w.sheets, [sheet]: s2 } };
    });
    setDirty(true);
    setEdit(null);
  };

  const move = (dc, dr) => {
    const p = parseAddr(sel);
    if (!p || !sh) return;
    const c = Math.min(Math.max(1, p.c + dc), sh.cols);
    const r = Math.min(Math.max(1, p.r + dr), sh.rows + 5);
    setSel(addr(c, r));
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-a="${addr(c, r)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  };

  // click a note number → jump to that note on the NFS sheet
  const goNote = (no) => {
    const r = wb?.noteRow?.[Number(no)];
    if (!r) return;
    if (edit) commit(edit.text);
    setSheet("nfs");
    setSel(addr(1, r));
    setTimeout(() => {
      const el = gridRef.current?.querySelector(`[data-a="A${r}"]`);
      el?.scrollIntoView({ block: "start" });
      gridRef.current?.focus();
    }, 30);
  };
  const isNote = (a) => sheet !== "nfs" && a.startsWith("B") && !cellAt(a)?.f && wb?.noteRow?.[Number(cellAt(a)?.v)];

  const rawText = (cell) => (!cell ? "" : cell.f ? `=${cell.f}` : cell.v ?? "");

  const onGridKey = (e) => {
    if (edit?.from === "cell") return;
    const k = e.key;
    if (k === "ArrowUp") { e.preventDefault(); move(0, -1); }
    else if ((k === "ArrowDown" || k === "Enter") && !(e.ctrlKey && isNote(sel))) { e.preventDefault(); move(0, 1); }
    else if (k === "ArrowLeft") { e.preventDefault(); move(-1, 0); }
    else if (k === "ArrowRight" || k === "Tab") { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0); }
    else if (k === "Enter" && e.ctrlKey && isNote(sel)) { e.preventDefault(); goNote(selCell.v); }
    else if (k === "F2") { e.preventDefault(); setEdit({ text: String(rawText(selCell)), from: "cell" }); }
    else if (k === "Delete" || k === "Backspace") { e.preventDefault(); commit(""); }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setEdit({ text: k, from: "cell" }); }
  };

  const onEditKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(edit.text); move(0, 1); gridRef.current?.focus(); }
    else if (e.key === "Tab") { e.preventDefault(); commit(edit.text); move(1, 0); gridRef.current?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); setEdit(null); gridRef.current?.focus(); }
  };

  /* ---------- downloads ---------- */
  const download = async (kind) => {
    if (!wb) return;
    setBusy(kind);
    try {
      if (kind === "xlsx") await downloadWorkbook(wb, calc);
      else await downloadPdf(toData(wb, calc, data));
    } catch (e) {
      notify(e?.message?.includes("Failed to fetch dynamically imported module") || e?.message?.includes("Cannot find")
        ? "Install the export packages first: npm i exceljs jspdf jspdf-autotable"
        : e.message || "Couldn't create the file.", "error");
    } finally {
      setBusy("");
    }
  };

  /* ---------- render helpers ---------- */
  const display = (a) => {
    const cell = cellAt(a);
    if (!cell) return "";
    const v = shown(a);
    if (typeof v === "string" && v.startsWith("#")) return v;
    if (cell.num) return acct(v);
    return v ?? "";
  };
  const cls = (a, r) => {
    const cell = cellAt(a);
    const s = cell?.s || {};
    const v = shown(a);
    return [
      "xg-c",
      cell?.num ? "is-num" : "",
      cell?.f ? "has-f" : "",
      s.bold ? "b" : "",
      s.italic ? "i" : "",
      s.center ? "ctr" : "",
      s.top ? `t-${s.top}` : "",
      s.bottom ? `bt-${s.bottom}` : "",
      s.head ? "hd" : "",
      sh?.rowKind[r] === "colhead" ? "colhead" : "",
      typeof v === "string" && v.startsWith("#") ? "err" : "",
      a === sel ? "sel" : "",
      selRefs.has(a) ? "ref" : "",
    ].filter(Boolean).join(" ");
  };

  const rows = sh ? Array.from({ length: sh.rows + 3 }, (_, i) => i + 1) : [];
  const cols = sh ? Array.from({ length: sh.cols }, (_, i) => i + 1) : [];
  const fCount = sh ? Object.values(sh.cells).filter((c) => c.f).length : 0;

  return (
    <div className="fs">
      {/* ---------- controls ---------- */}
      <section className="card fs-bar">
        <div className="fs-fields">
          <label className="fs-field">
            <span>Year</span>
            <select className="input" value={year} onChange={(e) => { const y = Number(e.target.value); setYear(y); if (compare && compare >= y) setCompare(y - 1); }}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="fs-field">
            <span>Compare with</span>
            <select className="input" value={compare || ""} onChange={(e) => setCompare(e.target.value ? Number(e.target.value) : 0)}>
              <option value="">No comparison</option>
              {YEARS.filter((y) => y < year).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {data?.branches?.length > 1 && (
            <label className="fs-field">
              <span>Branch</span>
              <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="current">This branch</option>
                <option value="all">All branches (consolidated)</option>
                {data.branches.map((b) => <option key={b.id} value={String(b.id)}>{b.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="fs-actions">
          <button className="btn" onClick={load} disabled={loading}>{loading ? "Building…" : dirty ? "Reset to ledger" : "Refresh"}</button>
          <button className="btn" onClick={() => download("xlsx")} disabled={!wb || loading || !!busy}>{busy === "xlsx" ? "Preparing…" : "Download Excel"}</button>
          <button className="btn btn-primary" onClick={() => download("pdf")} disabled={!wb || loading || !!busy}>{busy === "pdf" ? "Preparing…" : "Download PDF"}</button>
        </div>
      </section>

      {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

      {problems.length > 0 && (
        <div className="fs-warn" role="status">
          <strong>These don't tie out yet</strong>
          <ul>{problems.map((p, i) => <li key={i}>{p.year} · {p.label}: off by {acct(p.diff)}</li>)}</ul>
          <span>Usually an unbalanced journal entry or an account in the wrong code range. Check the Trial Balance for {problems[0].year}.</span>
        </div>
      )}

      <section className="card xg">
        {loading && <div className="fs-skel" aria-label="Loading"><span /><span /><span /><span /><span /><span /></div>}

        {!loading && empty && (
          <div className="fs-empty">
            <h3>No entries for {year}{compare ? ` or ${compare}` : ""}</h3>
            <p>Post sales, purchases, expenses or journal entries for this year, or pick another year above.</p>
          </div>
        )}

        {!loading && sh && !empty && (
          <>
            {/* name box + fx bar */}
            <div className="xg-bar">
              <span className="xg-name" aria-label="Cell">{sel}</span>
              <span className="xg-fx">fx</span>
              <input
                className="xg-formula"
                aria-label="Formula bar"
                value={edit ? edit.text : String(rawText(selCell))}
                onFocus={() => !edit && setEdit({ text: String(rawText(selCell)), from: "bar" })}
                onChange={(e) => setEdit({ text: e.target.value, from: "bar" })}
                onKeyDown={onEditKey}
                onBlur={() => edit?.from === "bar" && commit(edit.text)}
              />
              {dirty && <span className="xg-dirty">edited</span>}
            </div>

            {/* grid */}
            <div className="xg-scroll" ref={gridRef} tabIndex={0} onKeyDown={onGridKey} role="grid" aria-label={`${sheetName} sheet`}>
              <table className="xg-grid">
                <colgroup>
                  <col className="xg-rn" />
                  {cols.map((c) => <col key={c} className={c === 1 ? "xg-wA" : c === 2 ? "xg-wB" : "xg-wN"} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className="xg-corner" />
                    {cols.map((c) => <th key={c} className={parseAddr(sel)?.c === c ? "on" : ""}>{colLetter(c)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r}>
                      <th className={parseAddr(sel)?.r === r ? "on" : ""}>{r}</th>
                      {cols.map((c) => {
                        const a = addr(c, r);
                        const s = cellAt(a)?.s || {};
                        const editing = a === sel && edit?.from === "cell";
                        return (
                          <td key={c} data-a={a} className={cls(a, r)}
                            style={s.indent && c === 1 ? { paddingLeft: `${6 + s.indent * 16}px` } : undefined}
                            onMouseDown={() => { if (edit) commit(edit.text); setSel(a); }}
                            onDoubleClick={() => setEdit({ text: String(rawText(cellAt(a))), from: "cell" })}
                            title={cellAt(a)?.f ? `=${cellAt(a).f}` : undefined}>
                            {editing ? (
                              <input autoFocus className="xg-in" value={edit.text}
                                onChange={(e) => setEdit({ text: e.target.value, from: "cell" })}
                                onKeyDown={onEditKey} onBlur={() => commit(edit.text)} />
                            ) : isNote(a) ? (
                              <button type="button" className="xg-note" title={`Go to Note ${cellAt(a).v}`}
                                onMouseDown={(e) => e.stopPropagation()} onClick={() => goNote(cellAt(a).v)}>
                                {cellAt(a).v}
                              </button>
                            ) : display(a)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* sheet tabs */}
            <div className="xg-tabs" role="tablist" aria-label="Sheets">
              {SHEETS.map(([k, n, title]) => (
                <button key={k} role="tab" aria-selected={sheet === k} className={sheet === k ? "on" : ""} title={title}
                  onClick={() => { if (edit) commit(edit.text); setSheet(k); setSel("A1"); }}>
                  {n}
                </button>
              ))}
              <span className="xg-status">{fCount} formula{fCount === 1 ? "" : "s"} · click a cell to see its formula · click a note number to open it · type to edit</span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}