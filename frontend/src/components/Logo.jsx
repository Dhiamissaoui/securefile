export default function Logo({ size = 30 }) {
  return (
    <div className="logo">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="logo__mark"
      >
        <path d="M12 2.5 20 6v6.2c0 4.6-3.3 8.4-8 9.3-4.7-.9-8-4.7-8-9.3V6l8-3.5Z" />
        <rect x="9" y="11" width="6" height="5" rx="1.2" />
        <path d="M10.4 11V9.6a1.6 1.6 0 0 1 3.2 0V11" />
      </svg>
      <span className="logo__word">
        Secure<span>File</span>
      </span>
    </div>
  );
}
