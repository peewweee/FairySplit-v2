import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Page chrome, per the sample's study page: an uppercase deep-rose eyebrow, a
 * tight-tracked heading, a relaxed lede, and a hairline rule underneath.
 */
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
  /** Sits directly under the title — a compact control, not prose. */
  meta?: ReactNode;
}) {
  const heading = (
    <>
      {eyebrow && (
        <p className="mb-2.5 text-[11px] font-bold tracking-[0.14em] text-fairy-rose uppercase">
          {eyebrow}
        </p>
      )}
      <h1 className="max-w-[20ch] text-[clamp(26px,3.4vw,36px)] leading-[1.06] text-fairy-ink">
        {title}
      </h1>
    </>
  );

  const controls = action && <div className="flex shrink-0 items-center gap-2">{action}</div>;

  // With no prose under the title, the only thing left on the left is a compact
  // control — so the actions belong ON ITS LINE, centred against it, rather
  // than bottom-aligned to a column that is no longer there.
  if (meta && !description) {
    return (
      <div className="mb-8 border-b border-fairy-hair pb-6">
        {heading}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">{meta}</div>
          {controls}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 border-b border-fairy-hair pb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {heading}
          {meta && <div className="mt-3">{meta}</div>}
          {description && (
            <div className="mt-3 max-w-[62ch] text-[14px] leading-[1.6] font-medium text-fairy-grey-strong">
              {description}
            </div>
          )}
        </div>
        {controls}
      </div>
    </div>
  );
}

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-5 flex flex-wrap items-center gap-1 text-[11.5px] font-semibold"
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3 text-fairy-hair-2" aria-hidden />}
          {item.href ? (
            <Link
              href={item.href}
              className="text-fairy-grey-strong underline-offset-4 hover:text-fairy-ink hover:underline"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-fairy-ink">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** A section header row: caption over a bold label, with an action on the right. */
export function SectionHead({
  caption,
  title,
  action,
  className,
}: {
  caption?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {caption && <p className="fs-lab mb-0.5">{caption}</p>}
        <h2 className="text-[14.5px] leading-tight text-fairy-ink">{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden border border-dashed border-fairy-hair-2 bg-fairy-screen px-6 py-12 text-center",
        className,
      )}
    >
      <span className="fs-arc fs-arc-a" aria-hidden />
      {icon && (
        <div className="mx-auto mb-4 grid size-11 place-items-center bg-fairy-tint text-fairy-tint-ink">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] text-fairy-ink">{title}</h3>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-[1.55] font-medium text-fairy-grey">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-busy aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse border border-fairy-hair bg-fairy-ground-2" />
      ))}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="border-l-[2.5px] border-fairy-danger bg-fairy-danger-tint px-3.5 py-2.5 text-[12.5px] font-semibold text-fairy-danger"
    >
      {children}
    </p>
  );
}

/**
 * A tinted callout. The sample's notice: pink tint, deep-rose text, an arc
 * bleeding off the corner, no border.
 */
export function Notice({
  icon,
  children,
  tone = "pink",
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: "pink" | "ember";
}) {
  return (
    <div
      className={cn(
        "fs-notice flex gap-3 px-4 py-3.5",
        tone === "ember" && "bg-fairy-ember-tint text-fairy-ember",
      )}
    >
      <span
        aria-hidden
        className="fs-arc"
        style={{
          width: 88,
          height: 88,
          right: -34,
          top: -30,
          borderColor: "currentColor",
          opacity: 0.2,
        }}
      />
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <div className="min-w-0 text-[12.5px] leading-[1.5] font-semibold">{children}</div>
    </div>
  );
}

/** Caption over value - the sample's core stat unit. */
export function Stat({
  label,
  value,
  size = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  size?: "default" | "lg";
}) {
  return (
    <div>
      <p className="fs-lab mb-1.5">{label}</p>
      <p className={cn("fs-val", size === "lg" ? "text-[29px]" : "text-[19px]")} data-numeric>
        {value}
      </p>
    </div>
  );
}

/** A breakdown row: pink tick, caption, value, hairline underneath. */
export function TickItem({
  label,
  value,
  last,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  last?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("py-3.5", !last && "border-b border-fairy-hair", className)}>
      <div className="fs-tick mb-2.5" aria-hidden />
      <p className="fs-lab mb-1.5">{label}</p>
      <p className="fs-val text-[14.5px]" data-numeric>
        {value}
      </p>
    </div>
  );
}
