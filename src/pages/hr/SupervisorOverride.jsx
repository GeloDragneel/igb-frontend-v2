// Supervisor override: a supervisor logs in (username + password of m_user_staff, SUPERVISOR or CEO) to approve
import { useState } from "react";
import Modal from "../../components/Modal";
import { Field } from "./HRShared";

export default function SupervisorOverride({ title, message, confirmLabel = "Approve", onSubmit, onClose }) {
    const [f, setF] = useState({ username: "", password: "" });
    const [busy, setBusy] = useState(false);
    const ready = f.username && f.password;
    const submit = () => {
        if (!ready || busy) return;
        setBusy(true);
        Promise.resolve(onSubmit(f)).finally(() => setBusy(false));
    };
    return (
        <Modal title={title || "Supervisor override"} onClose={onClose}
            footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy || !ready}>{busy ? "Checking…" : confirmLabel}</button></>}>
            {message && <p className="hr-note">{message}</p>}
            <p className="hr-note is-warn">A supervisor must log in here to continue.</p>
            <form className="hr-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <Field label="Supervisor username"><input className="input" autoComplete="off" value={f.username} onChange={(e) => setF((p) => ({ ...p, username: e.target.value }))} /></Field>
                <Field label="Password"><input type="password" className="input" autoComplete="new-password" value={f.password} onChange={(e) => setF((p) => ({ ...p, password: e.target.value }))} /></Field>
                <button type="submit" hidden aria-hidden="true" />
            </form>
        </Modal>
    );
}