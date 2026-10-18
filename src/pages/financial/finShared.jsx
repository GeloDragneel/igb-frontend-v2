import SearchSelect from "../../components/SearchSelect";

// 1,234.56 · (1,234.56) · "-" for zero
export const amt = (v) => {
    const n = Number(v) || 0;
    if (Math.abs(n) < 0.005) return "-";
    const s = Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? `(${s})` : s;
};

export const yearOptions = (count = 10) => {
    const now = new Date().getFullYear();
    return Array.from({ length: count }, (_, i) => ({ value: String(now - i), label: String(now - i) }));
};

export const branchOptions = (data) => [
    { value: "current", label: "This branch" },
    ...(data?.branches?.length ? [{ value: "all", label: "All Branches" }] : []),
    ...(data?.branches || []).map((b) => ({ value: String(b.id), label: b.label })),
];

export function BranchField({ data, value, onChange }) {
    const opts = branchOptions(data);
    if (opts.length < 2) return null;
    return (
        <div className="field jr-branch">
            <span className="field-label">Branch</span>
            <SearchSelect value={value} onChange={onChange} options={opts} aria-label="Branch" />
        </div>
    );
}

export function YearField({ label = "Year", value, onChange }) {
    return (
        <div className="field bs-year">
            <span className="field-label">{label}</span>
            <SearchSelect value={value} onChange={onChange} options={yearOptions()} aria-label={label} />
        </div>
    );
}

export function Actions({ loading, ready, onSearch, onExport }) {
    return (
        <div className="jr-btns">
            <button className="btn btn-primary" onClick={onSearch} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
            <button className="btn" onClick={onExport} disabled={loading || !ready}>Export CSV</button>
            <button className="btn" onClick={() => window.print()} disabled={loading || !ready}>Print</button>
        </div>
    );
}

export function SkeletonRows({ rows = 10, cols = 2 }) {
    return Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
            {Array.from({ length: cols }).map((__, c) => (
                <td key={c} className={c ? "ta-right" : ""}><span className="sk sk-cell" style={{ width: c ? "50%" : "70%" }} /></td>
            ))}
        </tr>
    ));
}