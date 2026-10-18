// HR Settings → SSS / PhilHealth brackets: payroll uses the bracket of the employee's monthly rate
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { Badge, DataTable, Field, Pager, api, n2, useForm, usePaged } from "./HRShared";

const KIND = {
    sss: {
        title: "SSS brackets",
        sub: "Monthly rate → monthly salary credit · employee (EE), employer (ER) and EC shares",
        shares: [["ee", "Employee (EE)"], ["er", "Employer (ER)"], ["ec", "EC (employer)"]],
    },
    phic: {
        title: "PhilHealth brackets",
        sub: "Monthly rate → monthly salary credit · personal share (employee) and employer share",
        shares: [["ps", "Employee (PS)"], ["es", "Employer (ES)"], ["msb", "MSB"]],
    },
};

export default function Brackets({ type, notify }) {
    const k = KIND[type];
    const [rows, setRows] = useState(null);
    const [salary, setSalary] = useState("");
    const [edit, setEdit] = useState(null);

    const load = useCallback(() => {
        api.get(`/hr/brackets/${type}`).then(setRows).catch((e) => { notify(e.message || "Couldn't load the brackets.", "error"); setRows([]); });
    }, [type, notify]);
    useEffect(() => { load(); }, [load]);

    // "which bracket is 25,000?" → show only that one
    const amount = Number(salary) || 0;
    const list = useMemo(() => (rows || []).filter((r) => !amount || (amount >= Number(r.range_from) && amount <= Number(r.range_to))), [rows, amount]);
    const paged = usePaged(list, `${type}|${salary}`, 25);

    return (
        <section className="card hr-section">
            <header className="hr-section-head">
                <div><h5>{k.title}</h5><span className="hr-muted">{k.sub}</span></div>
                <div className="hr-toolbar">
                    <input className="input" type="number" min="0" placeholder="Find by monthly rate…" value={salary} onChange={(e) => setSalary(e.target.value)} aria-label="Monthly rate" />
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({})}>New bracket</button>
                </div>
            </header>
            <DataTable loading={!rows} rows={paged.pageRows} onRow={setEdit} empty={amount ? "No bracket for this amount." : "No bracket yet."} cols={[
                { key: "bracket_code", label: "Bracket", render: (r) => <><b>{r.bracket_code}</b>{!r.is_active && <> <Badge status="inactive" /></>}</> },
                { key: "range", label: "Monthly rate", cls: "n", render: (r) => `${n2(r.range_from)} – ${Number(r.range_to) >= 999999 ? "and up" : n2(r.range_to)}` },
                { key: "mo_sal_credit", label: "Salary credit", cls: "n", money: true },
                ...k.shares.map(([key, label]) => ({ key, label, cls: "n", money: true })),
                { key: "total", label: "Total", cls: "n", render: (r) => <b>{n2(k.shares.filter(([key]) => key !== "msb").reduce((t, [key]) => t + Number(r[key] || 0), 0))}</b> },
            ]} />
            {rows && <Pager {...paged} label="bracket(s)" />}
            {edit && <BracketModal type={type} row={edit.id ? edit : null} next={rows?.length || 0}
                onClose={() => setEdit(null)} onDone={(m) => { notify(m); setEdit(null); load(); }} onFail={(e) => notify(e.message || "Couldn't save.", "error")} />}
        </section>
    );
}

function BracketModal({ type, row, next, onClose, onDone, onFail }) {
    const k = KIND[type];
    const [f, set] = useForm({
        bracket: row?.bracket ?? next + 1, bracket_code: row?.bracket_code || `${type === "sss" ? "SSS" : "PHIC"}-${String(next + 1).padStart(3, "0")}`,
        range_from: row?.range_from ?? "", range_to: row?.range_to ?? "", mo_sal_credit: row?.mo_sal_credit ?? "",
        ...Object.fromEntries(k.shares.map(([key]) => [key, row?.[key] ?? ""])), is_active: row ? !!row.is_active : true,
    });
    const save = () => {
        const body = { ...f, bracket: Number(f.bracket) };
        (row ? api.put(`/hr/brackets/${type}/${row.id}`, body) : api.post(`/hr/brackets/${type}`, body)).then((r) => onDone(r.message)).catch(onFail);
    };
    return (
        <Modal title={row ? `${k.title.replace(" brackets", "")} · ${row.bracket_code}` : `New ${k.title.replace(" brackets", "")} bracket`} onClose={onClose} size="lg"
            footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={f.range_from === "" || f.range_to === "" || f.mo_sal_credit === ""}>Save</button></>}>
            <div className="hr-entry">
                <div className="hr-entry-row is-3">
                    <Field label="Code"><input className="input" value={f.bracket_code} onChange={set("bracket_code")} /></Field>
                    <Field label="Bracket no."><input type="number" min="1" className="input" value={f.bracket} onChange={set("bracket")} /></Field>
                    <Field label="Salary credit"><input type="number" min="0" step="0.01" className="input" value={f.mo_sal_credit} onChange={set("mo_sal_credit")} /></Field>
                </div>
                <fieldset className="hr-entry-times is-3">
                    <legend>Monthly rate</legend>
                    <Field label="From"><input type="number" min="0" step="0.01" className="input" value={f.range_from} onChange={set("range_from")} /></Field>
                    <Field label="To" hint="999999.99 = and up"><input type="number" min="0" step="0.01" className="input" value={f.range_to} onChange={set("range_to")} /></Field>
                    <label className="hr-check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active</label>
                </fieldset>
                <fieldset className="hr-entry-times is-3">
                    <legend>Contribution per month</legend>
                    {k.shares.map(([key, label]) => (
                        <Field key={key} label={label}><input type="number" min="0" step="0.01" className="input" value={f[key]} onChange={set(key)} /></Field>
                    ))}
                </fieldset>
            </div>
        </Modal>
    );
}