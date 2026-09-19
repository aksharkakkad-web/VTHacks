import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };

export function PrimaryButton({ children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`sc-button sc-button-primary ${className}`} {...props}>
      <span>{children}</span>
      <span className="sc-button-icon" aria-hidden="true"><ArrowRight size={20} /></span>
    </button>
  );
}

export function SecondaryButton({ children, className = "", ...props }: ButtonProps) {
  return <button className={`sc-button sc-button-secondary ${className}`} {...props}>{children}</button>;
}

export function TextButton({ children, className = "", ...props }: ButtonProps) {
  return <button className={`sc-text-button ${className}`} {...props}>{children}</button>;
}

export function IconButton({ children, className = "", ...props }: ButtonProps) {
  return <button className={`sc-icon-button ${className}`} {...props}>{children}</button>;
}

export function VerificationBadge({ label = "Verified provider" }: { label?: string }) {
  return <span className="sc-verification-badge"><ShieldCheck size={15} />{label}</span>;
}

export function StatusMark({ state }: { state: "done" | "active" | "pending" | "failed" }) {
  if (state === "done") return <span className="sc-status-mark is-done" aria-label="Complete"><Check size={14} /></span>;
  return <span className={`sc-status-mark is-${state}`} aria-label={state === "active" ? "In progress" : state === "failed" ? "Failed" : "Pending"} />;
}

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`sc-brand-mark${small ? " is-small" : ""}`} aria-hidden="true">
      <span className="sc-brand-orbit" />
      <span className="sc-brand-core" />
    </span>
  );
}
