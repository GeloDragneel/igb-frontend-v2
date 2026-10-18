// Shown when a user opens a page their access rights don't include
import { Link } from "react-router-dom";
import "./NoAccess.css";

export default function NoAccess() {
  return (
    <section className="card no-access">
      <h2>No access</h2>
      <p className="muted">Your account doesn't have access to this page. Ask your administrator to add it in Team → access rights.</p>
      <Link to="/" className="btn btn-primary">Go to Home</Link>
    </section>
  );
}
