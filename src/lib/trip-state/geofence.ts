import type { Point } from "../../agents/contract";
export function distanceMeters(a: Point, b: Point) {
  const radians = (n: number) => n * Math.PI / 180;
  const dLat = radians(b.lat - a.lat); const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
