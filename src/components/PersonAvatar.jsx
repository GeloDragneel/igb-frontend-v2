// A person's picture: the profile photo, or a default avatar by gender (MALE / FEMALE / anything else = neutral)
import "./PersonAvatar.css";

const kindOf = (gender) => {
    const g = String(gender || "").trim().toUpperCase();
    if (g === "MALE" || g === "M") return "male";
    if (g === "FEMALE" || g === "F") return "female";
    return "neutral";
};

export default function PersonAvatar({ photo, gender, className = "" }) {
    const kind = kindOf(gender);
    return (
        <span className={`pa pa-${kind} ${className}`.trim()}>
            {photo ? <img src={photo} alt="" /> : (
                <svg viewBox="0 0 64 64" aria-hidden="true">
                    {kind === "female" && <path className="pa-hair-back" d="M14 34c0-14 7-24 18-24s18 10 18 24v14c0 3-2 5-5 5H19c-3 0-5-2-5-5z" />}
                    <path className="pa-body" d="M10 64c0-13 10-21 22-21s22 8 22 21z" />
                    <rect className="pa-neck" x="27" y="36" width="10" height="9" rx="3" />
                    <circle className="pa-face" cx="32" cy="27" r="12" />
                    {kind === "male" && <path className="pa-hair" d="M20 25c0-8 5-13 12-13s12 5 12 13c-2-4-6-6-12-6s-10 2-12 6z" />}
                    {kind === "female" && <path className="pa-hair" d="M19 28c0-9 6-15 13-15s13 6 13 15c-3-5-7-8-13-8-3 4-8 7-13 8z" />}
                    {kind === "neutral" && <path className="pa-hair" d="M20 24c1-7 6-11 12-11s11 4 12 11c-3-3-7-4-12-4s-9 1-12 4z" />}
                </svg>
            )}
        </span>
    );
}