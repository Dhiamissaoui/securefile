export function Skeleton({ width = '100%', height = 16, radius = 8, style }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card card--pad">
      <Skeleton width="38%" height={18} />
      <div style={{ height: 14 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <Skeleton width={`${92 - i * 13}%`} height={12} />
        </div>
      ))}
    </div>
  );
}
