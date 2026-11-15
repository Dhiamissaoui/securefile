export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="empty">
      {Icon ? (
        <span className="empty__icon">
          <Icon size={26} strokeWidth={1.7} />
        </span>
      ) : null}
      <h4>{title}</h4>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}
