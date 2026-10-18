// Download a table as CSV (opens in Excel).
// columns: [{ label, value: (row) => any, money?: true }]  ·  totals: optional last row (same shape as a row)

const cellValue = (c, r) => {
    const v = c.value(r);
    return v === null || v === undefined ? "" : v;
};

export function exportCsv(filename, columns, rows, totals) {
    const esc = (v) => {
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => esc(c.label)).join(",")];
    [...rows, ...(totals ? [totals] : [])].forEach((r) => {
        lines.push(columns.map((c) => {
            const v = cellValue(c, r);
            return esc(c.money && v !== "" ? Number(v).toFixed(2) : v);
        }).join(","));
    });
    // BOM so Excel opens it as UTF-8 (ñ, é …)
    download(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}