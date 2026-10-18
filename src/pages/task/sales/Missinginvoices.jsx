import { useMemo, useState } from "react";
import { useAppData } from "../../../context/AppDataContext";
import SearchCard from "../../../components/SearchCard";
import DataTable from "../../../components/DataTable";
import Badge from "../../../components/Badge";
import { SALES_TABS } from "../../../components/routesMeta";
import { fmtDate } from "../../../utils/format";

// Finds gaps and duplicates in the invoice number sequence (e.g. INV-0007 missing)
export default function MissingInvoices() {
    const { sales } = useAppData();
    const [query, setQuery] = useState("");
    const [type, setType] = useState("");

    const issues = useMemo(() => {
        const parsed = sales
            .map((s) => {
                const m = String(s.invoiceNo).match(/^(.*?)(\d+)$/);
                return m ? { sale: s, prefix: m[1], num: parseInt(m[2], 10), width: m[2].length } : null;
            })
            .filter(Boolean);

        const out = [];
        const byPrefix = {};
        parsed.forEach((p) => (byPrefix[p.prefix] ??= []).push(p));

        Object.entries(byPrefix).forEach(([prefix, list]) => {
            list.sort((a, b) => a.num - b.num);
            const width = Math.max(...list.map((p) => p.width));
            const fmt = (n) => prefix + String(n).padStart(width, "0");

            for (let i = 0; i < list.length; i++) {
                const cur = list[i];
                const next = list[i + 1];
                if (next && next.num === cur.num) {
                    out.push({ key: `dup-${cur.sale.invoiceNo}-${i}`, invoiceNo: cur.sale.invoiceNo, type: "Duplicate", before: cur.sale, after: next.sale });
                }
                if (next && next.num > cur.num + 1) {
                    for (let n = cur.num + 1; n < next.num; n++) {
                        out.push({ key: `gap-${prefix}${n}`, invoiceNo: fmt(n), type: "Missing", before: cur.sale, after: next.sale });
                    }
                }
            }
        });
        return out;
    }, [sales]);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return issues.filter((r) => (!type || r.type === type) && (!q || r.invoiceNo.toLowerCase().includes(q)));
    }, [issues, query, type]);

    const columns = [
        { key: "invoiceNo", label: "Invoice No", render: (r) => <span className="strong">{r.invoiceNo}</span> },
        { key: "type", label: "Issue", render: (r) => <Badge tone={r.type === "Missing" ? "red" : "orange"}>{r.type}</Badge> },
        { key: "before", label: "Previous Invoice", value: (r) => r.before.invoiceNo },
        { key: "beforeDate", label: "Previous Date", value: (r) => r.before.date, render: (r) => fmtDate(r.before.date) },
        { key: "after", label: "Next Invoice", value: (r) => r.after.invoiceNo },
        { key: "afterDate", label: "Next Date", value: (r) => r.after.date, render: (r) => fmtDate(r.after.date) },
    ];

    const missing = issues.filter((i) => i.type === "Missing").length;
    const dups = issues.length - missing;

    return (
        <>
            <SearchCard
                navTabs={SALES_TABS}
                query={query} setQuery={setQuery} placeholder="Search invoice number..."
                statusOptions={["Missing", "Duplicate"]} status={type} setStatus={setType}
                extra={
                    <span className="chip">
                        {missing} missing · {dups} duplicate
                    </span>
                }
                sticky
            />

            <DataTable
                columns={columns}
                rows={rows}
                rowKey="key"
                exportName="missing-invoices"
                showToolbar={false}
                emptyText="No gaps or duplicates. The invoice sequence is complete."
                onClearFilters={() => { setQuery(""); setType(""); }}
            />
        </>
    );
}