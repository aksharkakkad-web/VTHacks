"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, BusFront, Footprints, LockKeyhole, MapPin, Phone, ShieldCheck, X } from "lucide-react";
import type { DemoAction, DemoViewModel, SavedProfile, TripContext } from "./types";
import { PrimaryButton } from "./primitives";
import { TechnicalPanel } from "./technical-panel";

function isValidOptionalPhone(value: string) {
  if (!value) return true;
  const digits = value.replace(/\D/g, "");
  return /^\+?[\d().\s-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
}

export function AppDialog({ open, onOpenChange, title, description, children, wide = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="sc-dialog-backdrop" />
        <Dialog.Viewport className="sc-dialog-viewport">
          <Dialog.Popup className={`sc-dialog-popup${wide ? " is-wide" : ""}`}>
            <div className="sc-dialog-header"><div><Dialog.Title className="sc-dialog-title">{title}</Dialog.Title>{description && <Dialog.Description className="sc-dialog-description">{description}</Dialog.Description>}</div><Dialog.Close className="sc-dialog-close" aria-label={`Close ${title}`}><X size={20} /></Dialog.Close></div>
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ProfileDialog({ open, onOpenChange, profile, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; profile: SavedProfile; onSave: (profile: SavedProfile) => void }) {
  return <ProfileDialogContent key={`${open}-${profile.homeName}-${profile.homeAddress}-${profile.maxBudget}-${profile.walkingPreference}-${profile.avoidTransfers}`} open={open} onOpenChange={onOpenChange} profile={profile} onSave={onSave} />;
}

function ProfileDialogContent({ open, onOpenChange, profile, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; profile: SavedProfile; onSave: (profile: SavedProfile) => void }) {
  const [draft, setDraft] = useState(profile);
  const contactValid = isValidOptionalPhone(draft.trustedContact ?? "");
  const valid = draft.homeName.trim().length >= 2 && draft.homeAddress.trim().length >= 5 && Number.isFinite(draft.maxBudget) && draft.maxBudget >= 0 && draft.maxBudget <= 100 && contactValid;
  function submit(event: FormEvent) { event.preventDefault(); if (!valid) return; onSave({ ...draft, homeName: draft.homeName.trim(), homeAddress: draft.homeAddress.trim() }); onOpenChange(false); }
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Home and preferences" description="Used for recommendations in this interactive demo.">
      <form className="sc-form sc-dialog-form" onSubmit={submit}>
        <label><span>Place name</span><input value={draft.homeName} onChange={(event) => setDraft({ ...draft, homeName: event.target.value })} /></label>
        <label><span>Campus address</span><input value={draft.homeAddress} onChange={(event) => setDraft({ ...draft, homeAddress: event.target.value })} /></label>
        <label><span>Maximum trip cost</span><div className="sc-money-input"><span>$</span><input type="number" min="0" max="100" value={draft.maxBudget} onChange={(event) => setDraft({ ...draft, maxBudget: Number(event.target.value) })} /></div></label>
        <fieldset className="sc-choice-field"><legend>Walking preference</legend><div className="sc-choice-row"><label><input type="radio" checked={draft.walkingPreference === "minimal"} onChange={() => setDraft({ ...draft, walkingPreference: "minimal" })} /><span>Minimal</span></label><label><input type="radio" checked={draft.walkingPreference === "normal"} onChange={() => setDraft({ ...draft, walkingPreference: "normal" })} /><span>Normal</span></label></div></fieldset>
        <label className="sc-check-row"><input type="checkbox" checked={draft.avoidTransfers} onChange={(event) => setDraft({ ...draft, avoidTransfers: event.target.checked })} /><span><strong>Avoid transfers</strong><small>Prefer one continuous ride</small></span></label>
        <label><span>Trusted contact phone (optional)</span><input type="tel" inputMode="tel" autoComplete="tel" value={draft.trustedContact ?? ""} onChange={(event) => setDraft({ ...draft, trustedContact: event.target.value })} placeholder="(540) 555-0142" aria-invalid={!contactValid} />{!contactValid && <small className="sc-inline-error">Enter a valid phone number.</small>}</label>
        <PrimaryButton type="submit" disabled={!valid}>SAVE CHANGES</PrimaryButton>
      </form>
    </AppDialog>
  );
}

export function ContextDialog({ open, onOpenChange, current, onApply, onClear }: { open: boolean; onOpenChange: (open: boolean) => void; current: TripContext; onApply: (context: TripContext) => void; onClear: () => void }) {
  return <ContextDialogContent key={`${open}-${current.maxBudget ?? "saved"}-${current.note ?? "none"}`} open={open} onOpenChange={onOpenChange} current={current} onApply={onApply} onClear={onClear} />;
}

function ContextDialogContent({ open, onOpenChange, current, onApply, onClear }: { open: boolean; onOpenChange: (open: boolean) => void; current: TripContext; onApply: (context: TripContext) => void; onClear: () => void }) {
  const [draft, setDraft] = useState<TripContext>(current);
  function apply(event: FormEvent) { event.preventDefault(); onApply(draft); onOpenChange(false); }
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Context for this trip" description="Temporary changes clear when this trip ends.">
      <form className="sc-form sc-dialog-form" onSubmit={apply}>
        <label><span>Budget override (optional)</span><div className="sc-money-input"><span>$</span><input type="number" min="0" max="100" value={draft.maxBudget ?? ""} onChange={(event) => setDraft({ ...draft, maxBudget: event.target.value ? Number(event.target.value) : undefined })} placeholder="Use saved budget" /></div></label>
        <fieldset className="sc-choice-field"><legend>How are you feeling?</legend><div className="sc-context-options"><label><input type="radio" name="note" checked={(draft.note ?? "none") === "none"} onChange={() => setDraft({ ...draft, note: "none" })} /><span>No change</span></label><label><input type="radio" name="note" checked={draft.note === "tired"} onChange={() => setDraft({ ...draft, note: "tired" })} /><span>I’m tired</span></label><label><input type="radio" name="note" checked={draft.note === "drinking"} onChange={() => setDraft({ ...draft, note: "drinking" })} /><span>I’ve been drinking</span></label></div></fieldset>
        <p className="sc-field-note">Tired or drinking context minimizes walking and avoids transfers. SafeCircle does not diagnose impairment.</p>
        <PrimaryButton type="submit">APPLY TO THIS TRIP</PrimaryButton>
        <button className="sc-dialog-text-action" type="button" onClick={() => { onClear(); onOpenChange(false); }}>Clear temporary context</button>
      </form>
    </AppDialog>
  );
}

export function HelpDialog({ open, onOpenChange, trustedContact }: { open: boolean; onOpenChange: (open: boolean) => void; trustedContact?: string }) {
  const contactHref = trustedContact ? `tel:${trustedContact.replace(/[^+\d]/g, "")}` : null;
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Get help" description="SafeCircle coordinates mobility. It is not emergency dispatch.">
      <div className="sc-help-list"><a href="tel:911"><Phone size={20} /><span><strong>Call 911</strong><small>Immediate danger or medical emergency</small></span><ArrowRight size={18} /></a><a href="tel:+15403824343"><ShieldCheck size={20} /><span><strong>Campus non-emergency assistance</strong><small>Virginia Tech Police dispatch</small></span><ArrowRight size={18} /></a>{contactHref && <a href={contactHref}><Phone size={20} /><span><strong>Call trusted contact</strong><small>{trustedContact}</small></span><ArrowRight size={18} /></a>}</div>
    </AppDialog>
  );
}

export function DetailsDialog({ open, onOpenChange, model }: { open: boolean; onOpenChange: (open: boolean) => void; model: DemoViewModel }) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Trip details" description="Your plan, destination and sharing status.">
      <div className="sc-consumer-details"><div><MapPin size={19} /><span><small>Destination</small><strong>{model.profile?.homeName} · {model.profile?.homeAddress}</strong></span></div>{model.selectedPlan && <div>{model.selectedPlan.mode === "walk" ? <Footprints size={19} /> : <BusFront size={19} />}<span><small>{model.selectedPlan.mode === "walk" ? "Plan" : "Provider"}</small><strong>{model.selectedPlan.mode === "walk" ? "Walk home · $0.00" : `${model.selectedPlan.providerName} · $${model.selectedPlan.cost.toFixed(2)}`}</strong></span></div>}<div><Footprints size={19} /><span><small>Walking</small><strong>{model.selectedPlan?.walkingMinutes ?? 0} minute</strong></span></div><div><LockKeyhole size={19} /><span><small>Precise location</small><strong>{model.selectedPlan?.mode === "walk" ? "Not shared" : model.stage === "arrival" ? "Sharing ended" : model.sensitiveDataReleased ? "Shared with authorized provider" : "Withheld"}</strong></span></div></div>
    </AppDialog>
  );
}

export function TechnicalDialog({ open, onOpenChange, model, onAction }: { open: boolean; onOpenChange: (open: boolean) => void; model: DemoViewModel; onAction: (action: DemoAction) => void }) {
  return <AppDialog open={open} onOpenChange={onOpenChange} title="What SafeCircle did" description="Judge view · deterministic simulated events" wide><TechnicalPanel model={model} onAction={onAction} /></AppDialog>;
}
