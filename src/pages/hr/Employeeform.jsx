// HR → Employees: employee profile by section (Personal · Contact · Work · Government & pay)
//   ProfileTab  : one section inside the employee popup — view, Edit, Save
//   EmployeeForm: "New employee" — every section in one form
import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import { api, fmtDate, n2 } from "./HRShared";

/* ---------------- sections ---------------- */
// type: text | date | number | gender | lookup (lk key) | place (cities / barangays, parent field) | check
export const PROFILE_SECTIONS = {
    personal: {
        title: "Personal",
        fields: [
            ["last_name", "Last name", "text", { required: true }], ["first_name", "First name", "text", { required: true }],
            ["middle_name", "Middle name", "text"], ["suffix", "Suffix", "text", { placeholder: "Jr., III" }],
            ["birthdate", "Birthdate", "date"], ["gender", "Gender", "gender"],
            ["civ_stat_id", "Civil status", "lookup", { list: "civil_statuses" }], ["citizenship_id", "Citizenship", "lookup", { list: "citizenships" }],
            ["religion_id", "Religion", "lookup", { list: "religions" }], ["birth_place_id", "Birth place", "place", { kind: "cities", parent: "all" }],
        ],
    },
    contact: {
        title: "Contact & address",
        fields: [
            ["phone_num", "Mobile", "text"], ["tell_num", "Telephone", "text"], ["email_address", "Email", "text", { wide: true }],
            ["street", "Street / house no.", "text", { wide: true }],
            ["province_id", "Province", "lookup", { list: "provinces", clears: ["city_id", "brgy_id"] }],
            ["city_id", "City / municipality", "place", { kind: "cities", parent: "province_id", clears: ["brgy_id"] }],
            ["brgy_id", "Barangay", "place", { kind: "barangays", parent: "city_id" }],
        ],
    },
    work: {
        title: "Work",
        fields: [
            ["company_caid", "Company", "lookup", { list: "companies", wide: true }], ["designation_id", "Designation", "lookup", { list: "designations" }],
            ["employment_stat_id", "Employment status", "lookup", { list: "employment_statuses" }],
            ["date_contact", "Contract start", "date"], ["date_contact_exp", "Contract end", "date"],
            ["biometric_num", "Biometric no.", "text", { hint: "EnNo on the device" }], ["is_active", "Active", "check"],
            ["remarks", "Remarks", "text", { wide: true }],
        ],
    },
    gov: {
        title: "Government & pay",
        fields: [
            ["sss_no", "SSS no.", "text"], ["phic_no", "PhilHealth no.", "text"], ["hdmf_no", "Pag-IBIG no.", "text"], ["tin", "TIN", "text"],
            ["mccb_acc", "Payroll account (MCCB)", "text"], ["allowance", "Allowance / month", "number"],
        ],
    },
};
const ALL_FIELDS = Object.values(PROFILE_SECTIONS).flatMap((s) => s.fields);
const NUMERIC = ALL_FIELDS.filter(([, , t]) => t === "lookup" || t === "place" || t === "number").map(([k]) => k);

/* ---------------- data ---------------- */
let lookupsCache = null;
export function useEmployeeLookups() {
    const [lk, setLk] = useState(lookupsCache);
    useEffect(() => {
        if (lookupsCache) return;
        api.get("/hr/employee-lookups").then((r) => { lookupsCache = r; setLk(r); })
            .catch(() => setLk({ designations: [], employment_statuses: [], civil_statuses: [], religions: [], citizenships: [], provinces: [], companies: [], shifts: [] }));
    }, []);
    return lk;
}

const placesCache = {};
/** cities of a province / barangays of a city ("all" = every city) */
export function usePlaces(kind, parent) {
    const key = `${kind}:${parent || ""}`;
    const [list, setList] = useState(placesCache[key] || []);
    useEffect(() => {
        if (!parent) { setList([]); return; }
        if (placesCache[key]) { setList(placesCache[key]); return; }
        api.get(`/hr/places/${kind}?parent=${parent}`).then((r) => { placesCache[key] = r; setList(r); }).catch(() => setList([]));
    }, [kind, parent, key]);
    return list;
}

export const toForm = (profile) => Object.fromEntries(ALL_FIELDS.map(([k, , t]) => {
    const v = profile?.[k];
    if (t === "check") return [k, v === undefined || v === null ? true : !!v];
    return [k, v === null || v === undefined ? "" : String(v)];
}));
export const toBody = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => {
    if (v === "") return [k, null];
    if (NUMERIC.includes(k)) return [k, Number(v)];
    return [k, v];
}));

/* ---------------- one field: view or edit ---------------- */
function PlaceSelect({ kind, parent, value, onChange, label }) {
    const list = usePlaces(kind, parent);
    return (
        <SearchSelect value={value || ""} onChange={(v) => onChange(v ? String(v) : "")} aria-label={label} searchPlaceholder="Search…"
            options={[{ value: "", label: parent ? "Select…" : "Select the one above first" }, ...list.map((o) => ({ value: String(o.value), label: o.label }))]} />
    );
}

function PlaceLabel({ kind, parent, value }) {
    const list = usePlaces(kind, value ? parent : "");
    return list.find((o) => String(o.value) === String(value))?.label || (value ? `#${value}` : "—");
}

function FieldView({ field, f, lk }) {
    const [k, , t, o = {}] = field;
    const v = f[k];
    if (t === "check") return v ? "Yes" : "No";
    if (v === "" || v === null || v === undefined) return <span className="hr-info-empty">—</span>;
    if (t === "date") return fmtDate(v);
    if (t === "number") return n2(v);
    if (t === "lookup") return (lk?.[o.list] || []).find((x) => String(x.value) === String(v))?.label || `#${v}`;
    if (t === "place") return <PlaceLabel kind={o.kind} parent={o.parent === "all" ? "all" : f[o.parent]} value={v} />;
    return v;
}

function FieldEdit({ field, f, setF, lk }) {
    const [k, label, t, o = {}] = field;
    const set = (v) => setF((p) => ({ ...p, [k]: v, ...Object.fromEntries((o.clears || []).map((c) => [c, ""])) }));
    if (t === "check") return <label className="hr-check"><input type="checkbox" checked={!!f[k]} onChange={(e) => set(e.target.checked)} /> {label}</label>;
    if (t === "gender") {
        return (
            <select className="input" value={f[k]} onChange={(e) => set(e.target.value)} aria-label={label}>
                <option value="">Select…</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
                {f[k] && !["MALE", "FEMALE"].includes(f[k]) && <option value={f[k]}>{f[k]}</option>}
            </select>
        );
    }
    if (t === "lookup") {
        return (
            <SearchSelect value={f[k] || ""} onChange={(v) => set(v ? String(v) : "")} aria-label={label} searchPlaceholder="Search…"
                options={[{ value: "", label: "Select…" }, ...(lk?.[o.list] || []).map((x) => ({ value: String(x.value), label: x.label }))]} />
        );
    }
    if (t === "place") return <PlaceSelect kind={o.kind} parent={o.parent === "all" ? "all" : f[o.parent]} value={f[k]} onChange={set} label={label} />;
    return (
        <input className="input" type={t === "date" ? "date" : t === "number" ? "number" : "text"} min={t === "number" ? 0 : undefined} step={t === "number" ? "0.01" : undefined}
            value={f[k]} onChange={(e) => set(e.target.value)} placeholder={o.placeholder} aria-label={label} />
    );
}

/** the fields of a section, as tiles (view) or inputs (edit) */
export function SectionGrid({ section, f, setF, lk, edit }) {
    return (
        <div className="hr-info">
            {PROFILE_SECTIONS[section].fields.map((field) => {
                const [k, label, t, o = {}] = field;
                return (
                    <div key={k} className={`hr-info-item${o.wide ? " is-wide" : ""}${edit ? " is-edit" : ""}`}>
                        {!(edit && t === "check") && <span className="hr-info-label">{label}{edit && o.required ? " *" : ""}</span>}
                        {edit ? <FieldEdit field={field} f={f} setF={setF} lk={lk} /> : <span className="hr-info-value"><FieldView field={field} f={f} lk={lk} /></span>}
                        {edit && o.hint && <span className="hr-hint">{o.hint}</span>}
                    </div>
                );
            })}
        </div>
    );
}

/* ---------------- popup tab: one section ---------------- */
export function ProfileTab({ section, profile, notify, onSaved }) {
    const lk = useEmployeeLookups();
    const [edit, setEdit] = useState(false);
    const [f, setF] = useState(() => toForm(profile));
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (!edit) setF(toForm(profile)); }, [profile, edit]);
    const missing = edit && section === "personal" && (!f.last_name.trim() || !f.first_name.trim());

    const save = () => {
        setSaving(true);
        api.put(`/hr/employees/${profile.id}`, toBody({ ...toForm(profile), ...f }))
            .then((r) => { notify(r.message); setEdit(false); onSaved(); })
            .catch((e) => notify(e.message || "Couldn't save.", "error"))
            .finally(() => setSaving(false));
    };

    return (
        <section className="hr-pop-sec">
            <header>
                <div><h5>{PROFILE_SECTIONS[section].title}</h5></div>
                {edit ? (
                    <div className="hr-actions">
                        <button type="button" className="btn btn-sm" onClick={() => setEdit(false)} disabled={saving}>Cancel</button>
                        <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={saving || missing}>{saving ? "Saving…" : "Save"}</button>
                    </div>
                ) : <button type="button" className="btn btn-sm" onClick={() => setEdit(true)}>Edit</button>}
            </header>
            {!lk ? <p className="hr-blank">Loading…</p> : <SectionGrid section={section} f={f} setF={setF} lk={lk} edit={edit} />}
        </section>
    );
}

/* ---------------- New employee ---------------- */
const NEW_STEPS = [["personal", "Personal"], ["contact", "Contact"], ["work", "Work"], ["gov", "Government & pay"]];

export default function EmployeeForm({ onClose, onSaved, onFail }) {
    const lk = useEmployeeLookups();
    const [step, setStep] = useState("personal");
    const [f, setF] = useState(() => toForm(null));
    const [saving, setSaving] = useState(false);
    const ok = f.last_name.trim() && f.first_name.trim();
    const i = NEW_STEPS.findIndex(([k]) => k === step);

    const save = () => {
        setSaving(true);
        api.post("/hr/employees", toBody(f)).then(onSaved).catch(onFail).finally(() => setSaving(false));
    };

    return (
        <Modal title="New employee" onClose={onClose} size="lg"
            footer={(
                <>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    {i > 0 && <button className="btn" onClick={() => setStep(NEW_STEPS[i - 1][0])}>Back</button>}
                    {i < NEW_STEPS.length - 1 && <button className="btn" onClick={() => setStep(NEW_STEPS[i + 1][0])}>Next</button>}
                    <button className="btn btn-primary" onClick={save} disabled={saving || !ok}>{saving ? "Saving…" : "Add employee"}</button>
                </>
            )}>
            <div className="hr-ptabs" role="tablist">
                {NEW_STEPS.map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={step === k} className={`hr-ptab${step === k ? " is-active" : ""}`} onClick={() => setStep(k)}>{l}</button>
                ))}
            </div>
            {!lk ? <p className="hr-blank">Loading…</p> : <SectionGrid section={step} f={f} setF={setF} lk={lk} edit />}
            <p className="hr-hint hr-new-hint">Only last and first name are required. Set the salary after adding, in the employee's <b>Salary history</b> tab.</p>
        </Modal>
    );
}