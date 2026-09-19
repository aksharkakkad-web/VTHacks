"use client";

import { useState } from "react";
import { BusFront, CarFront, LocateFixed, Map, MapPin } from "lucide-react";
import { IconButton } from "./primitives";
import type { DemoViewModel } from "./types";

export function MapSurface({ model }: { model: DemoViewModel }) {
  const [view, setView] = useState<"overview" | "current">("overview");
  const isStale = "isStale" in model && model.isStale === true;
  const showProvider = (model.isActiveTrip || isStale) && model.isRouteVisible && model.selectedPlan && model.selectedPlan.providerId !== null && model.selectedPlan.mode !== "walk";
  const isRideshare = model.selectedPlan?.mode === "independent_ride";
  const eta = model.progressStep === "in-trip"
    ? model.selectedPlan?.travelMinutes
    : model.progressStep === "arriving"
      ? 1
      : model.selectedPlan?.waitMinutes;

  return (
    <div className={`sc-map is-${view}`} aria-label="Illustrative campus route map">
      <div className="sc-map-plane">
      <svg className="sc-map-art" viewBox="0 0 390 560" role="img" aria-label="Illustrative campus map, not a geocoded route">
        <path className="sc-map-green" d="M-28 100 C55 44 112 73 153 146 S244 209 279 119 S399 42 428 88 L428 315 C350 276 292 320 248 386 S126 492 11 431 Z" />
        <path className="sc-map-road-major" d="M-30 395 C67 350 82 287 135 251 C199 206 275 252 420 176" />
        <path className="sc-map-road-major" d="M71 -20 C92 101 151 165 177 240 C203 313 176 407 222 585" />
        <path className="sc-map-road" d="M-12 73 C79 123 117 118 185 82 C245 51 304 33 408 61" />
        <path className="sc-map-road" d="M-24 276 C69 243 104 205 139 152 C174 103 220 57 305 -19" />
        <path className="sc-map-road" d="M1 498 C97 462 133 404 165 348 C198 289 264 278 406 317" />
        <path className="sc-map-road" d="M311 -12 C283 133 288 221 330 279 C359 319 382 366 403 498" />
        <path className="sc-map-road" d="M-10 197 C87 202 126 222 175 277 C217 324 246 398 267 578" />
        <g className="sc-map-blocks">
          <rect x="34" y="111" width="52" height="25" rx="7" transform="rotate(-13 34 111)" />
          <rect x="215" y="82" width="45" height="28" rx="7" transform="rotate(11 215 82)" />
          <rect x="273" y="196" width="63" height="31" rx="7" transform="rotate(-8 273 196)" />
          <rect x="47" y="306" width="55" height="30" rx="7" transform="rotate(17 47 306)" />
          <rect x="246" y="376" width="67" height="28" rx="7" transform="rotate(4 246 376)" />
        </g>
        {model.isRouteVisible && (
          <>
            <path className="sc-route-halo" d="M88 365 C127 330 158 302 183 262 C210 218 251 193 302 166" />
            <path className="sc-route-line" d="M88 365 C127 330 158 302 183 262 C210 218 251 193 302 166" />
            <circle className="sc-route-node" cx="183" cy="262" r="5" />
            <circle className="sc-route-node" cx="246" cy="201" r="5" />
          </>
        )}
      </svg>

      <span className="sc-map-label is-campus">Campus center</span>
      <span className="sc-map-label is-home">Home area</span>
      <span className="sc-map-label is-downtown">Downtown</span>
      <span className="sc-user-pin" aria-label={isStale ? "Last known location" : "Current location"}><span /></span>

      {showProvider && (
        <>
          <span className="sc-provider-pin" aria-label={`${model.selectedPlan?.providerName} location`}>
            {isRideshare ? <CarFront size={18} /> : <BusFront size={18} />}
          </span>
          <span className="sc-destination-pin" aria-label="Saved home area"><MapPin size={18} /></span>
          <div className="sc-map-eta" aria-label={`${eta} minutes`}>
            <span>{isStale ? "Last estimate" : model.progressStep === "in-trip" ? "Home in" : model.progressStep === "arriving" ? "Arriving" : "Pickup in"}</span>
            <strong>{eta} min</strong>
          </div>
        </>
      )}
      </div>

      <div className="sc-map-controls">
        <IconButton
          aria-label={view === "overview" ? "Center map on current location" : "Show route overview"}
          title={view === "overview" ? "Center on current location" : "Show route overview"}
          aria-pressed={view === "current"}
          onClick={() => setView((current) => current === "overview" ? "current" : "overview")}
        >
          {view === "overview" ? <LocateFixed size={19} /> : <Map size={19} />}
        </IconButton>
      </div>
      <span className="sc-map-disclaimer">Illustrative demo route</span>
      {isStale && <span className="sc-map-offline">Last known · updates paused</span>}
    </div>
  );
}
