export function AdminHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
      <div>
        <h1 className="font-saiyan text-3xl sm:text-4xl uppercase tracking-wide text-dbz-orange">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-dbz-yellow/80">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}
