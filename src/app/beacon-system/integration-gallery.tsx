"use client";

import { useState } from "react";
import { MobilityScreen } from "@/components/beacon/mobility-screens";
import { createDemoState, snapshotForStage } from "@/components/safecircle/demo-controller";
import { defaultProfile } from "@/components/safecircle/mock-data";
import { mobilitySample, type MobilitySample } from "@/lib/client/beacon/sample-responses";
import styles from "./specimen.module.css";
const samples: MobilitySample[] = ["walking-home","walking-pickup","walking-stop","route-loading","route-unavailable","route-stale","ride-waiting","ride-riding","source-unknown"];
const ignore = () => undefined;
export function IntegrationGallery() {
  const [selected, setSelected] = useState<MobilitySample>("walking-pickup");
  const [long, setLong] = useState(false);
  const [reduced, setReduced] = useState(false);
  const state = snapshotForStage(createDemoState(defaultProfile), "waiting-initial");
  const response = mobilitySample(state, selected);
  const mobility = response.mobility!;
  if (long && mobility.walkingRoute) mobility.walkingRoute = { ...mobility.walkingRoute, warning: "Layout stress test only. This deliberately long adapter warning checks wrapping and scrolling on a narrow phone. No real-world route or navigation instruction is supplied by this example." };
  return <section className={`${styles.gallery} ${reduced ? styles.reducedMotion : ""}`} aria-label="Mobility integration gallery">
    <header className={styles.galleryHeader}><div><p>Frontend adapter specimens</p><h2>Walking legs and ride updates</h2><span>Provisional contract examples. No campus directions, real booking or live provider data.</span></div><div className={styles.galleryToggles}><label><input type="checkbox" checked={long} onChange={e=>setLong(e.target.checked)} />Long content</label><label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)} />Reduced motion</label></div></header>
    <nav className={styles.galleryNav} aria-label="Mobility sample inventory"><div><h3>12–13 · Active leg</h3>{samples.map(name=><button key={name} aria-pressed={selected===name} onClick={()=>setSelected(name)}>{name.replaceAll("-"," ")}</button>)}</div></nav>
    <div className={styles.galleryPreview}><div className={styles.galleryCaption}><strong>{selected}</strong><small>{response.stage} · {mobility.leg.kind}</small></div><div className={styles.previewViewport}><MobilityScreen mobility={mobility} onWalkComplete={ignore} onArrival={ignore} onHelp={ignore} onDetails={ignore} onCancel={ignore} onRetryRoute={ignore} onBoard={ignore} /></div></div>
  </section>;
}
