import { colorFor, initials } from "../utils/format";

export default function Avatar({ name, size = 32 }) {
  return (
    <span
      className="avatar"
      style={{ background: colorFor(name), width: size, height: size, fontSize: Math.round(size * 0.36) }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
