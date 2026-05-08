export default function Skeleton({ w = '100%', h = 16, r = 8, className = '' }) {
  return <div className={`shimmer-skel ${className}`} style={{ width: w, height: h, borderRadius: r }} />;
}

export function SkeletonCard({ children }) {
  return <div className="card-light p-7 space-y-3">{children}</div>;
}
