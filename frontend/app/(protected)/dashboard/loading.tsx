export default function DashboardLoading() {
  return <div className="space-y-6"><div className="h-10 w-64 animate-pulse rounded-lg bg-white/[.04]" /><div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl border border-border bg-panel" />)}</div></div>;
}
