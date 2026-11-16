// Messenger photo viewer: zoom (wheel, pinch, double-click, + / −), drag to move, previous / next.
//   setLightbox("url")                                   → one photo (old calls still work)
//   setLightbox({ src, caption })                        → one photo with a caption
//   setLightbox({ list: [{ src, caption }], index: 2 })  → many photos, opens on index
// Keys: ← → previous / next · + − zoom · 0 reset · Esc close
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./MsPhotoViewer.css";

const MIN = 1;
const MAX = 5;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const toList = (lb) => {
    if (!lb) return { list: [], index: 0 };
    if (typeof lb === "string") return { list: [{ src: lb }], index: 0 };
    if (Array.isArray(lb.list)) {
        const list = lb.list.filter((x) => x && x.src);
        return { list, index: clamp(lb.index ?? 0, 0, Math.max(0, list.length - 1)) };
    }
    return { list: lb.src ? [{ src: lb.src, caption: lb.caption }] : [], index: 0 };
};

const Ico = ({ d, size = 22 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
    </svg>
);
const I = {
    x: "M18 6 6 18M6 6l12 12",
    prev: "M15 18l-6-6 6-6",
    next: "M9 18l6-6-6-6",
    plus: "M12 5v14M5 12h14",
    minus: "M5 12h14",
    reset: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
};

export default function MsPhotoViewer({ value, onClose }) {
    const { list, index: start } = toList(value);
    const [index, setIndex] = useState(start);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const stage = useRef(null);
    const img = useRef(null);
    const drag = useRef(null);       // { x, y, px, py, moved, bg = pressed on the dark area }
    const pinch = useRef(null);      // { dist, zoom }
    const pointers = useRef(new Map());

    const count = list.length;
    const cur = list[index] || list[0];

    // new photo → fit again
    const reset = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
    useEffect(() => { setIndex(start); }, [value]);    // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(reset, [index, reset]);

    const go = useCallback((step) => {
        if (count < 2) return;
        setIndex((i) => (i + step + count) % count);
    }, [count]);

    // keep the photo inside the screen while moving it
    const limit = useCallback((p, z) => {
        const el = img.current, st = stage.current;
        if (!el || !st || z <= 1) return { x: 0, y: 0 };
        const maxX = Math.max(0, (el.offsetWidth * z - st.clientWidth) / 2);
        const maxY = Math.max(0, (el.offsetHeight * z - st.clientHeight) / 2);
        return { x: clamp(p.x, -maxX, maxX), y: clamp(p.y, -maxY, maxY) };
    }, []);

    // zoom toward a point on screen (cx, cy = client coords; none = center)
    const zoomTo = useCallback((next, cx, cy) => {
        setZoom((z) => {
            const nz = clamp(next(z), MIN, MAX);
            setPan((p) => {
                if (nz === 1) return { x: 0, y: 0 };
                const r = stage.current?.getBoundingClientRect();
                if (!r || cx == null) return limit({ x: p.x * (nz / z), y: p.y * (nz / z) }, nz);
                const ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
                return limit({ x: ox - (ox - p.x) * (nz / z), y: oy - (oy - p.y) * (nz / z) }, nz);
            });
            return nz;
        });
    }, [limit]);

    // keyboard
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") { e.stopPropagation(); onClose(); }
            else if (e.key === "ArrowLeft") go(-1);
            else if (e.key === "ArrowRight") go(1);
            else if (e.key === "+" || e.key === "=") zoomTo((z) => z * 1.25);
            else if (e.key === "-") zoomTo((z) => z / 1.25);
            else if (e.key === "0") reset();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [go, zoomTo, reset, onClose]);

    // wheel zoom (non-passive so the page doesn't scroll)
    useEffect(() => {
        const st = stage.current;
        if (!st) return undefined;
        const onWheel = (e) => {
            e.preventDefault();
            const f = Math.exp(-e.deltaY * 0.0015);
            zoomTo((z) => z * f, e.clientX, e.clientY);
        };
        st.addEventListener("wheel", onWheel, { passive: false });
        return () => st.removeEventListener("wheel", onWheel);
    }, [zoomTo]);

    /* ---------- drag / pinch / swipe ---------- */
    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        stage.current?.setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
            drag.current = null;
        } else {
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false, bg: e.target === stage.current };
        }
    };
    const onPointerMove = (e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            const target = pinch.current.zoom * (d / (pinch.current.dist || 1));
            zoomTo(() => target, (a.x + b.x) / 2, (a.y + b.y) / 2);
            return;
        }
        const g = drag.current;
        if (!g) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
        if (zoom > 1 && g.moved) {
            setDragging(true);
            setPan(limit({ x: g.px + dx, y: g.py + dy }, zoom));
        }
    };
    const onPointerUp = (e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        const g = drag.current;
        drag.current = null;
        setDragging(false);
        if (!g) return;
        const dx = e.clientX - g.x;
        // swipe left / right at normal size = next / previous
        if (zoom === 1 && g.moved && Math.abs(dx) > 60 && e.pointerType !== "mouse") go(dx < 0 ? 1 : -1);
        // a plain click on the dark area closes (like before)
        else if (!g.moved && g.bg && zoom === 1) onClose();
    };

    const onDoubleClick = (e) => {
        e.stopPropagation();
        if (zoom > 1) reset();
        else zoomTo(() => 2.5, e.clientX, e.clientY);
    };

    if (!cur) return null;

    return createPortal(
        <div className="mpv" role="dialog" aria-label="Photo" aria-modal="true">
            <div className="mpv-top">
                <span className="mpv-count">{count > 1 ? `${index + 1} / ${count}` : ""}</span>
                <div className="mpv-tools">
                    <button type="button" onClick={() => zoomTo((z) => z / 1.25)} disabled={zoom <= MIN} aria-label="Zoom out" title="Zoom out (−)"><Ico d={I.minus} size={20} /></button>
                    <span className="mpv-zoom">{Math.round(zoom * 100)}%</span>
                    <button type="button" onClick={() => zoomTo((z) => z * 1.25)} disabled={zoom >= MAX} aria-label="Zoom in" title="Zoom in (+)"><Ico d={I.plus} size={20} /></button>
                    <button type="button" onClick={reset} disabled={zoom === 1} aria-label="Reset zoom" title="Fit (0)"><Ico d={I.reset} size={18} /></button>
                    <button type="button" className="mpv-close" onClick={onClose} aria-label="Close" title="Close (Esc)"><Ico d={I.x} /></button>
                </div>
            </div>

            <div
                ref={stage}
                className={`mpv-stage${zoom > 1 ? " is-zoomed" : ""}${dragging ? " is-dragging" : ""}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={onDoubleClick}
            >
                <img
                    ref={img}
                    key={cur.src}
                    src={cur.src}
                    alt={cur.caption || ""}
                    draggable={false}
                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: dragging || pinch.current ? "none" : undefined }}
                />
            </div>

            {count > 1 && (
                <>
                    <button type="button" className="mpv-nav mpv-prev" onClick={() => go(-1)} aria-label="Previous photo" title="Previous (←)"><Ico d={I.prev} size={28} /></button>
                    <button type="button" className="mpv-nav mpv-next" onClick={() => go(1)} aria-label="Next photo" title="Next (→)"><Ico d={I.next} size={28} /></button>
                </>
            )}

            {cur.caption && <div className="mpv-caption">{cur.caption}</div>}
        </div>,
        document.body
    );
}