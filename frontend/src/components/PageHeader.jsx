export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="page-head">
      <div className="page-head__text">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-head__actions">{actions}</div> : null}
    </header>
  );
}
