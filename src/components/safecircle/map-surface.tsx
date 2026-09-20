import type { DemoViewModel } from "./types";
/** Retired illustrative map. Exact walking routes now render in MobilityScreen.
 * This compatibility export deliberately cannot show invented roads or provider pins.
 */
export function MapSurface({ model }: { model: DemoViewModel }) {
  void model;
  return null;
}
