"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  CarFront,
  Check,
  Clock3,
  House,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  type MobilityReadModel,
  type RideStatusReadModel,
  type RoutePoint,
  type WalkingRouteReadModel,
} from "@/lib/client/beacon/read-models";
import { routePoints } from "@/lib/client/beacon/route-geometry";
import { renderGoogleWalkingRoute } from "@/lib/client/beacon/google-map-renderer";
import { BeaconFrame } from "./flow-screens";
import styles from "./mobility-screens.module.css";

type MobilityScreenProps = {
  mobility: MobilityReadModel;
  onWalkComplete: () => void;
  onArrival: () => void;
  onHelp: () => void;
  onDetails: () => void;
  onCancel: () => void;
  onRetryRoute?: () => void;
  onBoard?: () => void;
  boardingLabel?: string;
  navigation?: { destination: string; googleMapsUrl: string; appleMapsUrl: string };
  rideExperience?: {
    state?: "active" | "overdue" | "home";
    providerName?: string;
    destination?: string;
    notificationState?: string;
    onStillTravelling?: () => void;
    onFinish?: () => void;
    presenterNext?: { label: string; onClick: () => void };
  };
};

type RideCopy = { eyebrow: string; title: string; body: string; tone: "progress" | "success" | "warning" };

function finitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function formatDuration(seconds: number | undefined) {
  if (!finitePositive(seconds)) return undefined;
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatDistance(meters: number | undefined) {
  if (!finitePositive(meters)) return undefined;
  return `${Math.round(meters).toLocaleString("en-US")} m`;
}

function formatTimestamp(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update time unavailable";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function routeSourceLabel(source: WalkingRouteReadModel["source"] | undefined) {
  if (source === "google-routes") return "Google Routes";
  if (source === "fixture") return "Contract fixture";
  return "Route source not confirmed";
}

function safeRoutePoints(route: WalkingRouteReadModel | undefined) {
  if (!route?.geometry) return [];
  try {
    return routePoints(route).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  } catch {
    return [];
  }
}

function walkCopy(purpose: MobilityReadModel["leg"]["purpose"]) {
  if (purpose === "pickup") return {
    eyebrow: "Walk to pickup",
    title: "Head to your pickup.",
    action: "I’m at pickup",
  };
  if (purpose === "transit-stop") return {
    eyebrow: "Walk to your stop",
    title: "Head to your stop.",
    action: "I’m at the stop",
  };
  return { eyebrow: "Walking home", title: "Walk home.", action: "I’m home" };
}

function walkStatusCopy(route: WalkingRouteReadModel | undefined) {
  const hasDirections = Boolean(route?.steps?.some((step) => step.instruction.trim().length > 0));
  if (!route || route.status === "unavailable") return "A walking route is unavailable. Use familiar, supported guidance.";
  if (route.status === "loading") return "Beacon is loading the supplied walking route.";
  if (route.source === "fixture") return route.status === "stale" ? "Route display example; not for navigation. This example may be out of date." : "Route display example; not for navigation.";
  if (route.status === "stale") return hasDirections ? "This route may be out of date. Review the written directions before continuing." : "This route may be out of date, and written directions are unavailable.";
  return hasDirections ? "Follow the supplied route and written directions." : "Route geometry was supplied. Turn-by-turn directions are unavailable.";
}

function rideCopy(ride: RideStatusReadModel | undefined): RideCopy {
  const hasPickup = Boolean(ride?.pickupLocation || ride?.meetingInstructions);
  const hasIdentity = Boolean(ride?.driver?.firstName || ride?.vehicle?.make || ride?.vehicle?.model || ride?.vehicle?.plate);
  switch (ride?.stage) {
    case "accepted":
    case "waiting":
      return { eyebrow: "Ride assigned", title: "Meet your ride.", body: hasPickup ? "Pickup details are ready." : "Pickup details are pending.", tone: "progress" };
    case "driver-assigned":
      return { eyebrow: "Driver assigned", title: "Meet your ride.", body: hasIdentity ? "Match the details before boarding." : "Vehicle details are pending.", tone: "progress" };
    case "approaching":
      return { eyebrow: "Approaching", title: "Your ride is close.", body: "Wait at the listed pickup point.", tone: "progress" };
    case "arrived":
      return { eyebrow: "At pickup", title: "Your ride is here.", body: hasIdentity ? "Match the vehicle before boarding." : "Vehicle details are pending.", tone: "progress" };
    case "riding":
      return { eyebrow: "In your ride", title: "On the way home.", body: "Beacon is following the latest provider update.", tone: "progress" };
    case "completed":
      return { eyebrow: "Ride complete", title: "Are you home?", body: "Confirm to end trip access.", tone: "success" };
    case "cancelled":
      return { eyebrow: "Ride cancelled", title: "This ride was cancelled.", body: "No active ride is being claimed.", tone: "warning" };
    default:
      return { eyebrow: "Ride status", title: "Checking your ride.", body: "Beacon is waiting for a confirmed provider update.", tone: "warning" };
  }
}

function FixtureRouteMap({ points }: { points: readonly RoutePoint[] }) {
  const projected = useMemo(() => {
    if (points.length === 0) return [];
    const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
    const longitudeScale = Math.cos((meanLat * Math.PI) / 180);
    const raw = points.map((point) => ({ x: point.lng * longitudeScale, y: -point.lat }));
    const minX = Math.min(...raw.map((point) => point.x));
    const maxX = Math.max(...raw.map((point) => point.x));
    const minY = Math.min(...raw.map((point) => point.y));
    const maxY = Math.max(...raw.map((point) => point.y));
    const width = maxX - minX;
    const height = maxY - minY;
    const scale = width === 0 && height === 0 ? 1 : Math.min(900 / Math.max(width, Number.EPSILON), 440 / Math.max(height, Number.EPSILON));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return raw.map((point) => ({ x: 500 + (point.x - centerX) * scale, y: 270 + (point.y - centerY) * scale }));
  }, [points]);

  if (projected.length === 0) return null;
  const first = projected[0];
  const last = projected[projected.length - 1];

  return (
    <div className={`${styles.mapSurface} ${styles.fixtureMap}`} data-testid="walking-route-map" role="img" aria-label="Contract example route geometry, not for navigation">
      <svg viewBox="0 0 1000 540" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <polyline points={projected.map((point) => `${point.x},${point.y}`).join(" ")} />
        <circle className={styles.fixtureStart} cx={first.x} cy={first.y} r="17" />
        <circle className={styles.fixtureEnd} cx={last.x} cy={last.y} r="22" />
      </svg>
      <span className={styles.mapLabel}>Contract example · not for navigation</span>
    </div>
  );
}

function GoogleRouteMap({ points, hasDirections }: { points: readonly RoutePoint[]; hasDirections: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"checking" | "rendered" | "sdk-missing" | "invalid-geometry">("checking");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const result = renderGoogleWalkingRoute(container, points);
    setState(result.status);
    return result.cleanup;
  }, [points]);

  return (
    <div className={styles.mapSurface}>
      <div ref={containerRef} className={styles.googleMap} data-testid={state === "rendered" ? "walking-route-map" : undefined} role="img" aria-label="Walking route supplied by Google Routes" />
      {state !== "rendered" ? (
        <div className={styles.mapFallback} role="status">
          <MapPin size={24} aria-hidden="true" />
          <strong>{state === "sdk-missing" ? "Map setup pending" : state === "invalid-geometry" ? "Map unavailable" : "Preparing map"}</strong>
          <span>{hasDirections ? "Use the written directions below." : "Turn-by-turn directions are unavailable."}</span>
        </div>
      ) : null}
      <span className={styles.mapLabel}>Google Maps</span>
    </div>
  );
}

function RouteVisual({ route, points }: { route: WalkingRouteReadModel | undefined; points: readonly RoutePoint[] }) {
  const hasDirections = Boolean(route?.steps?.some((step) => step.instruction.trim().length > 0));
  if (!route || route.status === "loading") {
    return (
      <div className={styles.routePlaceholder} role="status">
        <RefreshCw className={styles.spinner} size={24} aria-hidden="true" />
        <strong>{route?.status === "loading" ? "Loading route" : "Route unavailable"}</strong>
        <span>{route?.status === "loading" ? "Waiting for supplied route geometry." : "Written directions will appear when supplied."}</span>
        {route?.source === "google-routes" ? <small className={styles.googleAttribution}>Google Maps</small> : null}
      </div>
    );
  }
  if (points.length === 0 || route.status === "unavailable") {
    return (
      <div className={styles.routePlaceholder} role="status">
        <AlertCircle size={24} aria-hidden="true" />
        <strong>Route unavailable</strong>
        <span>Use familiar, supported guidance.</span>
        {route.source === "google-routes" ? <small className={styles.googleAttribution}>Google Maps</small> : null}
      </div>
    );
  }
  if (route.source === "google-routes") return <GoogleRouteMap points={points} hasDirections={hasDirections} />;
  if (route.source === "fixture") return <FixtureRouteMap points={points} />;
  return (
    <div className={styles.routePlaceholder} role="status">
      <AlertCircle size={24} aria-hidden="true" />
      <strong>Map unavailable</strong>
      <span>{hasDirections ? "Route source not confirmed. Use the written directions below." : "Route source and written directions are unavailable."}</span>
    </div>
  );
}

function RouteSummary({ route }: { route: WalkingRouteReadModel | undefined }) {
  const distance = formatDistance(route?.distanceMeters);
  const duration = formatDuration(route?.durationSeconds);
  if (!distance && !duration && !route?.originLabel && !route?.destinationLabel) return null;
  return (
    <dl className={styles.routeSummary}>
      {duration ? <div><dt>Walking time</dt><dd>{duration}</dd></div> : null}
      {distance ? <div><dt>Distance</dt><dd>{distance}</dd></div> : null}
      {route?.originLabel ? <div><dt>From</dt><dd>{route.originLabel}</dd></div> : null}
      {route?.destinationLabel ? <div><dt>To</dt><dd>{route.destinationLabel}</dd></div> : null}
    </dl>
  );
}

function Directions({ route }: { route: WalkingRouteReadModel | undefined }) {
  const steps = route?.steps?.filter((step) => step.instruction.trim().length > 0) ?? [];
  return (
    <section className={styles.directions} aria-labelledby="walking-directions-title">
      <div className={styles.sectionHeading}>
        <Navigation size={18} aria-hidden="true" />
        <h2 id="walking-directions-title">Walking directions</h2>
      </div>
      {steps.length ? (
        <ol>
          {steps.map((step, index) => (
            <li key={`${index}-${step.instruction}`}>
              <span>{index + 1}</span>
              <p><strong>{step.instruction}</strong>{formatDistance(step.distanceMeters) || formatDuration(step.durationSeconds) ? <small>{[formatDistance(step.distanceMeters), formatDuration(step.durationSeconds)].filter(Boolean).join(" · ")}</small> : null}</p>
            </li>
          ))}
        </ol>
      ) : <p className={styles.unavailableCopy}>Turn-by-turn directions unavailable.</p>}
    </section>
  );
}

function PrimaryAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className={styles.primaryAction} type="button" onClick={onClick}><span>{children}</span><ArrowRight size={21} aria-hidden="true" /></button>;
}

function UtilityActions({ onDetails, onHelp }: Pick<MobilityScreenProps, "onDetails" | "onHelp">) {
  return (
    <div className={styles.utilityRow}>
      <button className={styles.secondaryAction} type="button" onClick={onDetails}>View trip details</button>
      <button className={styles.secondaryAction} type="button" onClick={onHelp}>Get help</button>
    </div>
  );
}

function WalkingScreen(props: MobilityScreenProps) {
  const { mobility, onWalkComplete, onHelp, onDetails, onCancel, onRetryRoute } = props;
  const route = mobility.walkingRoute;
  const copy = walkCopy(mobility.leg.purpose);
  const points = useMemo(() => safeRoutePoints(route), [route]);
  const updatedAt = formatTimestamp(route?.updatedAt);
  const retryable = route?.status === "unavailable" || route?.status === "stale";

  return (
    <BeaconFrame>
      <div className={styles.screen} data-stage="mobility-walk" data-testid="walking-navigation">
        <header className={styles.intro} aria-live="polite">
          <p>{copy.eyebrow}</p>
          <h1 tabIndex={-1}>{copy.title}</h1>
          <span>{walkStatusCopy(route)}</span>
        </header>

        <RouteVisual route={route} points={points} />

        <div className={styles.content}>
          {route?.status === "stale" ? <p className={styles.warning}><Clock3 size={18} aria-hidden="true" /><span><strong>Route may be out of date.</strong> Retry before relying on it.</span></p> : null}
          {route?.warning ? <p className={styles.warning}><AlertCircle size={18} aria-hidden="true" /><span>{route.warning}</span></p> : null}
          <RouteSummary route={route} />
          <Directions route={route} />
          {props.navigation && <p className={styles.updateNote}>Open directions to {props.navigation.destination}: <a href={props.navigation.googleMapsUrl} target="_blank" rel="noopener noreferrer">Google Maps</a> · <a href={props.navigation.appleMapsUrl} target="_blank" rel="noopener noreferrer">Apple Maps</a>. The external app chooses its own path.</p>}
          <p className={styles.updateNote}>{routeSourceLabel(route?.source)} · {updatedAt ? `Updated ${updatedAt}` : "Update time not supplied"}</p>
        </div>

        <footer className={styles.footer}>
          <PrimaryAction onClick={onWalkComplete}>{copy.action}</PrimaryAction>
          {retryable && onRetryRoute ? <button className={styles.secondaryAction} type="button" onClick={onRetryRoute}>Retry route</button> : null}
          <UtilityActions onDetails={onDetails} onHelp={onHelp} />
          <button className={styles.cancelAction} type="button" onClick={onCancel}>Request cancellation</button>
        </footer>
      </div>
    </BeaconFrame>
  );
}

function StaticRideMap({ destination = "Home" }: { destination?: string }) {
  return (
    <div className={styles.rideMap} role="img" aria-label={`Static campus route from pickup to ${destination}`}>
      <svg viewBox="0 0 430 310" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="430" height="310" fill="#e8efe8" />
        <g className={styles.mapBlocks}>
          <path d="M-12 54h138v65H-12zM154 20h105v68H154zM295 37h152v74H295zM20 154h110v82H20zM157 131h116v83H157zM314 150h133v91H314zM-10 267h160v58H-10zM183 250h110v75H183zM326 270h120v55H326z" />
        </g>
        <g className={styles.mapRoads}>
          <path d="M-15 132C78 128 100 113 170 102S310 122 448 121" />
          <path d="M142-15c-5 89 15 140 1 202s-6 93 9 138" />
          <path d="M289-12c9 74-5 110 4 174s-3 105-9 163" />
          <path d="M-14 251c100-5 183-14 256-2s128 2 205-10" />
        </g>
        <path className={styles.mapRouteHalo} d="M78 238C112 206 119 178 158 159s77-4 104-34 42-40 87-54" />
        <path className={styles.mapRoute} d="M78 238C112 206 119 178 158 159s77-4 104-34 42-40 87-54" />
      </svg>
      <span className={`${styles.mapMarker} ${styles.pickupMarker}`} aria-hidden="true"><MapPin size={19} /></span>
      <span className={`${styles.mapMarker} ${styles.homeMarker}`} aria-hidden="true"><House size={17} /></span>
      <span className={styles.carMarker} aria-hidden="true"><CarFront size={21} /></span>
      <span className={styles.pickupLabel}>Pickup</span>
      <span className={styles.homeLabel}>{destination}</span>
    </div>
  );
}

function contactStatus(state: string | undefined) {
  if (state === "sent") return "Contact alerted";
  if (state === "simulated") return "Contact alert prepared";
  if (state === "sending") return "Preparing contact alert";
  if (state === "failed") return "Contact alert failed";
  if (state === "uncertain") return "Contact alert unconfirmed";
  return "No contact alert sent";
}

function RidePanel({ props, copy }: { props: MobilityScreenProps; copy: RideCopy }) {
  const { mobility, onArrival, onHelp, onDetails, onCancel, rideExperience } = props;
  const ride = mobility.ride;
  const state = rideExperience?.state ?? "active";
  const vehicle = [ride?.vehicle?.color, ride?.vehicle?.make, ride?.vehicle?.model].filter(Boolean).join(" ");
  const pickupEta = formatDuration(ride?.pickupEtaSeconds);
  const arrivalEta = formatDuration(ride?.arrivalEtaSeconds);
  const underway = ride?.stage === "riding" || ride?.stage === "completed";
  const eta = ride?.stage === "completed" ? "Done" : ride?.stage === "arrived" ? "Here" : ride?.stage === "riding" ? arrivalEta ?? "On route" : pickupEta ?? "—";
  const etaLabel = ride?.stage === "completed" ? "trip" : ride?.stage === "riding" ? "to home" : "pickup";
  const updatedAt = formatTimestamp(ride?.updatedAt);
  const provider = rideExperience?.providerName || "Ride provider";
  const simulation = ride?.providerSource === "simulated-rideshare" || rideExperience?.notificationState === "simulated";
  const activeRide = ride?.stage !== "completed" && ride?.stage !== "cancelled";
  const pickupInstruction = ride?.stage === "completed"
    ? "Confirm when you’re home."
    : ride?.stage === "riding"
      ? "Beacon is following your trip home."
      : ride?.providerSource === "simulated-rideshare"
        ? "Meet at the marked pickup point."
        : ride?.meetingInstructions?.trim() || "Pickup instructions pending.";

  if (state === "home") {
    return (
      <section className={`${styles.ridePanel} ${styles.homePanel}`} aria-labelledby="ride-panel-title">
        <span className={styles.panelHandle} aria-hidden="true" />
        <span className={styles.successMark} aria-hidden="true"><Check size={22} /></span>
        <p className={styles.panelEyebrow}>Trip complete</p>
        <h1 id="ride-panel-title" tabIndex={-1}>You’re home.</h1>
        <p className={styles.panelBody}>Location sharing and provider access ended.</p>
        <p className={styles.privacyLine}><ShieldCheck size={17} aria-hidden="true" /> Private trip access closed</p>
        {rideExperience?.onFinish ? <PrimaryAction onClick={rideExperience.onFinish}>Finish</PrimaryAction> : null}
        <button className={styles.textAction} type="button" onClick={onDetails}>Trip details</button>
      </section>
    );
  }

  if (state === "overdue") {
    return (
      <section className={styles.ridePanel} aria-labelledby="ride-panel-title">
        <span className={styles.panelHandle} aria-hidden="true" />
        <div className={styles.panelHeading}>
          <div><p className={styles.panelEyebrow}>Check in</p><h1 id="ride-panel-title" tabIndex={-1}>Are you home?</h1></div>
          {simulation ? <span className={styles.simulationBadge}>Simulation</span> : null}
        </div>
        <p className={styles.contactLine}>{contactStatus(rideExperience?.notificationState)}</p>
        <PrimaryAction onClick={onArrival}>I’m home</PrimaryAction>
        <div className={styles.checkinActions}>
          <button className={styles.secondaryAction} type="button" onClick={rideExperience?.onStillTravelling}>Still travelling</button>
          <button className={styles.secondaryAction} type="button" onClick={onHelp}>Get help</button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.ridePanel} aria-labelledby="ride-panel-title">
      <span className={styles.panelHandle} aria-hidden="true" />
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.panelEyebrow}>{copy.eyebrow}</p>
          <h1 id="ride-panel-title" tabIndex={-1}>{copy.title}</h1>
        </div>
        <div className={styles.etaBlock}><strong>{eta}</strong><span>{etaLabel}</span></div>
      </div>
      <div className={styles.providerLine}>
        <span className={styles.providerIcon}><CarFront size={20} aria-hidden="true" /></span>
        <span><small>{provider}</small><strong>{ride?.driver?.firstName || "Driver pending"}</strong></span>
        {ride?.vehicle?.plate ? <b>{ride.vehicle.plate}</b> : null}
        {simulation ? <span className={styles.simulationBadge}>Simulation</span> : null}
      </div>
      <div className={styles.rideDetails}>
        <p><small>Vehicle</small><strong>{vehicle || "Details pending"}</strong></p>
        <p><small>{underway ? "Destination" : "Pickup"}</small><strong>{underway ? rideExperience?.destination || "Home" : ride?.pickupLocation || "Location pending"}</strong></p>
      </div>
      <p className={styles.pickupInstruction}><MapPin size={17} aria-hidden="true" />{pickupInstruction}</p>
      {ride?.stale ? <p className={styles.compactWarning}><Clock3 size={15} aria-hidden="true" /> Status may be out of date.</p> : null}
      {ride?.stage === "riding" || ride?.stage === "completed" ? <PrimaryAction onClick={onArrival}>I’m home</PrimaryAction> : null}
      <div className={styles.compactActions}>
        <button type="button" onClick={onDetails}>Trip details</button>
        <button type="button" onClick={onHelp}>Get help</button>
        {activeRide ? <button type="button" onClick={onCancel}>Cancel</button> : null}
      </div>
      <p className={styles.providerUpdate}>{updatedAt ? `Updated ${updatedAt}` : "Update time unavailable"}</p>
    </section>
  );
}

function TransitWaitCard({ instruction, travelling = false }: {instruction?: string; travelling?: boolean}) {
  return (
    <section className={styles.statusCard} aria-labelledby="transit-wait-title">
      <div className={styles.statusTopline}>
        <span><Clock3 size={20} aria-hidden="true" /></span>
        <p><small id="transit-wait-title">Scheduled transit</small><strong>{travelling ? "Following your transit plan" : "Check your service before boarding"}</strong></p>
      </div>
      <p className={styles.statusNote}>No live transit status was supplied. Check the service sign before boarding.</p>
      {instruction ? <p className={styles.statusNote}>{instruction}</p> : null}
    </section>
  );
}

function RideScreen(props: MobilityScreenProps) {
  const { mobility, onArrival, onHelp, onDetails, onCancel, onBoard, rideExperience } = props;
  const ride = mobility.ride;
  const transitWaiting = mobility.leg.kind === "wait" && mobility.leg.purpose === "transit-stop" && mobility.leg.status === "active";
  const transitTravelling = mobility.leg.kind === "ride" && mobility.leg.purpose === "transit-stop" && !ride;
  const copy = transitWaiting
    ? { eyebrow: "Waiting at your stop", title: "Board when your service arrives.", body: "Check the service sign before boarding.", tone: "progress" as const }
    : transitTravelling ? {eyebrow:"Scheduled transit",title:"Follow your transit plan.",body:"Use the supplied service guidance. No live vehicle tracking is available.",tone:"progress" as const} : rideCopy(ride);
  const activeRide = Boolean(mobility.leg.status === "active" && ((ride && ride.stage !== "completed" && ride.stage !== "cancelled") || transitWaiting));

  if (!transitWaiting && !transitTravelling) {
    return (
      <BeaconFrame>
        <div className={styles.rideShell} data-stage={`ride-${rideExperience?.state ?? ride?.stage ?? "unknown"}`} data-testid="ride-status" aria-live="polite">
          <div className={styles.rideMapWrap}>
            <StaticRideMap destination={rideExperience?.destination} />
            {rideExperience?.presenterNext ? (
              <button className={styles.presenterNext} type="button" onClick={rideExperience.presenterNext.onClick} aria-label={`Presenter: ${rideExperience.presenterNext.label}`}>
                Next <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <RidePanel props={props} copy={copy} />
        </div>
      </BeaconFrame>
    );
  }

  return (
    <BeaconFrame>
      <div className={styles.screen} data-stage={`mobility-${mobility.leg.kind}`} data-testid="ride-status" data-tone={copy.tone}>
        <header className={styles.intro} aria-live="polite">
          <p>{copy.eyebrow}</p>
          <h1 tabIndex={-1}>{copy.title}</h1>
          <span>{copy.body}</span>
        </header>

        <div className={`${styles.content} ${styles.rideContent}`}>
          <TransitWaitCard instruction={mobility.leg.instruction} travelling={transitTravelling} />
        </div>

        <footer className={styles.footer}>
          {transitWaiting && onBoard ? <PrimaryAction onClick={onBoard}>{props.boardingLabel ?? "I’ve boarded"}</PrimaryAction> : null}
          {mobility.leg.kind === "ride" && mobility.leg.status === "active" && ride?.stage !== "cancelled" ? <PrimaryAction onClick={onArrival}>I’m home</PrimaryAction> : null}
          <UtilityActions onDetails={onDetails} onHelp={onHelp} />
          {activeRide ? <button className={styles.cancelAction} type="button" onClick={onCancel}>Request cancellation</button> : null}
        </footer>
      </div>
    </BeaconFrame>
  );
}

export function MobilityScreen(props: MobilityScreenProps) {
  const { mobility } = props;
  if (mobility.leg.kind === "walk" && mobility.leg.status === "active") {
    return <WalkingScreen {...props} />;
  }
  return <RideScreen {...props} />;
}
