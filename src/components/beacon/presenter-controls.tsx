"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClockAlert,
  LoaderCircle,
} from "lucide-react";
import styles from "./presenter-controls.module.css";

function cx(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export type PresenterTimelineControlsProps = {
  /** Short name for the screen currently being presented. */
  currentStageLabel: string;
  /** Optional name of the stage reached by Back. */
  previousLabel?: string;
  /** Optional name of the stage reached by Next. */
  nextLabel?: string;
  onBack: () => void;
  onNext: () => void;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  /** Identifies the action that is currently resolving. Both controls pause while busy. */
  busyAction?: "back" | "next" | null;
  className?: string;
  ariaLabel?: string;
};

export function PresenterTimelineControls({
  currentStageLabel,
  previousLabel,
  nextLabel,
  onBack,
  onNext,
  backDisabled = false,
  nextDisabled = false,
  busyAction = null,
  className,
  ariaLabel = "Presenter timeline",
}: PresenterTimelineControlsProps) {
  const isBusy = busyAction !== null;
  const backAccessibleLabel = previousLabel ? `Back to ${previousLabel}` : "Back";
  const nextAccessibleLabel = nextLabel ? `Next: ${nextLabel}` : "Next";

  return (
    <nav
      className={cx(styles.timeline, className)}
      aria-label={ariaLabel}
      aria-busy={isBusy}
    >
      <button
        className={cx(styles.timelineButton, styles.backButton)}
        type="button"
        onClick={onBack}
        disabled={backDisabled || isBusy}
        aria-label={backAccessibleLabel}
      >
        <span className={styles.arrowDisc} aria-hidden="true">
          {busyAction === "back" ? (
            <LoaderCircle className={styles.spinner} size={18} />
          ) : (
            <ArrowLeft size={18} />
          )}
        </span>
        <span className={styles.buttonCopy}>
          <span className={styles.buttonVerb}>
            {busyAction === "back" ? "Loading" : "Back"}
          </span>
          {previousLabel ? (
            <span className={styles.stageHint}>{previousLabel}</span>
          ) : null}
        </span>
      </button>

      <div className={styles.currentStage} aria-live="polite" aria-atomic="true">
        <span className={styles.currentEyebrow}>Current stage</span>
        <strong>{currentStageLabel}</strong>
      </div>

      <button
        className={cx(styles.timelineButton, styles.nextButton)}
        type="button"
        onClick={onNext}
        disabled={nextDisabled || isBusy}
        aria-label={nextAccessibleLabel}
      >
        <span className={styles.buttonCopy}>
          <span className={styles.buttonVerb}>
            {busyAction === "next" ? "Loading" : "Next"}
          </span>
          {nextLabel ? <span className={styles.stageHint}>{nextLabel}</span> : null}
        </span>
        <span className={styles.arrowDisc} aria-hidden="true">
          {busyAction === "next" ? (
            <LoaderCircle className={styles.spinner} size={18} />
          ) : (
            <ArrowRight size={18} />
          )}
        </span>
      </button>
    </nav>
  );
}

export type ArrivalCase = "confirm-arrival" | "destination-not-reached";

export type ArrivalCaseChooserProps = {
  onChoose: (arrivalCase: ArrivalCase) => void;
  disabled?: boolean;
  busyCase?: ArrivalCase | null;
  className?: string;
  title?: string;
  description?: ReactNode;
  /** Overrides the heading id when more than one chooser can exist on a page. */
  headingId?: string;
};

export function ArrivalCaseChooser({
  onChoose,
  disabled = false,
  busyCase = null,
  className,
  title = "Choose the arrival outcome",
  description = "Use one of these paths to continue the presenter walkthrough.",
  headingId = "beacon-arrival-case-title",
}: ArrivalCaseChooserProps) {
  const isBusy = busyCase !== null;

  return (
    <section
      className={cx(styles.caseChooser, className)}
      aria-labelledby={headingId}
      aria-busy={isBusy}
    >
      <span className={styles.sheetHandle} aria-hidden="true" />
      <div className={styles.caseHeader}>
        <span className={styles.presenterLabel}>Presenter walkthrough</span>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>

      <div className={styles.caseActions}>
        <CaseAction
          caseNumber="Case 1"
          title={busyCase === "confirm-arrival" ? "Confirming arrival…" : "Confirm arrival"}
          detail="Completes the journey and closes temporary trip access."
          icon={
            busyCase === "confirm-arrival" ? (
              <LoaderCircle className={styles.spinner} size={20} />
            ) : (
              <Check size={20} />
            )
          }
          onClick={() => onChoose("confirm-arrival")}
          disabled={disabled || isBusy}
          variant="confirmed"
        />

        <CaseAction
          caseNumber="Case 2"
          title={
            busyCase === "destination-not-reached"
              ? "Starting overdue flow…"
              : "Destination not reached"
          }
          detail="Starts the overdue/contact flow for a guided demo of follow-up steps."
          icon={
            busyCase === "destination-not-reached" ? (
              <LoaderCircle className={styles.spinner} size={20} />
            ) : (
              <ClockAlert size={20} />
            )
          }
          onClick={() => onChoose("destination-not-reached")}
          disabled={disabled || isBusy}
          variant="overdue"
        />
      </div>

      <p className={styles.caseNote}>
        Case 2 starts the overdue/contact flow; it does not trigger emergency dispatch.
      </p>
    </section>
  );
}

function CaseAction({
  caseNumber,
  title,
  detail,
  icon,
  onClick,
  disabled,
  variant,
}: {
  caseNumber: string;
  title: string;
  detail: string;
  icon: ReactNode;
  onClick: () => void;
  disabled: boolean;
  variant: "confirmed" | "overdue";
}) {
  return (
    <button
      className={styles.caseAction}
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
    >
      <span className={styles.caseIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.caseCopy}>
        <span className={styles.caseNumber}>{caseNumber}</span>
        <strong>{title}</strong>
        <span className={styles.caseDetail}>{detail}</span>
      </span>
      <ArrowRight className={styles.caseArrow} size={19} aria-hidden="true" />
    </button>
  );
}
