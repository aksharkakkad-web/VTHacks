import type { ReactNode } from "react";

export function BottomSheet({
  children,
  className = "",
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section className={`sc-sheet ${className}`} aria-labelledby={labelledBy}>
      <div className="sc-sheet-handle" aria-hidden="true" />
      <div className="sc-sheet-content">{children}</div>
    </section>
  );
}
