"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle, Check, MapPin, Phone, ShieldCheck, X } from "lucide-react";
import type {
  DemoAction,
  DemoViewModel,
  SavedProfile,
  TripContext,
} from "@/components/safecircle/types";
import { validatedProfile } from "@/components/safecircle/demo-controller";
import styles from "./journey-screens.module.css";

type OpenProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function JourneySheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: OpenProps & {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.dialogBackdrop} />
        <Dialog.Viewport className={styles.dialogViewport}>
          <Dialog.Popup className={styles.dialogPopup}>
            <span className={styles.dialogHandle} aria-hidden="true" />
            <Dialog.Close className={styles.dialogClose} aria-label={`Close ${title}`}>
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
            <Dialog.Title className={styles.dialogTitle}>{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className={styles.dialogDescription}>
                {description}
              </Dialog.Description>
            ) : null}
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CancelTripDialog({
  open,
  onOpenChange,
  model,
  onAction,
}: OpenProps & {
  model: DemoViewModel;
  onAction: (action: DemoAction) => void;
}) {
  const fee = model.backendDetails ? model.backendDetails.cancellationFee : model.cancellationFee;
  const submitted = !["not-required", "not-started", "cancelled"].includes(model.bookingStatus);

  function requestCancellation() {
    onOpenChange(false);
    onAction({ type: "REQUEST_CANCEL" } as DemoAction);
  }

  return (
    <JourneySheet
      open={open}
      onOpenChange={onOpenChange}
      title={submitted ? "Cancel this request?" : "Stop this trip request?"}
      description={submitted
        ? "Beacon must wait for the provider to confirm the cancellation."
        : "This trip request will stop. You can start a new search afterward."}
    >
      <div className={styles.consequenceCard}>
        <AlertTriangle size={22} aria-hidden="true" />
        <div>
          <strong>{fee === undefined ? "Cancellation fee unknown" : fee === 0 ? "$0 cancellation fee" : `$${fee.toFixed(2)} cancellation fee`}</strong>
          <span>{submitted
            ? "Do not start another booking until this attempt is resolved."
            : "No provider booking has been accepted yet."}</span>
        </div>
      </div>
      <div className={styles.dialogActions}>
        <button className={styles.dangerAction} type="button" onClick={requestCancellation}>
          {submitted ? "Request cancellation" : "Stop request"}
        </button>
        <Dialog.Close className={styles.secondaryAction}>Keep this trip</Dialog.Close>
      </div>
    </JourneySheet>
  );
}

export function ResetDemoDialog({ open, onOpenChange, onAction }: OpenProps & { onAction: (action: DemoAction) => void }) {
  return (
    <JourneySheet
      open={open}
      onOpenChange={onOpenChange}
      title="Reset this local demo?"
      description="Use this only when the saved demo session cannot be restored."
    >
      <div className={styles.consequenceCard}>
        <AlertTriangle size={22} aria-hidden="true" />
        <div>
          <strong>Only local simulation data is cleared</strong>
          <span>This cannot cancel, change, or confirm any live provider booking or payment.</span>
        </div>
      </div>
      <div className={styles.dialogActions}>
        <button className={styles.dangerAction} type="button" onClick={() => { onOpenChange(false); onAction({ type: "RESET_DEMO_TRIP" } as DemoAction); }}>Reset local demo</button>
        <Dialog.Close className={styles.secondaryAction}>Keep checking</Dialog.Close>
      </div>
    </JourneySheet>
  );
}

export function HelpSheet({ open, onOpenChange, trustedContact }: OpenProps & { trustedContact?: string }) {
  return (
    <JourneySheet
      open={open}
      onOpenChange={onOpenChange}
      title="Get help"
      description="Beacon coordinates transportation. It is not an emergency service."
    >
      <div className={styles.helpActions}>
        <a className={styles.emergencyAction} href="tel:911"><Phone size={20} aria-hidden="true" /><span><strong>Call 911</strong><small>Immediate danger or medical emergency</small></span></a>
        <a className={styles.contactAction} href="tel:+15403824343"><Phone size={20} aria-hidden="true" /><span><strong>Virginia Tech Police</strong><small>Non-emergency dispatch · 540-382-4343</small></span></a>
        {trustedContact ? (
          <a className={styles.contactAction} href={`tel:${trustedContact}`}><Phone size={20} aria-hidden="true" /><span><strong>Call trusted contact</strong><small>{trustedContact}</small></span></a>
        ) : (
          <p className={styles.dialogNote}>No trusted contact is saved. Beacon does not automatically notify anyone.</p>
        )}
      </div>
    </JourneySheet>
  );
}

export function LocationSheet({ open, onOpenChange, onRetry }: OpenProps & { onRetry?: () => void }) {
  return (
    <JourneySheet
      open={open}
      onOpenChange={onOpenChange}
      title="Why Beacon needs location"
      description="Location permission is an optional test in this fixed demo."
    >
      <ul className={styles.plainList}>
        <li><MapPin size={19} aria-hidden="true" /><span><strong>Fixed pickup</strong> This demo always uses Downtown Blacksburg.</span></li>
        <li><ShieldCheck size={19} aria-hidden="true" /><span><strong>After approval</strong> Exact pickup can be shared only with a verified, authorized provider.</span></li>
        <li><Check size={19} aria-hidden="true" /><span><strong>After the trip</strong> Temporary provider access ends.</span></li>
      </ul>
      <p className={styles.dialogNote}>A permission test never changes or sends your pickup. Any coordinates returned by the browser are discarded.</p>
      <div className={styles.dialogActions}>
        {onRetry ? <button className={styles.primaryAction} type="button" onClick={() => { onOpenChange(false); onRetry(); }}>Test location permission</button> : null}
        <Dialog.Close className={styles.secondaryAction}>Use demo pickup</Dialog.Close>
      </div>
    </JourneySheet>
  );
}

function ProfileSheetForm({
  mode,
  profile,
  onSave,
}: {
  mode: "home" | "preferences" | "contact";
  profile: SavedProfile;
  onSave: (profile: SavedProfile) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [budgetText, setBudgetText] = useState(String(profile.maxBudget));
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emptyTelegram = mode === "contact" && !draft.telegramContact?.name.trim() && !draft.telegramContact?.chatId.trim();
    const candidate = { ...draft, ...(emptyTelegram ? { telegramContact: undefined } : {}), maxBudget: budgetText.trim() === "" ? Number.NaN : Number(budgetText) };
    const valid = validatedProfile(candidate);
    if (!valid) {
      setError(mode === "home"
        ? "Enter a home name from 2–60 characters and an address from 5–160 characters."
        : mode === "contact"
          ? "Enter a contact name and the positive numeric ID from a private Telegram chat, or leave both blank."
          : "Enter a whole-dollar budget from 0–100 and keep all profile fields valid.");
      return;
    }
    setError("");
    onSave(valid);
  }

  return (
    <form className={styles.dialogForm} onSubmit={submit}>
      {mode === "home" ? (
        <>
          <label><span>Home name</span><input value={draft.homeName} maxLength={60} required onChange={(event) => setDraft({ ...draft, homeName: event.target.value })} /></label>
          <label><span>Home address</span><input value={draft.homeAddress} maxLength={160} required onChange={(event) => setDraft({ ...draft, homeAddress: event.target.value })} /></label>
          <p className={styles.fieldNote}>Use a residence hall or address you recognize. This demo does not validate map coordinates.</p>
        </>
      ) : null}
      {mode === "preferences" ? (
        <>
          <label><span>Maximum budget</span><input type="number" min={0} max={100} step={1} value={budgetText} required onChange={(event) => setBudgetText(event.target.value)} /></label>
          <fieldset><legend>Walking</legend><label className={styles.choiceLine}><input type="radio" name="walking" checked={draft.walkingPreference === "minimal"} onChange={() => setDraft({ ...draft, walkingPreference: "minimal" })} /> Less walking</label><label className={styles.choiceLine}><input type="radio" name="walking" checked={draft.walkingPreference === "normal"} onChange={() => setDraft({ ...draft, walkingPreference: "normal" })} /> Standard walking</label></fieldset>
          <label className={styles.choiceLine}><input type="checkbox" checked={draft.avoidTransfers} onChange={(event) => setDraft({ ...draft, avoidTransfers: event.target.checked })} /> Prefer fewer transfers</label>
        </>
      ) : null}
      {mode === "contact" ? (
        <>
          <label><span>Contact name</span><input value={draft.telegramContact?.name ?? ""} maxLength={80} placeholder="Maya" onChange={(event) => setDraft({ ...draft, telegramContact: { name: event.target.value, chatId: draft.telegramContact?.chatId ?? "", consent: draft.telegramContact?.consent ?? false, shareLocation: draft.telegramContact?.shareLocation ?? false } })} /></label>
          <label><span>Telegram private chat ID</span><input inputMode="numeric" pattern="[0-9]*" value={draft.telegramContact?.chatId ?? ""} maxLength={16} placeholder="123456789" onChange={(event) => setDraft({ ...draft, telegramContact: { name: draft.telegramContact?.name ?? "", chatId: event.target.value, consent: draft.telegramContact?.consent ?? false, shareLocation: draft.telegramContact?.shareLocation ?? false } })} /></label>
          <label className={styles.choiceLine}><input type="checkbox" checked={draft.telegramContact?.consent ?? false} onChange={(event) => setDraft({ ...draft, telegramContact: { name: draft.telegramContact?.name ?? "", chatId: draft.telegramContact?.chatId ?? "", consent: event.target.checked, shareLocation: draft.telegramContact?.shareLocation ?? false } })} /> Allow Beacon to message this contact if an arrival check is missed</label>
          <label className={styles.choiceLine}><input type="checkbox" checked={draft.telegramContact?.shareLocation ?? false} onChange={(event) => setDraft({ ...draft, telegramContact: { name: draft.telegramContact?.name ?? "", chatId: draft.telegramContact?.chatId ?? "", consent: draft.telegramContact?.consent ?? false, shareLocation: event.target.checked } })} /> Include the last location Beacon received</label>
          <p className={styles.fieldNote}>The contact must first press Start in the approved Beacon bot. This private ID is sent only to Beacon’s server and never to a transport provider.</p>
        </>
      ) : null}
      {error ? <p className={styles.formError} role="alert">{error}</p> : null}
      <button className={styles.primaryAction} type="submit">Save changes</button>
    </form>
  );
}

export function EditHomeSheet({ open, onOpenChange, profile, onSave }: OpenProps & { profile: SavedProfile; onSave: (profile: SavedProfile) => void }) {
  return <JourneySheet open={open} onOpenChange={onOpenChange} title="Edit home"><ProfileSheetForm key={`${open}-${profile.homeAddress}`} mode="home" profile={profile} onSave={(next) => { onSave(next); onOpenChange(false); }} /></JourneySheet>;
}

export function EditPreferencesSheet({ open, onOpenChange, profile, onSave, onTrustedContact }: OpenProps & { profile: SavedProfile; onSave: (profile: SavedProfile) => void; onTrustedContact?: () => void }) {
  return <JourneySheet open={open} onOpenChange={onOpenChange} title="Trip preferences" description="Changes apply to your next search."><ProfileSheetForm key={`${open}-${profile.maxBudget}-${profile.walkingPreference}-${profile.avoidTransfers}`} mode="preferences" profile={profile} onSave={(next) => { onSave(next); onOpenChange(false); }} />{onTrustedContact ? <button className={styles.textAction} type="button" onClick={() => { onOpenChange(false); onTrustedContact(); }}>Trusted contact</button> : null}</JourneySheet>;
}

export function TrustedContactSheet({ open, onOpenChange, profile, onSave }: OpenProps & { profile: SavedProfile; onSave: (profile: SavedProfile) => void }) {
  return <JourneySheet open={open} onOpenChange={onOpenChange} title="Trusted contact" description="Optional Telegram missed-arrival alert"><ProfileSheetForm key={`${open}-${profile.telegramContact?.chatId ?? ""}`} mode="contact" profile={profile} onSave={(next) => { onSave(next); onOpenChange(false); }} /></JourneySheet>;
}

export function TripContextSheet({ open, onOpenChange, current, onApply, onClear }: OpenProps & { current: TripContext; onApply: (context: TripContext) => void; onClear: () => void }) {
  const [note, setNote] = useState<TripContext["note"]>(current.note ?? "none");
  return (
    <JourneySheet open={open} onOpenChange={onOpenChange} title="For this trip" description="Temporary needs clear when the trip ends.">
      <div className={styles.contextChoices}>
        <button type="button" aria-pressed={note === "tired"} onClick={() => setNote(note === "tired" ? "none" : "tired")}>I’m tired</button>
        <button type="button" aria-pressed={note === "drinking"} onClick={() => setNote(note === "drinking" ? "none" : "drinking")}>I’ve been drinking</button>
      </div>
      <p className={styles.dialogNote}>Beacon uses this only to prefer less walking and fewer transfers. It does not assess impairment.</p>
      <div className={styles.dialogActions}>
        <button className={styles.primaryAction} type="button" onClick={() => { onApply(note === "none" ? {} : { note }); onOpenChange(false); }}>Apply to this trip</button>
        <button className={styles.secondaryAction} type="button" onClick={() => { onClear(); onOpenChange(false); }}>Clear trip needs</button>
      </div>
    </JourneySheet>
  );
}

export function TripDetailsSheet({ open, onOpenChange, model }: OpenProps & { model: DemoViewModel }) {
  const backend = model.backendDetails;
  const mode = model.selectedPlan?.mode;
  const providerTrip = mode !== undefined && mode !== "walk" && mode !== "transit";
  const source = mode === "walk"
    ? backend ? "Walking plan" : "Walking plan · Demo data"
    : mode === "transit"
      ? backend ? "Scheduled transit" : "Scheduled transit · Demo data"
      : providerTrip
        ? backend?.simulated === false ? "Ride provider" : "Simulated rideshare · Demo data"
        : "Source unavailable";
  return (
    <JourneySheet open={open} onOpenChange={onOpenChange} title="Trip details" description="Latest information supplied to Beacon.">
      <dl className={styles.detailList}>
        <div><dt>Plan</dt><dd>{model.selectedPlan?.providerName ?? "Unavailable"}</dd></div>
        <div><dt>Source</dt><dd>{source}</dd></div>
        {backend?.operatorName ? <div><dt>Operator</dt><dd>{backend.operatorName}</dd></div> : null}
        {backend?.operatorVerification ? <div><dt>Verification</dt><dd>{backend.operatorVerification === "ans_verified" ? "ANS verified" : backend.operatorVerification === "local_demo" ? "Local demo verification" : "Not verified"}</dd></div> : null}
        {backend?.quoteId ? <div><dt>Quote</dt><dd>Bound to this offer</dd></div> : null}
        {backend?.destinationName ? <div><dt>Destination</dt><dd>{backend.destinationName}</dd></div> : null}
        {backend?.expectedArrivalAt ? <div><dt>Expected arrival</dt><dd>{new Intl.DateTimeFormat("en-US", {hour:"numeric", minute:"2-digit"}).format(new Date(backend.expectedArrivalAt))} · plan estimate</dd></div> : null}
        {backend?.payments?.map((payment,index)=><div key={index}><dt>Payment {index+1}</dt><dd>{payment.state} · ${payment.amount.toFixed(2)} · ${payment.retained.toFixed(2)} retained · simulated</dd></div>)}
        {backend ? <div><dt>Contact notification</dt><dd>{backend.notificationState === "sent" ? "Accepted by Telegram" : backend.notificationState === "simulated" ? "Demo only · no message sent" : backend.notificationState === "sending" ? "Sending" : backend.notificationState === "uncertain" ? "Delivery unconfirmed" : backend.notificationState === "failed" ? "Not sent" : "No notification reported"}</dd></div> : null}
        {providerTrip ? <div><dt>Booking</dt><dd>{model.bookingStatus.replaceAll("-", " ")}</dd></div> : null}
        {providerTrip ? <div><dt>Payment</dt><dd>{model.paymentStatus.replaceAll("-", " ")} · simulated</dd></div> : null}
        {providerTrip ? <div><dt>Location sharing</dt><dd>{model.sensitiveDataReleased ? "Authorized for this active trip" : "Exact location withheld"}</dd></div> : null}
        {providerTrip ? <div><dt>Attempt</dt><dd>{model.attemptId ?? "Not reported"}</dd></div> : null}
      </dl>
    </JourneySheet>
  );
}
