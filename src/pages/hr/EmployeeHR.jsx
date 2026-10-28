// HR → Employees: every active employee · click one → popup with shift, salary history, bank accounts, leave credits
// <EmployeeHR branchMode />  FEMS → Admin → Employee: only the branch picked at the top, no leave credits
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../context/AuthContext";
import { PROFILE_SECTIONS, SectionGrid, toBody, toForm, useEmployeeLookups } from "./Employeeform";
import { Badge, DataTable, Field, PageHead, Pager, api, fmtDate, n2, todayPH, useForm, usePaged } from "./HRShared";

export default function EmployeeHR({ branchMode = false }) {
  const notify = useToast();
  const { user } = useAuth();
  const branchCaid = branchMode ? Number(user?.caid) || 0 : 0;   // changes when the branch at the top is switched
  const branchName = [user?.branch_code, user?.business_name].filter(Boolean).join(" – ");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [adding, setAdding] = useState(false);
  const [company, setCompany] = useState("");
  const [open, setOpen] = useState(null); // employee row
  const [year] = useState(Number(todayPH().slice(0, 4)));

  const load = useCallback(() => {
    setError("");
    setRows(null);
    if (branchMode && !branchCaid) { setError("Pick a branch at the top first."); setRows([]); return; }
    api.get(`/hr/employees?status=${status}${branchMode ? "&branch=current" : ""}`).then(setRows).catch((e) => { setError(e.message || "Couldn't load the employees."); setRows([]); });
  }, [status, branchMode, branchCaid]);
  useEffect(() => { load(); }, [load]);
  // another branch picked at the top → close what is open, the list reloads by itself
  useEffect(() => { setOpen(null); setAdding(false); setCompany(""); }, [branchCaid]);

  const companies = useMemo(() => [...new Set((rows || []).map((e) => e.company).filter(Boolean))].sort(), [rows]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || [])
      .filter((e) => branchMode || !company || (company === "none" ? !e.company : e.company === company))
      .filter((e) => !term || [e.name, e.shift, e.company, e.user_type].some((v) => String(v || "").toLowerCase().includes(term)));
  }, [rows, q, company, branchMode]);

  const paged = usePaged(list, `${q}|${company}|${status}`);

  const generate = () => api.post("/hr/leave-credits/generate", { year })
    .then((r) => notify(r.message)).catch((e) => notify(e.message || "Couldn't generate.", "error"));

  return (
    <div className="hr">
      <PageHead title="Employees"
        sub={branchMode
          ? <>Employees of <b>{branchName || "the branch at the top"}</b> · click one to see and edit his shift, salary history and bank accounts</>
          : "Click an employee to see and edit his shift, salary history, bank accounts and leave credits"}>
        <div className="hr-actions">
          <Field label="Status">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
            </select>
          </Field>
          {!branchMode && (
            <Field label="Company">
              <select className="input" value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="">All companies</option>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="none">No company</option>
              </select>
            </Field>
          )}
          <Field label="Search"><input className="input" type="search" placeholder={branchMode ? "Name, shift or user type…" : "Name, company, shift or user type…"} value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          {!branchMode && <button type="button" className="btn" onClick={generate} title="Every active employee gets each leave type's default days">Generate {year} leave credits</button>}
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} disabled={branchMode && !branchCaid}>New employee</button>
        </div>
      </PageHead>
      {error && <div className="alert-error" role="alert">{error}</div>}

      <section className="card hr-section">
        <DataTable loading={!rows} rows={paged.pageRows} onRow={setOpen} empty="No employee found." cols={[
          { key: "name", label: "Employee", render: (e) => <><b>{e.name}</b> {!e.is_active && <Badge status="inactive" />}</> },
          ...(branchMode ? [] : [{ key: "company", label: "Company", cls: "wrap", render: (e) => e.company || "—" }]),
          { key: "shift", label: "Shift", render: (e) => <>{e.shift || "—"} {e.shift_is_default && <Badge status="default" />}</> },
          { key: "user_type", label: "User type", render: (e) => e.user_type || "—" },
          { key: "birthdate", label: "Birthday", render: (e) => (e.birthdate ? fmtDate(e.birthdate) : "—") },
          { key: "act", label: "", cls: "n", render: () => <span className="hr-muted">View ›</span> },
        ]} />
        {rows && <Pager {...paged} label="employee(s)" />}
      </section>

      {open && <EmployeePopup key={`${branchCaid}:${open.id}`} emp={open} notify={notify} branchMode={branchMode} branch={{ caid: branchCaid, name: branchName }} onClose={() => setOpen(null)} onChanged={load} />}
      {adding && (
        <EmployeePopup key={`${branchCaid}:new`} emp={{}} notify={notify} branchMode={branchMode} branch={{ caid: branchCaid, name: branchName }} onClose={() => setAdding(false)} onChanged={load}
          onAdded={(r) => { notify(r.message); setAdding(false); load(); setOpen({ id: r.employee.id, name: r.employee.name, is_active: true, startTab: "salary" }); }} />
      )}
    </div>
  );
}

/* ---------------- the popup (tabs) ---------------- */
const PROFILE_TABS = ["personal", "contact", "work", "gov"];
const NAV = [
  ["Profile", [["personal", "Personal"], ["contact", "Contact"], ["work", "Work"], ["gov", "Gov't & pay"]]],
  ["Payroll", [["shift", "Shift"], ["salary", "Salary"], ["bank", "Banks"], ["leave", "Leave"]]],
];
// branch page: no Leave tab
const NAV_BRANCH = NAV.map(([g, items]) => [g, items.filter(([k]) => k !== "leave")]);
const SUBTITLE = {
  personal: "Name, birth and civil details", contact: "How to reach the employee and where he lives", work: "Company, position and contract",
  gov: "SSS, PhilHealth, Pag-IBIG, TIN and payroll account",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const t12 = (t) => {
  if (!t) return "—";
  const [h, m] = String(t).split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const initials = (name = "") => name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const num = (v) => Number(v) || 0;

function Tile({ label, value, sub, big = false }) {
  return (
    <div className={`hr-tile${big ? " is-big" : ""}`}>
      <small>{label}</small>
      <b>{value}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

function Blank({ children }) {
  return <p className="hr-blank">{children}</p>;
}

/** one popup for BOTH: new employee (emp = {}) and an existing employee */
function EmployeePopup({ emp, notify, onClose, onChanged, onAdded, branchMode = false, branch = null }) {
  const isNew = !emp.id;
  const [tab, setTab] = useState(branchMode && emp.startTab === "leave" ? "personal" : emp.startTab || "personal");
  const nav = branchMode ? NAV_BRANCH : NAV;
  const scope = branchMode ? { branch: "current" } : {};
  const [year, setYear] = useState(Number(todayPH().slice(0, 4)));
  const [data, setData] = useState(null);
  const [lk, setLk] = useState({ shifts: [], leaveTypes: [] });
  const [edit, setEdit] = useState(null); // { type: shift | salary | bank | credit, row? }
  const elk0 = useEmployeeLookups();
  // branch page: the Company is always the branch at the top (the backend keeps it too)
  const elk = useMemo(() => {
    if (!elk0 || !branchMode || !branch?.caid) return elk0;
    const own = (elk0.companies || []).filter((c) => Number(c.value) === branch.caid);
    const list = own.length ? own : [{ value: branch.caid, label: branch.name || `Branch ${branch.caid}` }];
    return { ...elk0, companies: list, my_companies: list, my_company: branch.caid };
  }, [elk0, branchMode, branch?.caid, branch?.name]);

  // photo: picked here, sent to S3 (Employee_Profile) only when Save is clicked
  const [photo, setPhoto] = useState(null); // saved photo url
  const [pending, setPending] = useState(undefined); // undefined = no change · dataURL = new photo · null = remove
  const shown = pending !== undefined ? pending : photo;
  const photoChanged = pending !== undefined;
  const pickPhoto = (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { notify("Choose a JPG, PNG or WEBP image.", "error"); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // whole picture (no crop), longest side 800 px, JPEG
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      setPending(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); notify("This image can't be read.", "error"); };
    img.src = url;
  };

  const [pf, setPf] = useState(() => (isNew ? toForm(null) : null)); // profile form (all 4 profile tabs)
  // branch page, new employee: company = the branch at the top
  useEffect(() => { if (isNew && branchMode && branch?.caid) setPf((p) => (p ? { ...p, company_caid: String(branch.caid) } : p)); }, [isNew, branchMode, branch?.caid]);
  // new employee: shift, salary, banks and leave are kept here and saved together with "Add employee"
  const [draft, setDraft] = useState({ shift_id: "", salary: null, banks: [], credits: [] });
  const setDraftKey = (k, v) => setDraft((p) => ({ ...p, [k]: typeof v === "function" ? v(p[k]) : v }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/hr/lookups").then((r) => setLk({ shifts: r.shifts.filter((s) => s.is_active), leaveTypes: r.leave_types.filter((t) => t.is_active) })).catch(() => { });
  }, []);
  const load = useCallback(() => {
    if (isNew) return;
    api.get(`/hr/employees/${emp.id}?year=${year}`).then(setData).catch((e) => { notify(e.message || "Couldn't load the employee.", "error"); setData(false); });
  }, [isNew, emp.id, year, notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (data?.profile) setPf(toForm(data.profile)); if (data) setPhoto(data.photo_url || null); }, [data]);
  const saved = isNew ? null : data?.profile ? toForm(data.profile) : null;
  const changed = (section) => pf && saved && PROFILE_SECTIONS[section].fields.some(([k]) => String(pf[k]) !== String(saved[k]));
  const dirty = PROFILE_TABS.some(changed);
  const nameOk = pf && pf.last_name.trim() && pf.first_name.trim();
  const ready = isNew || !!data;
  const typedName = pf && (pf.last_name.trim() || pf.first_name.trim()) ? `${pf.last_name.trim()}${pf.first_name.trim() ? `, ${pf.first_name.trim()}` : ""}`.toUpperCase() : "";
  const name = isNew ? typedName || "New employee" : data?.employee?.full_name || emp.name;

  const sendPhoto = (id) => api.post(`/hr/employees/${id}/photo`, { photo: pending });

  /** existing employee: save the typed changes and / or the photo */
  const saveChanges = async () => {
    setSaving(true);
    try {
      const msgs = [];
      if (dirty) msgs.push((await api.put(`/hr/employees/${emp.id}`, { ...toBody(pf), ...scope })).message);
      if (photoChanged) { const r = await sendPhoto(emp.id); msgs.push(r.message); setPhoto(r.photo_url || null); setPending(undefined); }
      notify(msgs.filter(Boolean).join(" ") || "Saved.");
      load();
      onChanged();
    } catch (e) {
      notify(e.message || "Couldn't save.", "error");
    } finally {
      setSaving(false);
    }
  };
  const discard = () => { setPf(saved); setPending(undefined); };

  /** new employee: add, then the photo */
  const addEmployee = async () => {
    setSaving(true);
    try {
      const today = todayPH();
      const r = await api.post("/hr/employees", {
        ...toBody(pf),
        shift: draft.shift_id ? { shift_id: Number(draft.shift_id), effective_from: today, reason: "New employee" } : null,
        salary: draft.salary,
        banks: draft.banks.map(({ key, ...b }) => b),
        ...(branchMode ? scope : { leave_credits: draft.credits.map(({ key, ...c }) => c) }),
        photo: pending || null,
      });
      onAdded(r);
    } catch (e) {
      notify(e.message || "Couldn't save.", "error");
      setSaving(false);
    }
  };

  const done = (msg) => { notify(msg); setEdit(null); load(); onChanged(); };
  const fail = (e) => notify(e.message || "Couldn't save.", "error");
  const forms = { done, fail, back: () => setEdit(null), empId: emp.id };
  const pick = (k) => { setTab(k); setEdit(null); };

  const banks = data ? data.banks.filter((b) => b.is_active) : [];
  const payBank = banks.find((b) => b.is_default) || banks[0];
  const leaveLeft = data ? data.leave_credits.reduce((s, c) => s + num(c.remaining_days), 0) : 0;
  const count = isNew
    ? { shift: draft.shift_id ? 1 : 0, salary: draft.salary ? 1 : 0, bank: draft.banks.length, leave: draft.credits.length }
    : { salary: data?.salaries?.length, bank: banks.length, leave: data?.leave_credits?.length };
  const includes = [draft.shift_id && "shift", draft.salary && "salary", draft.banks.length && `${draft.banks.length} bank account(s)`, !branchMode && draft.credits.length && `${draft.credits.length} leave credit(s)`].filter(Boolean);
  const optional = branchMode ? "Shift, salary and banks are optional." : "Shift, salary, banks and leave are optional.";

  return (
    <Modal title={isNew ? "New employee" : "Employee information"} onClose={onClose} size="xlg"
      footer={isNew ? (
        <>
          <span className="hr-muted hr-foot-note">{!nameOk ? "Last name and first name are required." : includes.length ? `Saves the profile${pending ? ", photo" : ""}, ${includes.join(", ")}.` : `Saves the profile${pending ? " and photo" : ""}. ${optional}`}</span>
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={addEmployee} disabled={saving || !nameOk}>{saving ? "Saving…" : "Add employee"}</button>
        </>
      ) : <button className="btn btn-primary" onClick={onClose}>Close</button>}>
      <div className="hr-emp">
        {/* left: photo + name */}
        <aside className="hr-emp-side">
          <div className="hr-emp-who">
            <label className={`hr-emp-photo${photoChanged ? " is-pending" : ""}`} title="Choose a photo">
              {shown ? <img src={shown} alt="" /> : <span>{initials(name === "New employee" ? "" : name) || "+"}</span>}
              <i>{shown ? "Change photo" : "Choose photo"}</i>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hr-file-input" disabled={saving}
                onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <b>{name}</b>
            {photoChanged && !isNew && <span className="hr-photo-note">{pending ? "New photo · not saved yet" : "Photo will be removed"}</span>}
            <div className="hr-photo-act">
              {photoChanged && <button type="button" className="hr-linkbtn" onClick={() => setPending(undefined)} disabled={saving}>Undo</button>}
              {shown && <button type="button" className="hr-linkbtn" onClick={() => setPending(photo ? null : undefined)} disabled={saving}>Remove photo</button>}
            </div>
          </div>
        </aside>

        {/* right: tabs on top, then the tab */}
        <div className="hr-emp-main">
          {/* tabs across the top */}
          <nav className="hr-emp-tabs" role="tablist" aria-label="Employee">
            {nav.map(([group, items]) => (
              <div key={group} className="hr-emp-tabgroup" role="group" aria-label={group}>
                <div>
                  {items.map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-active" : ""} onClick={() => pick(k)}>
                      <span>{l}</span>
                      {PROFILE_TABS.includes(k) && changed(k) && <i className="hr-emp-dot" title="Not saved" />}
                      {count[k] ? <em>{count[k]}</em> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          {!isNew && data === null && <Blank>Loading…</Blank>}

          {/* PROFILE: Personal · Contact · Work · Government & pay (type and save) */}
          {ready && pf && PROFILE_TABS.includes(tab) && (
            <section className="hr-pop-sec">
              <header><div><h5>{PROFILE_SECTIONS[tab].title}</h5><span className="hr-muted">{SUBTITLE[tab]}</span></div></header>
              {elk ? <SectionGrid section={tab} f={pf} setF={setPf} lk={elk} edit /> : <Blank>Loading…</Blank>}
            </section>
          )}
          {!isNew && pf && (dirty || photoChanged) && (
            <div className="hr-savebar">
              <span>{nameOk ? `Not saved yet: ${[dirty && "profile", photoChanged && "photo"].filter(Boolean).join(" and ")}.` : "Last name and first name are required."}</span>
              <button type="button" className="btn btn-sm" onClick={discard} disabled={saving}>Discard</button>
              <button type="button" className="btn btn-sm btn-primary" onClick={saveChanges} disabled={saving || !nameOk}>{saving ? "Saving…" : "Save changes"}</button>
            </div>
          )}

          {/* NEW EMPLOYEE: shift · salary · banks · leave (saved with "Add employee") */}
          {isNew && tab === "shift" && <DraftShift shifts={lk.shifts} value={draft.shift_id} onChange={(v) => setDraftKey("shift_id", v)} />}
          {isNew && tab === "salary" && <SalaryForm inline initial={draft.salary} onDraft={(v) => setDraftKey("salary", v)} />}
          {isNew && tab === "bank" && (edit?.type === "bank"
            ? <BankForm row={edit.row} back={() => setEdit(null)}
              onSubmit={(b) => { setDraftKey("banks", (list) => upsertDraft(b.is_default ? list.map((x) => ({ ...x, is_default: false })) : list, b, edit.row)); setEdit(null); }} />
            : <DraftBanks list={draft.banks} onAdd={() => setEdit({ type: "bank" })} onEdit={(row) => setEdit({ type: "bank", row })}
              onRemove={(row) => setDraftKey("banks", (list) => list.filter((x) => x.key !== row.key))} />)}
          {!branchMode && isNew && tab === "leave" && (edit?.type === "credit"
            ? <CreditForm year={year} row={edit.row} leaveTypes={lk.leaveTypes} back={() => setEdit(null)}
              onSubmit={(c) => { setDraftKey("credits", (list) => upsertDraft(list.filter((x) => x.key === edit.row?.key || String(x.leave_type_id) !== String(c.leave_type_id)), c, edit.row)); setEdit(null); }} />
            : <DraftCredits list={draft.credits} year={year} leaveTypes={lk.leaveTypes} onAdd={() => setEdit({ type: "credit" })} onEdit={(row) => setEdit({ type: "credit", row })}
              onDefaults={() => setDraftKey("credits", lk.leaveTypes.filter((t) => num(t.default_days) > 0).map((t) => ({ key: `lt${t.id}`, year, leave_type_id: t.id, allowed_days: num(t.default_days), carried_over: 0 })))}
              onRemove={(row) => setDraftKey("credits", (list) => list.filter((x) => x.key !== row.key))} />)}

          {/* SHIFT */}
          {data && tab === "shift" && (edit?.type === "shift"
            ? <ShiftForm {...forms} current={data.employee.shift_id} shifts={lk.shifts} />
            : (
              <section className="hr-pop-sec">
                <header>
                  <div>
                    <h5>{data.shift?.name || "No shift"} {data.shift_is_default && <Badge status="default" />}</h5>
                    <span className="hr-muted">{data.shift_is_default ? "No own shift, so the default shift is used" : "Own shift of this employee"}</span>
                  </div>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setEdit({ type: "shift" })}>Change shift</button>
                </header>

                {!data.shift ? <Blank>No shift set and there is no default shift. Set one in HR Settings.</Blank> : (
                  <>
                    <div className="hr-shift">
                      <div className="hr-shift-step"><small>Time in</small><b>{t12(data.shift.time_in)}</b></div>
                      <div className="hr-shift-line" />
                      <div className="hr-shift-step is-break">
                        <small>Break</small>
                        <b>{data.shift.break_in ? `${t12(data.shift.break_in)} – ${t12(data.shift.break_out)}` : "No break"}</b>
                      </div>
                      <div className="hr-shift-line" />
                      <div className="hr-shift-step"><small>Time out</small><b>{t12(data.shift.time_out)}{data.shift.is_overnight ? " (+1 day)" : ""}</b></div>
                    </div>
                    <div className="hr-tiles is-4">
                      <Tile label="Paid hours" value={`${num(data.shift.paid_hours)} h / day`} />
                      <Tile label="Grace period" value={`${num(data.shift.grace_minutes)} min`} sub="late allowance" />
                      <Tile label="Overnight" value={data.shift.is_overnight ? "Yes" : "No"} />
                      <div className="hr-tile">
                        <small>Work days</small>
                        <div className="hr-daychips">
                          {DAYS.map((d, i) => (
                            <span key={d} className={String(data.shift.work_days || "").split(",").includes(String(i + 1)) ? "is-on" : ""}>{d}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <h6>Shift history</h6>
                {data.shift_history.length === 0 ? <Blank>No shift change yet.</Blank> : (
                  <DataTable rows={data.shift_history} cols={[
                    { key: "effective_from", label: "From", render: (r) => fmtDate(r.effective_from) },
                    { key: "shift", label: "Shift", render: (r) => r.shift?.name || "Default shift" },
                    { key: "reason", label: "Reason", cls: "wrap" },
                  ]} />
                )}
              </section>
            ))}

          {/* SALARY */}
          {data && tab === "salary" && (edit?.type === "salary"
            ? <SalaryForm {...forms} />
            : (() => {
              const cur = data.salaries.find((s) => s.is_default);
              return (
                <section className="hr-pop-sec">
                  <header>
                    <div><h5>Salary history</h5><span className="hr-muted">Every rate is kept · the default rate is what payroll uses</span></div>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setEdit({ type: "salary" })}>New rate</button>
                  </header>
                  {cur ? (
                    <div className="hr-tiles">
                      <Tile big label="Current monthly rate" value={n2(cur.monthly_rate)} sub={`since ${fmtDate(cur.effective_from)}`} />
                      <Tile label="Daily rate" value={n2(cur.daily_rate)} />
                      <Tile label="Hourly rate (8 h)" value={n2(num(cur.daily_rate) / 8)} />
                      <Tile label="Allowance / month" value={n2(cur.allowance)} />
                    </div>
                  ) : <Blank>No default salary yet. Add a rate and tick "Default".</Blank>}
                  <h6>History</h6>
                  {data.salaries.length === 0 ? <Blank>No salary yet.</Blank> : (
                    <DataTable rows={data.salaries} cols={[
                      { key: "effective_from", label: "From", render: (r) => fmtDate(r.effective_from) },
                      { key: "effective_to", label: "Until", render: (r) => (r.effective_to ? fmtDate(r.effective_to) : "Present") },
                      { key: "salary_type", label: "Paid", render: (r) => (r.salary_type === "monthly" ? "Monthly" : "Daily") },
                      { key: "monthly_rate", label: "Monthly", cls: "n", money: true },
                      { key: "daily_rate", label: "Daily", cls: "n", money: true },
                      { key: "allowance", label: "Allowance", cls: "n", money: true },
                      { key: "description", label: "Description", cls: "wrap", render: (r) => <>{r.description || "—"}<span className="hr-sub">{r.reason}</span></> },
                      {
                        key: "act", label: "", cls: "n", render: (r) => (r.is_default ? <Badge status="default" />
                          : <button type="button" className="btn btn-sm" onClick={() => api.put(`/hr/salaries/${r.id}/default`).then((x) => done(x.message)).catch(fail)}>Set default</button>)
                      },
                    ]} />
                  )}
                </section>
              );
            })())}

          {/* BANK */}
          {data && tab === "bank" && (edit?.type === "bank"
            ? <BankForm {...forms} row={edit.row} />
            : (
              <section className="hr-pop-sec">
                <header>
                  <div><h5>Bank accounts</h5><span className="hr-muted">Payroll goes to the default account</span></div>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setEdit({ type: "bank" })}>Add account</button>
                </header>
                {banks.length === 0 ? <Blank>No bank account yet.</Blank> : (
                  <div className="hr-cards">
                    {banks.map((r) => (
                      <article key={r.id} className={`hr-acct${r.is_default ? " is-default" : ""}`}>
                        <div className="hr-acct-top">
                          <b>{r.bank_name}</b>
                          {r.is_default ? <Badge status="default" /> : <span className="hr-muted">{r.account_type}</span>}
                        </div>
                        <div className="hr-acct-no">{r.account_no}</div>
                        <div className="hr-muted">{r.account_name}{r.branch ? ` · ${r.branch}` : ""}</div>
                        <div className="hr-acct-act">
                          {!r.is_default && <button type="button" className="btn btn-sm" onClick={() => api.put(`/hr/banks/${r.id}`, { ...r, is_default: true }).then((x) => done(x.message)).catch(fail)}>Set default</button>}
                          <button type="button" className="btn btn-sm" onClick={() => setEdit({ type: "bank", row: r })}>Edit</button>
                          <button type="button" className="btn btn-sm" onClick={() => api.del(`/hr/banks/${r.id}`).then((x) => done(x.message)).catch(fail)}>Remove</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}

          {/* LEAVE */}
          {!branchMode && data && tab === "leave" && (edit?.type === "credit"
            ? <CreditForm {...forms} year={year} row={edit.row} leaveTypes={lk.leaveTypes} />
            : (
              <section className="hr-pop-sec">
                <header>
                  <div><h5>Leave credits</h5><span className="hr-muted">Days allowed per leave type</span></div>
                  <div className="hr-toolbar">
                    <label className="hr-yearpick">
                      <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">‹</button>
                      <b>{year}</b>
                      <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="Next year">›</button>
                    </label>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setEdit({ type: "credit" })}>Set credit</button>
                  </div>
                </header>
                {data.leave_credits.length === 0 ? <Blank>{`No leave credits for ${year}. Use "Set credit" or "Generate ${year} leave credits" on the list.`}</Blank> : (
                  <div className="hr-cards">
                    {data.leave_credits.map((r) => {
                      const total = num(r.allowed_days) + num(r.carried_over);
                      return (
                        <article key={r.id} className="hr-leave">
                          <div className="hr-acct-top">
                            <div><b>{r.leave_type?.code}</b><span className="hr-sub">{r.leave_type?.name}</span></div>
                            <button type="button" className="btn btn-sm" onClick={() => setEdit({ type: "credit", row: r })}>Edit</button>
                          </div>
                          <div className="hr-leave-left"><b>{num(r.remaining_days)}</b> of {total} day(s) left</div>
                          <progress className="hr-bar" max={total || 1} value={Math.max(0, num(r.remaining_days))} />
                          <div className="hr-leave-foot">
                            <span>Allowed {num(r.allowed_days)}</span>
                            <span>Carried {num(r.carried_over)}</span>
                            <span>Used {num(r.used_days)}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- forms shown inside the popup ---------------- */
/** a form panel: Back · title · body · Cancel / Save */
function FormCard({ title, sub, back, save, disabled, saveLabel = "Save", children, aside, inline = false }) {
  return (
    <section className="hr-formcard">
      <header>
        {!inline && <button type="button" className="hr-back" onClick={back} aria-label="Back">‹</button>}
        <div><h5>{title}</h5>{sub && <span className="hr-muted">{sub}</span>}</div>
      </header>
      <div className="hr-formcard-body">{children}</div>
      {aside}
      {!inline && (
        <footer>
          <button type="button" className="btn" onClick={back}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={disabled}>{saveLabel}</button>
        </footer>
      )}
    </section>
  );
}

/* ---------- new employee: drafts (saved together with "Add employee") ---------- */
let draftSeq = 0;
/** add (row = null) or replace (row = the one being edited) in a draft list */
function upsertDraft(list, item, row) {
  if (row) return list.map((x) => (x.key === row.key ? { ...item, key: row.key } : x));
  return [...list, { ...item, key: `d${++draftSeq}` }];
}

function DraftShift({ shifts, value, onChange }) {
  const chosen = shifts.find((x) => String(x.id) === String(value)) || (!value && shifts.find((x) => x.is_default));
  return (
    <FormCard inline title="Shift" sub="Starts today · leave it on the default shift if he follows the usual schedule">
      <Field label="Shift" wide>
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Use the default shift</option>
          {shifts.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_default ? " · default" : ""}</option>)}
        </select>
      </Field>
      {chosen ? (
        <div className="hr-preview is-wide">
          <span><small>Time in</small><b>{t12(chosen.time_in)}</b></span>
          <span><small>Break</small><b>{chosen.break_in ? `${t12(chosen.break_in)} – ${t12(chosen.break_out)}` : "None"}</b></span>
          <span><small>Time out</small><b>{t12(chosen.time_out)}{chosen.is_overnight ? " (+1)" : ""}</b></span>
          <span><small>Work days</small><b>{DAYS.filter((d, i) => String(chosen.work_days || "").split(",").includes(String(i + 1))).join(", ") || "—"}</b></span>
        </div>
      ) : <p className="hr-hint is-wide">No default shift yet. Set one in HR Settings or pick a shift here.</p>}
    </FormCard>
  );
}

function DraftBanks({ list, onAdd, onEdit, onRemove }) {
  return (
    <section className="hr-pop-sec">
      <header>
        <div><h5>Bank accounts</h5><span className="hr-muted">Where the salary is sent · saved with the employee</span></div>
        <button type="button" className="btn btn-sm btn-primary" onClick={onAdd}>Add account</button>
      </header>
      {list.length === 0 ? <Blank>No bank account yet. Optional, you can add it later too.</Blank> : (
        <div className="hr-cards">
          {list.map((r) => (
            <article key={r.key} className={`hr-acct${r.is_default ? " is-default" : ""}`}>
              <div className="hr-acct-top"><b>{r.bank_name}</b>{r.is_default ? <Badge status="default" /> : <span className="hr-muted">{r.account_type}</span>}</div>
              <div className="hr-acct-no">{r.account_no}</div>
              <div className="hr-muted">{r.account_name}{r.branch ? ` · ${r.branch}` : ""}</div>
              <div className="hr-acct-act">
                <button type="button" className="btn btn-sm" onClick={() => onEdit(r)}>Edit</button>
                <button type="button" className="btn btn-sm" onClick={() => onRemove(r)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DraftCredits({ list, year, leaveTypes, onAdd, onEdit, onRemove, onDefaults }) {
  const typeOf = (id) => leaveTypes.find((t) => String(t.id) === String(id));
  return (
    <section className="hr-pop-sec">
      <header>
        <div><h5>Leave credits · {year}</h5><span className="hr-muted">Days allowed per leave type · saved with the employee</span></div>
        <div className="hr-toolbar">
          <button type="button" className="btn btn-sm" onClick={onDefaults} title="Each leave type with its default days">Use default days</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onAdd}>Set credit</button>
        </div>
      </header>
      {list.length === 0 ? <Blank>No leave credit yet. Optional, "Generate leave credits" on the list can do it later too.</Blank> : (
        <div className="hr-cards">
          {list.map((r) => {
            const t = typeOf(r.leave_type_id);
            const total = num(r.allowed_days) + num(r.carried_over);
            return (
              <article key={r.key} className="hr-leave">
                <div className="hr-acct-top">
                  <div><b>{t?.code || "—"}</b><span className="hr-sub">{t?.name}</span></div>
                  <div className="hr-actions">
                    <button type="button" className="btn btn-sm" onClick={() => onEdit({ ...r, leave_type: t })}>Edit</button>
                    <button type="button" className="btn btn-sm" onClick={() => onRemove(r)}>Remove</button>
                  </div>
                </div>
                <div className="hr-leave-left"><b>{total}</b> day(s) for {year}</div>
                <div className="hr-leave-foot"><span>Allowed {num(r.allowed_days)}</span><span>Carried {num(r.carried_over)}</span></div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** pick one of a few options as buttons */
function Segmented({ value, onChange, options, label }) {
  return (
    <div className="hr-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function ShiftForm({ empId, current, shifts, done, fail, back }) {
  const [f, set] = useForm({ shift_id: current ? String(current) : "", effective_from: todayPH(), reason: "" });
  const [busy, setBusy] = useState(false);
  const chosen = shifts.find((x) => String(x.id) === f.shift_id) || shifts.find((x) => x.is_default);
  const save = () => {
    setBusy(true);
    api.put(`/hr/employees/${empId}/shift`, { ...f, shift_id: f.shift_id ? Number(f.shift_id) : null })
      .then((r) => done(r.message)).catch(fail).finally(() => setBusy(false));
  };
  return (
    <FormCard title="Change shift" sub="The new shift applies from the effective date" back={back} save={save} disabled={busy} saveLabel={busy ? "Saving…" : "Save shift"}>
      <Field label="Shift" wide>
        <select className="input" value={f.shift_id} onChange={set("shift_id")}>
          <option value="">Use the default shift</option>
          {shifts.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_default ? " · default" : ""}</option>)}
        </select>
      </Field>
      {chosen && (
        <div className="hr-preview is-wide">
          <span><small>Time in</small><b>{t12(chosen.time_in)}</b></span>
          <span><small>Break</small><b>{chosen.break_in ? `${t12(chosen.break_in)} – ${t12(chosen.break_out)}` : "None"}</b></span>
          <span><small>Time out</small><b>{t12(chosen.time_out)}{chosen.is_overnight ? " (+1)" : ""}</b></span>
          <span><small>Work days</small><b>{DAYS.filter((d, i) => String(chosen.work_days || "").split(",").includes(String(i + 1))).join(", ") || "—"}</b></span>
        </div>
      )}
      <Field label="Effective from"><input type="date" className="input" value={f.effective_from} onChange={set("effective_from")} /></Field>
      <Field label="Reason"><input className="input" value={f.reason} onChange={set("reason")} placeholder="e.g. Moved to night shift" /></Field>
    </FormCard>
  );
}

function SalaryForm({ empId, done, fail, back, inline = false, initial = null, onDraft }) {
  const [f, set] = useForm({
    salary_type: "monthly", monthly_rate: "", daily_rate: "", allowance: 0, work_days_per_year: 313,
    description: "", reason: "", effective_from: todayPH(), is_default: true, ...(initial || {}),
  });
  // new employee: hand the rate to the popup on every change (null = no salary yet)
  useEffect(() => {
    if (!inline) return;
    const rate = Number(f[f.salary_type === "monthly" ? "monthly_rate" : "daily_rate"]);
    onDraft(rate > 0 ? {
      ...f, monthly_rate: f.salary_type === "monthly" ? f.monthly_rate : null, daily_rate: f.salary_type === "daily" ? f.daily_rate : null,
      allowance: Number(f.allowance) || 0, is_default: true,
    } : null);
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const days = Number(f.work_days_per_year) || 313;
  const daily = f.salary_type === "monthly" ? (Number(f.monthly_rate) * 12) / days : Number(f.daily_rate);
  const monthly = f.salary_type === "daily" ? (Number(f.daily_rate) * days) / 12 : Number(f.monthly_rate);
  const save = () => {
    setBusy(true);
    api.post(`/hr/employees/${empId}/salaries`, {
      ...f, monthly_rate: f.salary_type === "monthly" ? f.monthly_rate : null, daily_rate: f.salary_type === "daily" ? f.daily_rate : null,
    }).then((r) => done(r.message)).catch(fail).finally(() => setBusy(false));
  };
  const rateKey = f.salary_type === "monthly" ? "monthly_rate" : "daily_rate";
  return (
    <FormCard inline={inline} title={inline ? "Salary" : "New salary rate"} sub={inline ? "Optional · becomes his default rate · saved with the employee" : "Old rates stay in the history (e.g. after a DOLE wage order)"} back={back} save={save}
      disabled={busy || !(daily > 0)} saveLabel={busy ? "Saving…" : "Save rate"}
      aside={(
        <div className="hr-calc">
          <span><small>Monthly</small><b>{n2(monthly)}</b></span>
          <span><small>Daily</small><b>{n2(daily)}</b></span>
          <span><small>Hourly (8 h)</small><b>{n2(daily / 8)}</b></span>
        </div>
      )}>
      <Field label="Paid">
        <Segmented label="Paid" value={f.salary_type} onChange={(v) => set("salary_type", v)} options={[["monthly", "Monthly"], ["daily", "Daily"]]} />
      </Field>
      <Field label={f.salary_type === "monthly" ? "Monthly rate" : "Daily rate"}>
        <input type="number" min="0" step="0.01" className="input" value={f[rateKey] ?? ""} onChange={set(rateKey)} placeholder="0.00" autoFocus={!inline} />
      </Field>
      <Field label="Work days per year">
        <Segmented label="Work days per year" value={String(days)} onChange={(v) => set("work_days_per_year", Number(v))} options={[["313", "6-day week (313)"], ["261", "5-day week (261)"]]} />
      </Field>
      <Field label="Allowance per month"><input type="number" min="0" step="0.01" className="input" value={f.allowance} onChange={set("allowance")} /></Field>
      <Field label="Effective from"><input type="date" className="input" value={f.effective_from} onChange={set("effective_from")} /></Field>
      <Field label="Description"><input className="input" value={f.description} onChange={set("description")} placeholder="e.g. Main rate" /></Field>
      <Field label="Reason" wide><input className="input" value={f.reason} onChange={set("reason")} placeholder="e.g. Wage Order NCR-26, promotion" /></Field>
      {!inline && <label className="hr-check is-wide"><input type="checkbox" checked={f.is_default} onChange={set("is_default")} /> Make it the default rate (payroll uses it)</label>}
    </FormCard>
  );
}

function BankForm({ empId, row, done, fail, back, onSubmit }) {
  const [f, set] = useForm({
    bank_name: row?.bank_name || "", branch: row?.branch || "", account_name: row?.account_name || "", account_no: row?.account_no || "",
    account_type: row?.account_type || "payroll", is_default: row ? !!row.is_default : true, is_active: true,
  });
  const [busy, setBusy] = useState(false);
  const save = () => {
    if (onSubmit) { onSubmit(f); return; }
    setBusy(true);
    (row ? api.put(`/hr/banks/${row.id}`, f) : api.post(`/hr/employees/${empId}/banks`, f)).then((r) => done(r.message)).catch(fail).finally(() => setBusy(false));
  };
  return (
    <FormCard title={row ? "Edit bank account" : "Add bank account"} sub="Where the salary is sent" back={back} save={save}
      disabled={busy || !f.bank_name || !f.account_no || !f.account_name} saveLabel={busy ? "Saving…" : onSubmit ? (row ? "Update" : "Add") : "Save account"}>
      <Field label="Bank"><input className="input" value={f.bank_name} onChange={set("bank_name")} placeholder="e.g. BDO, Metrobank, GCash" autoFocus /></Field>
      <Field label="Branch"><input className="input" value={f.branch} onChange={set("branch")} placeholder="Optional" /></Field>
      <Field label="Account name"><input className="input" value={f.account_name} onChange={set("account_name")} /></Field>
      <Field label="Account no."><input className="input" value={f.account_no} onChange={set("account_no")} /></Field>
      <Field label="Type" wide>
        <Segmented label="Type" value={f.account_type} onChange={(v) => set("account_type", v)}
          options={[["payroll", "Payroll"], ["savings", "Savings"], ["checking", "Checking"], ["e-wallet", "E-wallet"]]} />
      </Field>
      <label className="hr-check is-wide"><input type="checkbox" checked={f.is_default} onChange={set("is_default")} /> Use this account for payroll</label>
    </FormCard>
  );
}

function CreditForm({ empId, year, row, leaveTypes, done, fail, back, onSubmit }) {
  const [f, set, setF] = useForm({ year, leave_type_id: row ? String(row.leave_type_id) : "", allowed_days: row?.allowed_days ?? "", carried_over: row?.carried_over ?? 0 });
  const [busy, setBusy] = useState(false);
  const total = (Number(f.allowed_days) || 0) + (Number(f.carried_over) || 0);
  const used = Number(row?.used_days) || 0;
  const pickType = (id) => {
    const t = leaveTypes.find((x) => String(x.id) === id);
    setF((p) => ({ ...p, leave_type_id: id, allowed_days: p.allowed_days === "" && t ? t.default_days : p.allowed_days }));
  };
  const save = () => {
    if (onSubmit) { onSubmit({ ...f, leave_type_id: Number(f.leave_type_id), allowed_days: Number(f.allowed_days), carried_over: Number(f.carried_over) || 0 }); return; }
    setBusy(true);
    api.put(`/hr/employees/${empId}/leave-credits`, f).then((r) => done(r.message)).catch(fail).finally(() => setBusy(false));
  };
  return (
    <FormCard title={row ? `${row.leave_type?.code} · ${row.leave_type?.name}` : "Set leave credit"} sub={`Days allowed for ${year}`} back={back} save={save}
      disabled={busy || !f.leave_type_id || f.allowed_days === ""} saveLabel={busy ? "Saving…" : onSubmit ? (row ? "Update" : "Add") : "Save credit"}
      aside={(
        <div className="hr-calc">
          <span><small>Total for {year}</small><b>{total} day(s)</b></span>
          <span><small>Used</small><b>{used}</b></span>
          <span><small>Left</small><b>{Math.max(0, total - used)}</b></span>
        </div>
      )}>
      {!row && (
        <Field label="Leave type" wide>
          <select className="input" value={f.leave_type_id} onChange={(e) => pickType(e.target.value)}>
            <option value="">Select…</option>
            {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Allowed days"><input type="number" min="0" step="0.5" className="input" value={f.allowed_days} onChange={set("allowed_days")} autoFocus={!!row} /></Field>
      <Field label="Carried over" hint="From last year"><input type="number" min="0" step="0.5" className="input" value={f.carried_over} onChange={set("carried_over")} /></Field>
    </FormCard>
  );
}