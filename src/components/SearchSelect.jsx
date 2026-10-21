import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icons";

/*
  Searchable dropdown, like Select2.

  <SearchSelect
    value={f.customer}
    onChange={(v) => set("customer", v)}
    options={[{ value: "C1", label: "Juan Dela Cruz", hint: "CUS-0001" }]}
    placeholder="Select customer"
    variant="input" | "cell"      // "cell" = borderless, for the spreadsheet grid
    onAddNew={(typedText) => ...} // optional: shows an "Add new" button at the bottom
    addNewLabel="Add new account"
  />

  Any extra props (aria-label, data-*, onKeyDown...) go on the trigger button.
*/
export default function SearchSelect({
    value,
    onChange,
    options,
    placeholder = "Select...",
    searchPlaceholder = "Type to search...",
    variant = "input",
    className = "",
    disabled,
    onKeyDown,
    onAddNew,
    addNewLabel = "Add new",
    ...rest
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [pos, setPos] = useState(null);
    const trigger = useRef(null);
    const pop = useRef(null);
    const list = useRef(null);

    // one option per value: duplicate values made React reuse old rows, so the list didn't follow the search
    const unique = useMemo(() => {
        const seen = new Set();
        return (options || []).filter((o) => {
            const k = String(o.value);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }, [options]);

    const selected = unique.find((o) => String(o.value) === String(value));

    const filtered = useMemo(() => {
        const words = normalize(query).split(" ").filter(Boolean);
        if (!words.length) return unique;
        return unique.filter((o) => {
            const text = normalize(`${o.label} ${o.hint || ""} ${o.value}`);
            return words.every((w) => text.includes(w)); // every word, any order
        });
    }, [unique, query]);

    /* ---------- open / close ---------- */
    const place = () => {
        const r = trigger.current?.getBoundingClientRect();
        if (!r) return;
        const width = Math.max(r.width, 300);
        const spaceBelow = window.innerHeight - r.bottom;
        const up = spaceBelow < 300 && r.top > spaceBelow;
        setPos({
            left: Math.min(r.left, window.innerWidth - width - 8),
            width,
            ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        });
    };

    const openWith = (text = "") => {
        if (disabled) return;
        setQuery(text);
        const idx = unique.findIndex((o) => String(o.value) === String(value));
        setActive(text ? 0 : Math.max(0, idx));
        place();
        setOpen(true);
    };

    const close = (refocus = true) => {
        setOpen(false);
        setQuery("");
        if (refocus) trigger.current?.focus();
    };

    const addNew = () => {
        const typed = query.trim();
        close(false);
        onAddNew?.(typed);
    };

    const choose = (o) => {
        if (!o) return;
        onChange(o.value);
        close();
    };

    // outside click, scroll, resize
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (!pop.current?.contains(e.target) && !trigger.current?.contains(e.target)) close(false);
        };
        const onScroll = (e) => {
            if (pop.current?.contains(e.target)) return; // scrolling the list itself
            place();
        };
        document.addEventListener("mousedown", onDown);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", place);
        return () => {
            document.removeEventListener("mousedown", onDown);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", place);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // keep the highlighted option visible
    useLayoutEffect(() => {
        if (!open) return;
        list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [active, open]);

    useEffect(() => setActive(0), [query]);

    /* ---------- keyboard ---------- */
    const onTriggerKey = (e) => {
        if (disabled) return;
        const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
        if (e.key === "Enter" || e.key === " " || e.key === "F2" || (e.altKey && e.key === "ArrowDown")) {
            e.preventDefault();
            openWith();
            return;
        }
        if (printable) {
            e.preventDefault();
            openWith(e.key); // start searching with the typed letter
            return;
        }
        onKeyDown?.(e); // let the grid handle arrows etc.
    };

    const onSearchKey = (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
        } else if (e.key === "Home") {
            e.preventDefault();
            setActive(0);
        } else if (e.key === "End") {
            e.preventDefault();
            setActive(filtered.length - 1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length === 0 && onAddNew) addNew(); // nothing found -> Enter adds it
            else choose(filtered[active]);
        } else if (e.key === "Escape") {
            e.preventDefault();
            close();
        } else if (e.key === "Tab") {
            close(false);
        }
    };

    const listId = useMemo(() => `ss-${Math.random().toString(36).slice(2, 9)}`, []);

    return (
        <>
            <button
                type="button"
                ref={trigger}
                className={`ss-trigger ss-${variant} ${open ? "open" : ""} ${className}`}
                onClick={() => (open ? close() : openWith())}
                onKeyDown={onTriggerKey}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                title={selected?.label}
                {...rest}
            >
                <span className={`ss-value ${selected ? "" : "ss-placeholder"}`}>{selected ? selected.label : placeholder}</span>
                <Icon name="down" size={14} className="ss-caret" />
            </button>

            {open && pos &&
                createPortal(
                    <div className="ss-pop" ref={pop} style={pos}>
                        <div className="ss-search">
                            <Icon name="search" size={15} />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={onSearchKey}
                                placeholder={searchPlaceholder}
                                role="combobox"
                                aria-expanded="true"
                                aria-controls={listId}
                                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                                aria-label="Search options"
                            />
                        </div>
                        <ul className="ss-list" role="listbox" id={listId} ref={list}>
                            {filtered.length === 0 && <li className="ss-empty">No results for “{query}”</li>}
                            {filtered.map((o, i) => (
                                <li
                                    key={`${o.value}::${i}`}
                                    id={`${listId}-${i}`}
                                    data-i={i}
                                    role="option"
                                    aria-selected={String(o.value) === String(value)}
                                    className={`ss-opt ${i === active ? "active" : ""} ${String(o.value) === String(value) ? "selected" : ""}`}
                                    onMouseEnter={() => setActive(i)}
                                    onMouseDown={(e) => e.preventDefault()} // keep focus in the search box
                                    onClick={() => choose(o)}
                                >
                                    <span className="ss-opt-text">
                                        <span className="ss-opt-label"><Highlight text={o.label} query={query} /></span>
                                        {o.hint && <span className="ss-opt-hint"><Highlight text={o.hint} query={query} /></span>}
                                    </span>
                                    {String(o.value) === String(value) && <Icon name="check" size={14} className="ss-check" />}
                                </li>
                            ))}
                        </ul>
                        {onAddNew && (
                            <button
                                type="button"
                                className="ss-add"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={addNew}
                            >
                                <Icon name="plus" size={15} />
                                <span>
                                    {addNewLabel}
                                    {query.trim() && <strong> “{query.trim()}”</strong>}
                                </span>
                                {filtered.length === 0 && <kbd>Enter</kbd>}
                            </button>
                        )}
                    </div>,
                    document.body
                )}
        </>
    );
}

// Bold the part that matches the search
// lower-case, remove accents (Ñ -> n), squeeze spaces
function normalize(s) {
    return String(s ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

// Highlight every typed word
function Highlight({ text, query }) {
    const words = normalize(query).split(" ").filter(Boolean);
    const str = String(text ?? "");
    if (!words.length) return str;

    // mark ranges in the original text (same length after normalizing accents)
    const plain = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const marks = new Array(str.length).fill(false);
    words.forEach((w) => {
        let i = plain.indexOf(w);
        while (i !== -1) {
            for (let k = i; k < i + w.length; k++) marks[k] = true;
            i = plain.indexOf(w, i + w.length);
        }
    });

    const out = [];
    let buf = "";
    let on = false;
    for (let k = 0; k < str.length; k++) {
        if (marks[k] !== on) {
            if (buf) out.push(on ? <mark key={k}>{buf}</mark> : buf);
            buf = "";
            on = marks[k];
        }
        buf += str[k];
    }
    if (buf) out.push(on ? <mark key="end">{buf}</mark> : buf);
    return <>{out}</>;
}