import Image from "next/image";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleHelp,
  Info,
  LockKeyhole,
} from "lucide-react";
import styles from "./beacon-system.module.css";

function cx(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function BeaconTheme({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx(styles.theme, className)}>{children}</div>;
}

export function BrandLockup({
  className,
  label = "Beacon",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span className={cx(styles.brandLockup, className)} aria-label={label}>
      <span className={styles.brandMark} aria-hidden="true">
        <Image
          className={styles.brandSource}
          src="/beacon_logo_animation_clean_upward_pop.webp"
          alt=""
          width={1035}
          height={990}
          unoptimized
        />
      </span>
      <span className={styles.brandWord}>{label}</span>
    </span>
  );
}

export function ProgressIndicator({
  current,
  total,
  label = `Step ${current} of ${total}`,
}: {
  current: number;
  total: number;
  label?: string;
}) {
  const safeTotal = Math.max(total, 1);
  const safeCurrent = Math.min(Math.max(current, 0), safeTotal);
  const progressStyle = {
    "--beacon-progress": `${(safeCurrent / safeTotal) * 100}%`,
  } as CSSProperties;

  return (
    <div className={styles.progressGroup}>
      <span className={styles.progressLabel}>{label}</span>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-valuenow={safeCurrent}
        style={progressStyle}
      >
        <span className={styles.progressFill} />
      </div>
    </div>
  );
}

type OnboardingShellProps = {
  children: ReactNode;
  footer?: ReactNode;
  currentStep?: number;
  totalSteps?: number;
  progressLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  headerAction?: ReactNode;
  className?: string;
};

export function OnboardingShell({
  children,
  footer,
  currentStep,
  totalSteps,
  progressLabel,
  onBack,
  backLabel = "Go back",
  headerAction,
  className,
}: OnboardingShellProps) {
  const showProgress = currentStep !== undefined && totalSteps !== undefined;

  return (
    <section className={cx(styles.theme, styles.onboardingShell, className)}>
      <header className={styles.shellHeader}>
        <div className={styles.shellTopbar}>
          <div className={styles.shellLeading}>
            {onBack ? (
              <button
                className={styles.backButton}
                type="button"
                onClick={onBack}
                aria-label={backLabel}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
            ) : (
              <BrandLockup />
            )}
          </div>
          {onBack ? <BrandLockup /> : <span />}
          <div className={styles.shellTrailing}>{headerAction}</div>
        </div>
        {showProgress ? (
          <ProgressIndicator
            current={currentStep}
            total={totalSteps}
            label={progressLabel}
          />
        ) : null}
      </header>
      <div className={styles.shellContent}>{children}</div>
      {footer ? <footer className={styles.shellFooter}>{footer}</footer> : null}
    </section>
  );
}

type BeaconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
};

export function PrimaryButton({
  children,
  className,
  fullWidth = true,
  type = "button",
  ...props
}: BeaconButtonProps) {
  return (
    <button
      className={cx(styles.button, styles.primaryButton, fullWidth && styles.fullWidth, className)}
      type={type}
      {...props}
    >
      <span>{children}</span>
      <span className={styles.buttonEnd} aria-hidden="true">
        <ArrowRight size={19} />
      </span>
    </button>
  );
}

export function SecondaryButton({
  children,
  className,
  fullWidth = true,
  type = "button",
  ...props
}: BeaconButtonProps) {
  return (
    <button
      className={cx(styles.button, styles.secondaryButton, fullWidth && styles.fullWidth, className)}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextButton({
  children,
  className,
  fullWidth = false,
  type = "button",
  ...props
}: BeaconButtonProps) {
  return (
    <button
      className={cx(styles.textButton, fullWidth && styles.fullWidth, className)}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
};

export function TextField({
  id,
  label,
  hint,
  error,
  leading,
  className,
  ...inputProps
}: TextFieldProps) {
  const helpId = hint || error ? `${id}-help` : undefined;

  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      <div className={cx(styles.inputFrame, error && styles.inputFrameError)}>
        {leading ? <span className={styles.inputLeading}>{leading}</span> : null}
        <input
          id={id}
          className={styles.input}
          aria-describedby={helpId}
          aria-invalid={error ? true : undefined}
          {...inputProps}
        />
      </div>
      {error ? (
        <span className={styles.fieldError} id={helpId} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={styles.fieldHint} id={helpId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

type ChoiceCardProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "type" | "title"
> & {
  type?: "radio" | "checkbox";
  title: string;
  description?: string;
  icon?: ReactNode;
  meta?: string;
};

export function ChoiceCard({
  type = "radio",
  title,
  description,
  icon,
  meta,
  className,
  ...inputProps
}: ChoiceCardProps) {
  return (
    <label className={cx(styles.choiceCard, className)}>
      <input className={styles.choiceInput} type={type} {...inputProps} />
      {icon ? <span className={styles.choiceIcon}>{icon}</span> : null}
      <span className={styles.choiceCopy}>
        <span className={styles.choiceTitle}>{title}</span>
        {description ? <span className={styles.choiceDescription}>{description}</span> : null}
      </span>
      {meta ? <span className={styles.choiceMeta}>{meta}</span> : null}
      <span className={styles.choiceControl} aria-hidden="true">
        <Check size={14} />
      </span>
    </label>
  );
}

type SelectionRowProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "type" | "title"
> & {
  title: string;
  description?: string;
};

export function CheckRow({
  title,
  description,
  className,
  ...inputProps
}: SelectionRowProps) {
  return (
    <label className={cx(styles.selectionRow, className)}>
      <input className={styles.nativeCheck} type="checkbox" {...inputProps} />
      <span className={styles.checkVisual} aria-hidden="true">
        <Check size={14} />
      </span>
      <span className={styles.rowCopy}>
        <span className={styles.rowTitle}>{title}</span>
        {description ? <span className={styles.rowDescription}>{description}</span> : null}
      </span>
    </label>
  );
}

export function ToggleRow({
  title,
  description,
  className,
  ...inputProps
}: SelectionRowProps) {
  return (
    <label className={cx(styles.selectionRow, className)}>
      <span className={styles.rowCopy}>
        <span className={styles.rowTitle}>{title}</span>
        {description ? <span className={styles.rowDescription}>{description}</span> : null}
      </span>
      <input className={styles.nativeToggle} type="checkbox" role="switch" {...inputProps} />
      <span className={styles.toggleVisual} aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

export function NoteCallout({
  title,
  children,
  tone = "privacy",
  className,
}: {
  title: string;
  children: ReactNode;
  tone?: "privacy" | "note" | "help";
  className?: string;
}) {
  const Icon = tone === "privacy" ? LockKeyhole : tone === "help" ? CircleHelp : Info;

  return (
    <aside className={cx(styles.callout, styles[`callout-${tone}`], className)}>
      <Icon className={styles.calloutIcon} size={19} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </aside>
  );
}
