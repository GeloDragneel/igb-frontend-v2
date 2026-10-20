import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icons";
import Avatar from "./Avatar";
import ConfirmDialog from "./ConfirmDialog";
import SearchSelect from "./SearchSelect";
import { useToast } from "./Toast";
import { useAuth, apiFetch } from "../context/AuthContext";
import BirthdayPopup from "./BirthdayPopup";
import NotificationBell from "./NotificationBell";
import AiAssistant from "./AiAssistant";
import Messenger from "./Messenger";
import "./PersonAvatar.css"; // header photo styles
import { useAppData, saleBalance } from "../context/AppDataContext";

/* ---------- small hooks ---------- */

function useStored(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue];
}

function useTheme() {
  const [theme, setTheme] = useStored("bizdesk-theme", "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [theme, setTheme];
}

// Closes a popover on outside click or Escape
function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, ref]);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* ---------- header ---------- */

export default function Header({ onMenu }) {
  const { products, sales } = useAppData();
  const { user, logout, selectBranch } = useAuth();
  const navigate = useNavigate();
  const notify = useToast();
  const [theme, setTheme] = useTheme();

  // name/email/role from the login (an old name saved in this browser is still shown)
  const [savedProfile] = useStored(`bizdesk-profile-${user?.username || "guest"}`, null);
  const profile = savedProfile || {
    name: user?.name || "User",
    email: user?.email || "",
    role: user?.role || "",
  };

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const userRef = useRef(null);
  useDismiss(userOpen, setUserOpen, userRef);

  /* ---------- Staff: employee photo (S3) on the user button ---------- */
  const isStaff = user?.type === "Staff";
  const [photo, setPhoto] = useState(null);
  useEffect(() => {
    if (!isStaff) { setPhoto(null); return; }
    apiFetch("/hr/my-photo").then((r) => setPhoto(r?.photo_url || null)).catch(() => setPhoto(null));
    // My profile tells the header when the photo is saved / removed
    const onPhoto = (e) => setPhoto(e.detail || null);
    window.addEventListener("profile-photo", onPhoto);
    return () => window.removeEventListener("profile-photo", onPhoto);
  }, [isStaff, user?.username]);
  const face = (size) => (photo
    ? <img className={`me-photo is-${size}`} src={photo} alt="" onError={() => setPhoto(null)} />
    : <Avatar name={profile.name} size={size} />);

  /* ---------- Staff: branch list (same rules as the old query) ---------- */
  /* ---------- branch list (all user types) ---------- */
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/branches").then(setBranches).catch(() => setBranches([]));
  }, [user]);

  // The account you're logged in to right now
  const currentCaid = user?.caid ?? null;

  const branchOptions = branches.map((b) => ({
    value: String(b.caid),
    label: `${b.branch_code || ""} ${b.trade_name || ""}`.trim(),
    hint: [b.da_name && `DA: ${b.da_name}`, b.status, b.has_login ? "Has login" : "No login"]
      .filter(Boolean)
      .join(" · "),
  }));

  const [switching, setSwitching] = useState(false);

  const pickBranch = async (caid) => {
    if (String(caid) === String(currentCaid)) return;
    setSwitching(true);
    const res = await selectBranch(caid);
    setSwitching(false);
    if (res.error) notify(res.error, "error");
    else notify(`Switched to ${res.branch.branch_code} ${res.branch.trade_name}`);
  };

  /* ---------- live alerts from the data ---------- */
  const alerts = useMemo(() => {
    const list = [];
    products.filter((p) => p.status === "Active" && p.stock === 0).forEach((p) =>
      list.push({ key: "o" + p.code, tone: "red", text: `${p.name} is out of stock`, to: "/setup/product" })
    );
    products.filter((p) => p.status === "Active" && p.stock > 0 && p.stock <= p.reorder).forEach((p) =>
      list.push({ key: "l" + p.code, tone: "orange", text: `${p.name} is low (${p.stock} ${p.unit} left)`, to: "/setup/product" })
    );
    const unpaid = sales.filter((s) => saleBalance(s) > 0).length;
    if (unpaid) list.push({ key: "unpaid", tone: "blue", text: `${unpaid} invoice${unpaid > 1 ? "s have" : " has"} an unpaid balance`, to: "/task/sales" });
    return list;
  }, [products, sales]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  // My profile: staff logins → their employee profile page · every other login → settings
  const openProfile = () => {
    setUserOpen(false);
    navigate(user?.type === "Staff" ? "/profile" : "/settings");
  };

  const signOut = async () => {
    setConfirmSignOut(false);
    // the next login sees the birthday popup again
    try { Object.keys(sessionStorage).filter((k) => k.startsWith("bday-popup:")).forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
    await logout();
    navigate("/login", { replace: true });
  };

  /* ---------- business name area ---------- */
  let businessArea;
  if (branches.length > 0) {
    // Popup list of every client account for this user (all user types)
    businessArea = (
      <SearchSelect
        variant="cell"
        disabled={switching}
        className="hd-business hd-branch-select"
        value={currentCaid != null ? String(currentCaid) : ""}
        onChange={pickBranch}
        options={branchOptions}
        placeholder={user?.type === "Staff" ? "NO CLIENT SELECTED" : user?.business_name || "Select branch"}
        searchPlaceholder="Search branch..."
        aria-label="Select client account"
      />
    );
  } else {
    businessArea = (
      <span className="hd-business is-static">
        {user?.business_name || user?.name || "Welcome"}
        {user?.business_name && user?.branch_code && <span className="hd-branch">{user.branch_code}</span>}
      </span>
    );
  }

  return (
    <header className="topbar">
      <button className="icon-btn ghost" onClick={onMenu} aria-label="Toggle menu">
        <Icon name="menu" size={22} />
      </button>

      <div className="hd-greet">
        <span className="hd-hello">{greeting()},</span>
        {businessArea}
      </div>

      <div className="topbar-right">
        {/* birthday today: animated cake (click = celebrants) · pops up by itself once after login */}
        <BirthdayPopup />

        {/* AI Assistant: messenger-style chat (bottom right) */}
        <AiAssistant />

        <button
          className="icon-btn round"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>

        {/* Messenger: employees only (Staff / ClientStaff) */}
        <Messenger />

        {/* Notifications: Staff / ClientStaff → NotificationController · Client → the alerts above */}
        <NotificationBell alerts={alerts} open={notifOpen} setOpen={setNotifOpen} onOpen={() => setUserOpen(false)} />

        {/* User menu */}
        <div className="pop-wrap" ref={userRef}>
          <button
            className="me"
            onClick={() => { setUserOpen(!userOpen); setNotifOpen(false); }}
            aria-haspopup="menu"
            aria-expanded={userOpen}
          >
            {face(36)}
            <span className="me-text">
              <strong>{profile.name}</strong>
              <span>{profile.role}</span>
            </span>
            <Icon name="chevron" size={16} className="me-caret" />
          </button>

          {userOpen && (
            <div className="popover user-menu" role="menu">
              <div className="user-menu-head">
                {face(42)}
                <div>
                  <strong>{profile.name}</strong>
                  <span>{profile.email || user?.username}</span>
                </div>
              </div>

              <button role="menuitem" className="user-menu-item" onClick={openProfile}>
                <Icon name="user" size={17} /> My profile
              </button>
              <button role="menuitem" className="user-menu-item" onClick={toggleTheme}>
                <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
              <a role="menuitem" className="user-menu-item" href="mailto:support@example.com" onClick={() => setUserOpen(false)}>
                <Icon name="help" size={17} /> Help &amp; support
              </a>

              <div className="user-menu-sep" />

              <button role="menuitem" className="user-menu-item danger" onClick={() => { setUserOpen(false); setConfirmSignOut(true); }}>
                <Icon name="logout" size={17} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmSignOut && (
        <ConfirmDialog
          title="Sign out?"
          message="You'll need to sign in again to use IGB."
          confirmLabel="Sign out"
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={signOut}
        />
      )}
    </header>
  );
}