/* Loading placeholder for list tables (same as the Sales list) */
export default function TableSkeleton({ columns, bodyHeight, rows = 10, selectable = false, pillKeys = ["status", "audit_status"], label = "Loading" }) {
    // bar widths per column so it looks like real data
    const widths = ["70%", "85%", "60%", "55%", "65%", "70%", "45%", "60%"];

    return (
        <section className="card table-card" aria-busy="true" aria-label={label}>
            <div className="table-scroll scroll-body" style={{ maxHeight: bodyHeight }}>
                <table className="table">
                    <thead>
                        <tr>
                            {selectable && <th className="col-check"><span className="sk sk-check" /></th>}
                            {columns.map((c) => (
                                <th key={c.key} className={c.align ? `ta-${c.align}` : ""}>{c.label}</th>
                            ))}
                            <th className="ta-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: rows }).map((_, r) => (
                            <tr key={r}>
                                {selectable && <td className="col-check"><span className="sk sk-check" /></td>}
                                {columns.map((c, i) => (
                                    <td key={c.key} className={c.align ? `ta-${c.align}` : ""}>
                                        <span
                                            className={`sk sk-cell ${pillKeys.includes(c.key) ? "sk-pill" : ""}`}
                                            style={{ width: widths[i % widths.length] }}
                                        />
                                    </td>
                                ))}
                                <td className="ta-center"><span className="sk sk-dots" /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="table-foot">
                <span className="sk sk-foot" />
                <span className="sk sk-foot sk-foot-sm" />
            </div>
        </section>
    );
}