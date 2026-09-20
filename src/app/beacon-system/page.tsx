import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Accessibility, Home, MapPin, WalletCards } from "lucide-react";
import {
  BeaconTheme,
  BrandLockup,
  CheckRow,
  ChoiceCard,
  NoteCallout,
  OnboardingShell,
  PrimaryButton,
  ProgressIndicator,
  SecondaryButton,
  TextButton,
  TextField,
  ToggleRow,
} from "@/components/beacon";
import styles from "./specimen.module.css";
import { IntegrationGallery } from "./integration-gallery";
import { BeaconGallery } from "./gallery-client";

export const metadata: Metadata = {
  title: "Beacon interface system",
  description: "Developer specimen for Beacon onboarding components.",
  robots: {
    index: false,
    follow: false,
  },
};

function FoundationNotes() {
  return (
    <aside className={styles.foundation} aria-label="Beacon design foundation">
      <BrandLockup />
      <div>
        <p className={styles.kicker}>Interface foundation</p>
        <h1>Quiet wayfinding for high-friction moments.</h1>
        <p className={styles.foundationCopy}>
          Instrument Sans, warm paper, quiet sage, and near-black actions. Muted green is
          reserved for trust, location, and route details—not decoration.
        </p>
      </div>

      <section className={styles.foundationSection}>
        <h2>Core palette</h2>
        <div className={styles.swatches}>
          <span className={styles.swatchPaper}>Paper</span>
          <span className={styles.swatchSage}>Sage</span>
          <span className={styles.swatchMint}>Mint</span>
          <span className={styles.swatchCharcoal}>Charcoal</span>
        </div>
      </section>

      <section className={styles.foundationSection}>
        <h2>Motion rule</h2>
        <p>Only state changes move, and every transition yields to reduced-motion settings.</p>
      </section>

      <section className={styles.foundationSection}>
        <h2>Progress</h2>
        <ProgressIndicator current={3} total={7} label="Foundation specimen · 3 of 7" />
      </section>
    </aside>
  );
}

export default function BeaconSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <BeaconTheme>
      <IntegrationGallery />
      <BeaconGallery />
      <section className={styles.specimenPage} aria-label="Beacon component foundation">
        <FoundationNotes />

        <main className={styles.previewArea}>
        <p className={styles.previewLabel}>Onboarding shell · 390 × 844 target</p>
        <div className={styles.phoneFrame}>
          <OnboardingShell
            currentStep={3}
            totalSteps={7}
            progressLabel="Step 3 of 7"
            footer={
              <>
                <PrimaryButton>Continue</PrimaryButton>
                <SecondaryButton>Save for later</SecondaryButton>
              </>
            }
          >
            <div className={styles.specimenIntro}>
              <p className={styles.kicker}>Component specimen</p>
              <h2>Make one choice at a time.</h2>
              <p>
                These are reusable states only. No account, permission, or trip behavior is
                connected on this route.
              </p>
            </div>

            <section className={styles.componentSection}>
              <h3>Fields</h3>
              <TextField
                id="specimen-home"
                label="Home destination"
                placeholder="Residence hall or address"
                hint="You can change this later."
                leading={<MapPin size={18} aria-hidden="true" />}
              />
              <TextField
                id="specimen-budget"
                label="Budget"
                defaultValue="$"
                error="Enter a maximum trip budget."
                inputMode="numeric"
                leading={<WalletCards size={18} aria-hidden="true" />}
              />
            </section>

            <fieldset className={styles.componentSection}>
              <legend>Choice cards</legend>
              <div className={styles.choiceStack}>
                <ChoiceCard
                  name="specimen-travel"
                  value="simple"
                  title="Simplest route"
                  description="Fewer transfers and handoffs"
                  meta="Selected"
                  icon={<Home size={19} aria-hidden="true" />}
                  defaultChecked
                />
                <ChoiceCard
                  name="specimen-travel"
                  value="accessible"
                  title="Minimize walking"
                  description="Favor closer pickup points"
                  icon={<Accessibility size={19} aria-hidden="true" />}
                />
                <ChoiceCard
                  name="specimen-travel"
                  value="disabled"
                  title="Unavailable option"
                  description="Disabled state"
                  disabled
                />
              </div>
            </fieldset>

            <section className={styles.componentSection}>
              <h3>Rows</h3>
              <div className={styles.rowGroup}>
                <ToggleRow
                  title="Minimize transfers"
                  description="Keep the route easy to follow"
                  defaultChecked
                />
                <CheckRow
                  title="Step-free access"
                  description="Prefer accessible pickup and drop-off"
                />
                <CheckRow title="Disabled row" disabled />
              </div>
            </section>

            <section className={styles.componentSection}>
              <h3>Callouts</h3>
              <div className={styles.calloutStack}>
                <NoteCallout title="Your location stays private">
                  Precise location is shared only after you confirm a provider that Beacon verifies and authorizes for this trip.
                </NoteCallout>
                <NoteCallout title="Small note" tone="note">
                  Supporting information stays quiet and close to the decision it explains.
                </NoteCallout>
              </div>
            </section>

            <section className={styles.componentSection}>
              <h3>Button states</h3>
              <div className={styles.buttonStack}>
                <PrimaryButton disabled>Primary disabled</PrimaryButton>
                <TextButton>Text action</TextButton>
              </div>
            </section>
          </OnboardingShell>
        </div>
        </main>
      </section>
    </BeaconTheme>
  );
}
