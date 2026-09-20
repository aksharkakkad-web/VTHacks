"use client";

import { Dialog } from "@base-ui/react/dialog";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { readHomeDraft, saveHomeDraft } from "@/components/beacon/profile-storage";
import { validatedProfile } from "@/components/safecircle/demo-controller";
import { defaultProfile } from "@/components/safecircle/mock-data";
import { ArrowLeft, ArrowRight, ChevronRight, MapPin, X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import styles from "./home.module.css";

type HomeLocation = {
  name: string;
  address: string;
};

const DEMO_LOCATIONS: HomeLocation[] = [
  { name: "Pritchard Hall", address: "Virginia Tech, Blacksburg, VA" },
  { name: "Pritchard Hall Rd", address: "Blacksburg, VA" },
  { name: "Pritchard Hall (West)", address: "Virginia Tech, Blacksburg, VA" },
  { name: "Pritchard Hall Parking Lot", address: "Virginia Tech, Blacksburg, VA" },
];

export default function BeaconHomePage() {
  return (
    <Suspense fallback={<main className={styles.stage}><p role="status">Loading home setup…</p></main>}>
      <BeaconHomeContent />
    </Suspense>
  );
}

function BeaconHomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoMode = searchParams.get("demo") === "1";
  const presenterMode = searchParams.get("presenter") === "1";
  const demoQuery = `?demo=1${presenterMode ? "&presenter=1" : ""}`;
  const screenRef = useRef<HTMLElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedHome, setSelectedHome] = useState(DEMO_LOCATIONS[0]);
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [manualError, setManualError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    let savedLocation: HomeLocation | undefined;

    try {
      const parsedValue: unknown = readHomeDraft();
      if (!parsedValue || typeof parsedValue !== "object") return;

      const savedHome = parsedValue as Partial<{
        homeName: unknown;
        homeAddress: unknown;
      }>;
      const matchingDemoLocation = DEMO_LOCATIONS.find(
        (location) =>
          location.name === savedHome.homeName &&
          location.address === savedHome.homeAddress,
      );
      const validProfile = validatedProfile({
        ...defaultProfile,
        homeName: savedHome.homeName,
        homeAddress: savedHome.homeAddress,
      });
      savedLocation = matchingDemoLocation ?? (validProfile ? { name: validProfile.homeName, address: validProfile.homeAddress } : undefined);
    } catch {
      // Ignore unavailable or malformed session data and keep the safe default.
    }

    if (!savedLocation) return;

    const restoredLocation = savedLocation;
    const frameId = window.requestAnimationFrame(() => {
      setSelectedHome(restoredLocation);
      setSaveState("saved");
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredLocations = DEMO_LOCATIONS.filter((location) =>
    `${location.name} ${location.address}`.toLowerCase().includes(normalizedQuery),
  );

  function chooseHome(location: HomeLocation) {
    setSelectedHome(location);
    setSaveState("idle");
    setDialogOpen(false);
  }

  function useManualHome() {
    const valid = validatedProfile({
      ...defaultProfile,
      homeName: manualName,
      homeAddress: manualAddress,
    });
    if (!valid) {
      setManualError("Enter a home label from 2–60 characters and an address from 5–160 characters.");
      return;
    }
    setManualError("");
    chooseHome({ name: valid.homeName, address: valid.homeAddress });
  }

  function saveHome() {
    saveHomeDraft({ homeName: selectedHome.name, homeAddress: selectedHome.address });
    router.push(demoMode ? `/onboarding/preferences${demoQuery}` : "/onboarding/preferences");
  }

  return (
    <main className={styles.stage}>
      <section ref={screenRef} className={styles.screen} aria-labelledby="home-heading">
        <Link prefetch={false} className={styles.backButton} href={demoMode ? `/onboarding/welcome${demoQuery}` : "/onboarding/welcome"} aria-label="Back to welcome">
          <ArrowLeft aria-hidden="true" strokeWidth={2} />
        </Link>

        <Image
          className={styles.logo}
          src="/beacon-welcome-logo.webp"
          alt="Beacon"
          width={1254}
          height={1254}
          priority
          unoptimized
        />

        <div className={styles.progress} aria-label="Step 1 of 2">
          <div className={styles.progressBars} aria-hidden="true">
            <span className={styles.progressActive} />
            <span />
          </div>
          <p>Step 1 of 2</p>
        </div>

        <div className={styles.heading}>
          <h1 id="home-heading">Where is home?</h1>
          <p>Confirm your home location.</p>
        </div>

        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen} modal>
          <Dialog.Trigger className={styles.locationCard}>
            <span className={styles.pinBubble} aria-hidden="true">
              <MapPin size={23} fill="currentColor" strokeWidth={2.5} />
            </span>
            <span className={styles.locationCopy}>
              <strong>{selectedHome.name}</strong>
              <span>{selectedHome.address}</span>
            </span>
            <ChevronRight className={styles.cardChevron} aria-hidden="true" />
          </Dialog.Trigger>

          <div className={styles.mapWrap}>
            <Image
              className={styles.mapImage}
              src="/beacon-preferences/campus.png"
              alt=""
              fill
              sizes="(max-width: 500px) 86vw, 340px"
              priority
              unoptimized
            />
            <span className={styles.mapLabel}>Saved destination · directions appear when walking</span>
          </div>

          <Dialog.Trigger className={styles.changeButton}>Change location</Dialog.Trigger>

          <p className={styles.helper}>You can change this anytime.</p>

          <div className={styles.saveArea}>
            {saveState === "saved" && (
              <p className={styles.savedMessage} role="status">
                Home saved for this session.
              </p>
            )}
            {saveState === "error" && (
              <p className={styles.errorMessage} role="alert">
                Home could not be saved. Please try again.
              </p>
            )}
            <button className={styles.primaryAction} type="button" onClick={saveHome}>
              Set as home <ArrowRight aria-hidden="true" />
            </button>
          </div>

          <Dialog.Portal container={screenRef}>
            <Dialog.Backdrop className={styles.dialogBackdrop} />
            <Dialog.Viewport className={styles.dialogViewport}>
              <Dialog.Popup className={styles.dialogPopup}>
                <div className={styles.sheetHandle} aria-hidden="true" />
                <Dialog.Title className={styles.dialogTitle}>Choose home</Dialog.Title>
                <Dialog.Description className={styles.dialogDescription}>
                  Choose a sample destination or enter your own home below.
                </Dialog.Description>

                <div className={styles.searchField}>
                  <MapPin aria-hidden="true" size={21} fill="currentColor" strokeWidth={2.4} />
                  <label className="sr-only" htmlFor="home-location-search">
                    Search sample demo home locations
                  </label>
                  <input
                    id="home-location-search"
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search Pritchard Hall"
                    autoComplete="off"
                  />
                  {query && (
                    <button
                      className={styles.clearSearch}
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                    >
                      <X aria-hidden="true" size={17} strokeWidth={2.6} />
                    </button>
                  )}
                </div>

                <div className={styles.results} aria-label="Demo locations">
                  {filteredLocations.map((location) => (
                    <button
                      className={styles.result}
                      type="button"
                      key={`${location.name}-${location.address}`}
                      onClick={() => chooseHome(location)}
                    >
                      <span className={styles.resultPin} aria-hidden="true">
                        <MapPin size={20} fill="currentColor" strokeWidth={2.6} />
                      </span>
                      <span>
                        <strong>{location.name}</strong>
                        <small>{location.address}</small>
                      </span>
                    </button>
                  ))}
                  {filteredLocations.length === 0 && (
                    <p className={styles.noResults}>No demo locations match that search.</p>
                  )}
                </div>

                <section className={styles.manualEntry} aria-labelledby="manual-home-title">
                  <div>
                    <h2 id="manual-home-title">Enter home manually</h2>
                    <p>Saved only for this local demo.</p>
                  </div>
                  <div className={styles.manualFields}>
                    <label>
                      <span>Home label</span>
                      <input value={manualName} maxLength={60} placeholder="Residence hall or home" onChange={(event) => { setManualName(event.target.value); setManualError(""); }} />
                    </label>
                    <label>
                      <span>Address</span>
                      <input value={manualAddress} maxLength={160} placeholder="Street or campus address" onChange={(event) => { setManualAddress(event.target.value); setManualError(""); }} />
                    </label>
                  </div>
                  <p className={styles.demoDisclosure}>Trip simulations still start from the fixed Downtown Blacksburg demo pickup. Beacon does not calculate a real route to this address.</p>
                  {manualError ? <p className={styles.manualError} role="alert">{manualError}</p> : null}
                  <button className={styles.manualAction} type="button" onClick={useManualHome}>Use this typed home</button>
                </section>

                <Dialog.Close className={styles.sheetClose} aria-label="Close choose home">
                  <X aria-hidden="true" size={20} />
                </Dialog.Close>
              </Dialog.Popup>
            </Dialog.Viewport>
          </Dialog.Portal>
        </Dialog.Root>
      </section>
    </main>
  );
}
