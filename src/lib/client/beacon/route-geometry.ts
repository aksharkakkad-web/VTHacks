import type { RoutePoint, WalkingRouteReadModel } from "./read-models";

/** Google's documented encoded-polyline algorithm (1e5 precision).
 * Decode only: never snap, smooth, interpolate or calculate a route.
 */
export function decodePolyline(value: string): RoutePoint[] {
  if (!value || value.length > 200000) throw new Error("Invalid route geometry");
  const points: RoutePoint[] = [];
  let index = 0, lat = 0, lng = 0;
  function component() {
    let result = 0, shift = 0, byte = 0;
    do {
      if (index >= value.length || shift > 30) throw new Error("Truncated route geometry");
      byte = value.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error("Invalid route character");
      result += (byte & 31) * 2 ** shift;
      shift += 5;
    } while (byte >= 32);
    return result % 2 ? -(Math.floor(result / 2) + 1) : result / 2;
  }
  while (index < value.length) {
    lat += component(); lng += component();
    const point = { lat: lat / 1e5, lng: lng / 1e5 };
    if (!validPoint(point)) throw new Error("Invalid route coordinate");
    points.push(point);
    if (points.length > 20000) throw new Error("Route too large");
  }
  if (points.length < 2) throw new Error("Route needs at least two points");
  return points;
}
export function validPoint(point: RoutePoint): boolean {
  return !!point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}
export function routePoints(route: WalkingRouteReadModel): RoutePoint[] {
  if (!route.geometry) return [];
  if (route.geometry.format === "encoded-polyline") return decodePolyline(route.geometry.value);
  const points = route.geometry.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 20000 || !points.every(validPoint)) throw new Error("Invalid route coordinates");
  return points.map(p => ({ lat: p.lat, lng: p.lng }));
}
