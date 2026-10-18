// Helpers to use the Chart of Accounts in dropdowns

const byCodeNum = (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true });

/*
  Posting accounts as SearchSelect options.
  types: limit to these account types, e.g. ["Revenue"] or ["Asset"]
*/
export function accountOptions(accounts = [], { types, includeCode } = {}) {
    const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
    return accounts
        .filter(
            (a) =>
                (!a.isGroup && a.status === "Active" && (!types || types.includes(a.type))) ||
                a.code === includeCode // keep the current value visible even if inactive
        )
        .sort(byCodeNum)
        .map((a) => ({
            value: a.code,
            label: `${a.code} - ${a.name}`,
            hint: [a.type, byCode[a.parent]?.name].filter(Boolean).join(" · "),
        }));
}

// Header accounts that a new account can go under
export function headerOptions(accounts = [], types) {
    return accounts
        .filter((a) => a.isGroup && a.status === "Active" && (!types || types.includes(a.type)))
        .sort(byCodeNum)
        .map((a) => ({ value: a.code, label: `${a.code} - ${a.name}`, hint: a.type }));
}

// Next free code under a header, e.g. 42900 -> 42901
export function nextAccountCode(accounts = [], parent) {
    const taken = new Set(accounts.map((a) => a.code));
    const kids = accounts.filter((a) => a.parent === parent).map((a) => Number(a.code)).filter((n) => !isNaN(n));
    let n = kids.length ? Math.max(...kids) + 1 : /^\d+$/.test(parent || "") ? Number(parent) + 1 : NaN;
    if (isNaN(n)) return "";
    while (taken.has(String(n))) n++;
    return String(n);
}