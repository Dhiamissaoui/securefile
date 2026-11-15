export default function StatusChip({ tone = 'neutral', icon: Icon, children, dot = false }) {
  return (
    <span className={`chip chip--${tone}`}>
      {dot ? <span className="chip__dot" /> : null}
      {Icon ? <Icon size={12.5} strokeWidth={2.2} /> : null}
      {children}
    </span>
  );
}
