import type { ReactNode } from "react";

/**
 * The frame both auth screens sit in. Narrow, centred and quiet — there is
 * nothing else to do on these pages, so nothing else competes.
 */
export function AuthCard({
  title,
  subtitle,
  notice,
  children,
}: {
  title: string;
  subtitle?: string;
  notice?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[380px] py-6">
      <div className="mb-6 text-center">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-fairy-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[13px] leading-[1.55] font-medium text-fairy-grey-strong">
            {subtitle}
          </p>
        )}
      </div>

      {notice && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-fairy-hair bg-fairy-screen px-3 py-2.5 text-[12px] leading-[1.5] font-semibold text-fairy-ink-2"
        >
          {notice}
        </p>
      )}

      {children}
    </div>
  );
}

/**
 * Separates the one-tap path from the typing path. Decorative, so it is hidden
 * from screen readers — the two forms already read as distinct.
 */
export function OrDivider() {
  return (
    <div aria-hidden className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-fairy-hair" />
      <span className="text-[11px] font-bold text-fairy-grey">
        or
      </span>
      <span className="h-px flex-1 bg-fairy-hair" />
    </div>
  );
}
