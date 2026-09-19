import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { JourneyPlace, WaitingPlace } from './journey-types';

/** Public stop/building reference points; actual entrance access remains unknown. */
export function loadJourneyPlaces(at: string, root=process.cwd()): {stops:JourneyPlace[];waitingPlaces:WaitingPlace[];warnings:string[];transitSourceSha256?:string} {
  let transitSourceSha256:string|undefined;
  const now=Date.parse(at),warnings:string[]=[],stops:JourneyPlace[]=[],waitingPlaces:WaitingPlace[]=[];
  try {
    const base=join(root,'data/campus/transit-full');
    const manifest=JSON.parse(readFileSync(join(base,'manifest.json'),'utf8'));
    if(!Number.isFinite(Date.parse(manifest.captured_at)) || Date.parse(manifest.captured_at)>now || now-Date.parse(manifest.captured_at)>7*86400000) throw new Error('Stale stops');
    if(!/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error('Invalid source hash');
    transitSourceSha256=manifest.sha256;
    const rows=JSON.parse(readFileSync(join(base,'stops.json'),'utf8'));
    if(!Array.isArray(rows) || rows.length!==manifest.counts.stops) throw new Error('Invalid stops');
    for(const row of rows) if(Number.isFinite(Number(row.stop_lat))&&Number.isFinite(Number(row.stop_lon))) stops.push({id:row.stop_id,name:row.stop_name,point:{lat:Number(row.stop_lat),lng:Number(row.stop_lon)}});
  }catch{warnings.push('PUBLIC_STOPS_MISSING_OR_STALE');}
  try {
    const raw=readFileSync(join(root,'data/campus/waiting-locations.json'),'utf8'),data=JSON.parse(raw);
    const capture=Date.parse(data.captured_at);
    if(!Number.isFinite(capture) || capture>now || now-capture>=86400000 || !Array.isArray(data.records)) throw new Error('Stale hours');
    for(const row of data.records) waitingPlaces.push({id:row.site_id,name:row.name,point:{lat:row.reference_point[1],lng:row.reference_point[0]},
      indoor:row.indoor===true?true:null,sheltered:row.indoor===true?true:null,accessAllowed:row.nighttime_access_confirmed===true?true:row.nighttime_access_confirmed===false?false:null,
      opensAt:row.opens_at,closesAt:row.closes_at,capturedAt:data.captured_at,validUntil:new Date(Math.min(capture+86400000,Date.parse(row.closes_at))).toISOString(),sourceUrl:row.hours_source_url,sourceVersion:createHash('sha256').update(raw).digest('hex')});
  }catch{warnings.push('PUBLISHED_WAITING_HOURS_MISSING_OR_STALE');}
  return {stops,waitingPlaces,warnings,transitSourceSha256};
}
