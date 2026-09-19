import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function PrimaryButton({ children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`sc-button sc-button-primary ${className}`} {...props}>
      <span>{children}</span>
      <span className="sc-button-icon" aria-hidden="true">
        <ArrowRight size={19} strokeWidth={2.2} />
      </span>
    </button>
  );
}

export function SecondaryButton({ children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`sc-button sc-button-secondary ${className}`} {...props}>
      {children}
    </button>
  );
}

export function IconButton({ children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`sc-icon-button ${className}`} {...props}>
      {children}
    </button>
  );
}

export function VerificationBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`sc-verification-badge${compact ? " is-compact" : ""}`}>
      <ShieldCheck size={compact ? 13 : 15} strokeWidth={2.25} />
      {compact ? "Verified" : "ANS verified"}
    </span>
  );
}

export function StatusCheck({ tone = "mint" }: { tone?: "mint" | "amber" }) {
  return (
    <span className={`sc-status-check is-${tone}`} aria-hidden="true">
      <Check size={13} strokeWidth={2.8} />
    </span>
  );
}

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`sc-brand-mark${small ? " is-small" : ""}`} aria-hidden="true">
      <span className="sc-brand-orbit" />
      <span className="sc-brand-core" />
    </span>
  );
}
