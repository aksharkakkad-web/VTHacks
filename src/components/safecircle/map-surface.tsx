import { CarFront, GraduationCap, LocateFixed, MapPin, Navigation } from "lucide-react";
import { IconButton } from "./primitives";
import type { DemoScreen } from "./types";

const routeVisible = new Set<DemoScreen>([
  "active",
  "cancelled",
  "replanning",
  "replacement",
  "replacement-active",
]);

export function MapSurface({ screen }: { screen: DemoScreen }) {
  const replacement = ["replanning", "replacement", "replacement-active"].includes(screen);

  return (
    <div className="sc-map" aria-label="Campus route map">
      <svg className="sc-map-art" viewBox="0 0 390 520" role="img" aria-label="Map from Downtown Blacksburg to Pritchard Hall">
        <path className="sc-map-green" d="M-28 100 C55 44 112 73 153 146 S244 209 279 119 S399 42 428 88 L428 298 C350 269 292 310 248 371 S126 468 11 411 Z" />
        <path className="sc-map-road-major" d="M-30 365 C67 330 82 267 135 231 C199 186 275 232 420 156" />
        <path className="sc-map-road-major" d="M71 -20 C92 101 151 145 177 220 C203 293 176 387 222 545" />
        <path className="sc-map-road" d="M-12 73 C79 123 117 118 185 82 C245 51 304 33 408 61" />
        <path className="sc-map-road" d="M-24 256 C69 223 104 185 139 132 C174 83 220 37 305 -19" />
        <path className="sc-map-road" d="M1 468 C97 442 133 384 165 328 C198 269 264 258 406 297" />
        <path className="sc-map-road" d="M311 -12 C283 113 288 201 330 259 C359 299 382 346 403 478" />
        <path className="sc-map-road" d="M-10 177 C87 182 126 202 175 257 C217 304 246 378 267 538" />
        <g className="sc-map-blocks">
          <rect x="34" y="111" width="52" height="25" rx="8" transform="rotate(-13 34 111)" />
          <rect x="215" y="82" width="45" height="28" rx="8" transform="rotate(11 215 82)" />
          <rect x="273" y="176" width="63" height="31" rx="9" transform="rotate(-8 273 176)" />
          <rect x="47" y="286" width="55" height="30" rx="9" transform="rotate(17 47 286)" />
          <rect x="246" y="356" width="67" height="28" rx="9" transform="rotate(4 246 356)" />
        </g>
        {routeVisible.has(screen) && (
          <>
            <path className="sc-route-halo" d={replacement ? "M86 327 C135 301 164 272 184 235 C211 187 252 173 300 150" : "M104 345 C134 310 156 276 181 239 C208 200 244 181 292 165"} />
            <path className={`sc-route-line${replacement ? " is-replacement" : ""}`} d={replacement ? "M86 327 C135 301 164 272 184 235 C211 187 252 173 300 150" : "M104 345 C134 310 156 276 181 239 C208 200 244 181 292 165"} />
          </>
        )}
      </svg>

      <span className="sc-map-label is-campus"><GraduationCap size={12} /> Virginia Tech</span>
      <span className="sc-map-label is-home">Pritchard Hall</span>
      <span className="sc-map-label is-downtown">Downtown</span>

      <span className={`sc-user-pin${routeVisible.has(screen) ? " is-routing" : ""}`} aria-label="Your current location"><span /></span>
      {routeVisible.has(screen) && (
        <>
          <span className={`sc-provider-pin${replacement ? " is-replacement" : ""}`} aria-label={`${replacement ? "Rideshare" : "Campus Shuttle"} location`}>
            <CarFront size={18} fill="currentColor" />
          </span>
          <span className="sc-destination-pin" aria-label="Home destination"><MapPin size={19} fill="currentColor" /></span>
          <div className="sc-map-eta">
            <CarFront size={15} />
            <span>Arriving in <strong>{replacement ? 6 : 8} min</strong></span>
          </div>
        </>
      )}

      <div className="sc-map-controls">
        <IconButton aria-label="Center map on current location"><LocateFixed size={18} /></IconButton>
        <IconButton aria-label="Open directions"><Navigation size={18} /></IconButton>
      </div>
    </div>
  );
}
