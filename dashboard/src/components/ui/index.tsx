import { ReactNode } from 'react';
import clsx from 'clsx';

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className,
  hover = false,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Tag
      className={clsx(
        'surface transition-colors duration-150',
        hover && 'hover:border-line-strong hover:shadow-card-hover',
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex items-start justify-between gap-3 px-5 py-4 border-b border-line',
        className
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-400/10 text-primary-400">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="section-title truncate">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-sm text-ink-subtle truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={clsx(padded && 'p-5', className)}>{children}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  hint,
  icon,
  loading = false,
  tone = 'default',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  tone?: 'default' | 'primary' | 'success' | 'warning';
  className?: string;
}) {
  const iconTone = {
    default: 'bg-surface-overlay text-ink-muted',
    primary: 'bg-primary-400/10 text-primary-400',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  }[tone];

  return (
    <div
      className={clsx(
        'surface p-5 group hover:border-line-strong transition-colors duration-150',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-subtle truncate">{label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            {loading ? (
              <div className="skeleton h-8 w-20" />
            ) : (
              <span className="text-4xl font-semibold text-ink tabular-nums tracking-tight">
                {value}
              </span>
            )}
          </div>
          {hint && (
            <p className="mt-1.5 text-sm text-ink-faint truncate">{hint}</p>
          )}
        </div>
        {icon && (
          <span
            className={clsx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors',
              iconTone
            )}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

const badgeTones = {
  neutral: 'bg-surface-overlay text-ink-muted border border-line',
  primary: 'bg-primary-400/10 text-primary-300 border border-primary-400/20',
  success: 'bg-success/10 text-success border border-success/20',
  warning: 'bg-warning/10 text-warning border border-warning/20',
  danger: 'bg-danger/10 text-danger border border-danger/20',
  info: 'bg-info/10 text-info border border-info/20',
} as const;

export type BadgeTone = keyof typeof badgeTones;

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={clsx('badge', badgeTones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between animate-fade-in-slide',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-ink-subtle max-w-2xl">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

export function Skeleton({
  className,
  lines,
}: {
  className?: string;
  lines?: number;
}) {
  if (lines) {
    return (
      <div className={clsx('space-y-2', className)} aria-hidden>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton h-4"
            style={{ width: `${100 - i * 12}%` }}
          />
        ))}
      </div>
    );
  }
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="surface p-5 space-y-3">
      <Skeleton className="h-5 w-40" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-surface/50 px-6 py-14 text-center animate-fade-in',
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-overlay text-ink-subtle">
          {icon}
        </div>
      )}
      <h3 className="section-title">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-base text-ink-subtle">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
