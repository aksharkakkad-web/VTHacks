import type { RoutePoint } from "./read-models";

type GoogleLatLng = { lat: number; lng: number };

type GoogleMapInstance = {
  fitBounds: (bounds: unknown, padding?: number) => void;
  setCenter: (center: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
};

type GoogleMapObject = { setMap: (map: GoogleMapInstance | null) => void };

type GoogleMapsApi = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  LatLngBounds: new () => { extend: (point: GoogleLatLng) => void };
  Polyline: new (options: Record<string, unknown>) => GoogleMapObject;
  Circle: new (options: Record<string, unknown>) => GoogleMapObject;
  event?: { clearInstanceListeners?: (instance: unknown) => void };
};

type GoogleMapsWindow = Window & {
  google?: { maps?: GoogleMapsApi };
};

export type GoogleMapRenderResult =
  | { status: "rendered"; cleanup: () => void }
  | { status: "sdk-missing" | "invalid-geometry"; cleanup: () => void };

function isFinitePoint(point: RoutePoint): point is RoutePoint {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

/**
 * Draws supplied Google Routes geometry on an already-initialized Google map.
 * It never requests, calculates, simplifies, or smooths a route.
 */
export function renderGoogleWalkingRoute(
  container: HTMLElement,
  route: readonly RoutePoint[],
): GoogleMapRenderResult {
  const maps = typeof window === "undefined"
    ? undefined
    : (window as GoogleMapsWindow).google?.maps;
  const points = route.filter(isFinitePoint);
  const noop = () => undefined;

  if (!maps?.Map || !maps.Polyline || !maps.LatLngBounds || !maps.Circle) {
    return { status: "sdk-missing", cleanup: noop };
  }
  if (points.length === 0 || points.length !== route.length) {
    return { status: "invalid-geometry", cleanup: noop };
  }

  const map = new maps.Map(container, {
    clickableIcons: false,
    disableDefaultUI: true,
    fullscreenControl: false,
    gestureHandling: "cooperative",
    mapTypeControl: false,
    streetViewControl: false,
    zoomControl: true,
  });
  const path = points.map(({ lat, lng }) => ({ lat, lng }));
  const routeLine = new maps.Polyline({
    map,
    path,
    geodesic: false,
    strokeColor: "#16775f",
    strokeOpacity: 1,
    strokeWeight: 6,
  });
  const start = new maps.Circle({
    map,
    center: path[0],
    radius: 5,
    fillColor: "#fbfaf6",
    fillOpacity: 1,
    strokeColor: "#16775f",
    strokeOpacity: 1,
    strokeWeight: 3,
  });
  const end = new maps.Circle({
    map,
    center: path.at(-1),
    radius: 7,
    fillColor: "#56bfa1",
    fillOpacity: 1,
    strokeColor: "#fbfaf6",
    strokeOpacity: 1,
    strokeWeight: 3,
  });

  if (path.length === 1) {
    map.setCenter(path[0]);
    map.setZoom(17);
  } else {
    const bounds = new maps.LatLngBounds();
    path.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 38);
  }

  return {
    status: "rendered",
    cleanup: () => {
      routeLine.setMap(null);
      start.setMap(null);
      end.setMap(null);
      maps.event?.clearInstanceListeners?.(map);
      container.replaceChildren();
    },
  };
}
