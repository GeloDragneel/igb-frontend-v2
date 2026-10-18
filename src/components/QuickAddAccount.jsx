import { useState } from "react";
import Modal, { Field } from "./Modal";
import SearchSelect from "./SearchSelect";
import { useAppData } from "../context/AppDataContext";
import { useToast } from "./Toast";
import { headerOptions, nextAccountCode } from "../utils/coa";

/*
  Small popup to create a new posting account without leaving the page.

  <QuickAddAccount
    types={["Revenue"]}          // which account types are allowed here
    nearCode="42100"             // current value: the new account goes under the same header
    defaultName="Sales - Toys"   // text the user typed in the dropdown
    onClose={() => ...}
    onCreated={(code) => ...}    // select the new account
  />
*/
export default function QuickAddAccount({ types, defaultName = "", nearCode, onClose, onCreated }) {
    const { accounts = [], saveAccount } = useAppData();
    const notify = useToast();

    const parents = headerOptions(accounts, types);

    // Default "Under": the header of the currently selected account,
    // otherwise the first header that already holds posting accounts
    const near = accounts.find((a) => a.code === nearCode);
    const firstParent =
        (near && parents.some((p) => p.value === near.parent) && near.parent) ||
        parents.find((p) => accounts.some((a) => a.parent === p.value && !a.isGroup))?.value ||
        parents[0]?.value ||
        "";

    // If the user typed a code (e.g. "41100 Sales - Toys"), split it
    const m = defaultName.match(/^(\d{3,})\s*[-–]?\s*(.*)$/);
    const [f, setF] = useState({
        parent: firstParent,
        code: m ? m[1] : nextAccountCode(accounts, firstParent),
        name: m ? m[2] : defaultName,
    });
    const [errors, setErrors] = useState({});
    const [saveError, setSaveError] = useState("");

    const parentAcc = accounts.find((a) => a.code === f.parent);

    const pickParent = (code) =>
        setF((x) => ({ ...x, parent: code, code: m ? x.code : nextAccountCode(accounts, code) }));

    const submit = () => {
        const e = {};
        const code = f.code.trim();
        if (!f.parent) e.parent = "Choose where this account belongs.";
        if (!code) e.code = "Enter an account code.";
        else if (accounts.some((a) => a.code === code)) e.code = `${code} already exists.`;
        if (!f.name.trim()) e.name = "Enter the account name.";
        setErrors(e);
        if (Object.keys(e).length) return;

        const res = saveAccount({
            code,
            name: f.name.trim(),
            type: parentAcc.type,
            parent: f.parent,
            isGroup: false,
            description: "",
            status: "Active",
        });
        if (res?.error) return setSaveError(res.error);
        notify(`${code} – ${f.name.trim()} added to Charts of Account`);
        onCreated(code);
    };

    return (
        <Modal
            title="Add new account"
            onClose={onClose}
            size="sm"
            footer={
                <>
                    <button className="btn" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" onClick={submit}>Add account</button>
                </>
            }
        >
            {saveError && <div className="alert-error" role="alert">{saveError}</div>}
            {parents.length === 0 ? (
                <p className="confirm-text">
                    There's no header account for {types?.join(" / ") || "this type"} yet. Create one in Setup → Charts of Account first.
                </p>
            ) : (
                <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                    <div className="field">
                        <span className="field-label">Under</span>
                        <SearchSelect value={f.parent} onChange={pickParent} options={parents} aria-label="Parent account" />
                        {errors.parent ? (
                            <div className="field-error">{errors.parent}</div>
                        ) : (
                            parentAcc && <div className="field-hint">Type: {parentAcc.type}</div>
                        )}
                    </div>
                    <Field label="Account code" error={errors.code}>
                        <input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
                    </Field>
                    <Field label="Account name" error={errors.name}>
                        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Sales - Toys" />
                    </Field>
                </div>
            )}
        </Modal>
    );
}