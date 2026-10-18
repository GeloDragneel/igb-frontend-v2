// Outlined status badge. tone: blue | green | orange | red | teal | gray | purple
const TONES = {
  Paid: "green", Unpaid: "red", Partial: "orange",
  Approved: "green", Pending: "orange", Rejected: "red",
  Received: "green", Ordered: "blue", Cancelled: "gray", Void: "red",
  Active: "teal", Inactive: "gray",
};

export default function Badge({ children, tone }) {
  const t = tone || TONES[children] || "blue";
  return <span className={`badge badge-${t}`}>{children}</span>;
}