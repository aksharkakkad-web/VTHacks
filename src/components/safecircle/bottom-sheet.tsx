import type { ReactNode } from "react";

export function BottomSheet({ children, className = "", labelledBy, testId }: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  testId?: string;
}) {
  return (
    <section className={`sc-sheet ${className}`} aria-labelledby={labelledBy} data-testid={testId}>
      <div className="sc-sheet-content">{children}</div>
    </section>
  );
}
