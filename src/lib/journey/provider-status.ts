import type { RideObservation, RideStage } from './contracts';
export type ProviderDetails={stage?:RideStage;pickupEtaSeconds?:number;meetingInstructions?:string;driver?:{displayName:string|null};vehicle?:{make:string|null;model:string|null;color:string|null;licensePlate:string|null};updatedAt?:string};
function record(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid provider details');return v as Record<string,unknown>;}
function display(v:unknown,max=160):string|null{if(v==null)return null;if(typeof v!=='string'||v.length>max||/[<>\u0000-\u001f]|https?:\/\/|geta36\.app/i.test(v))throw Error('Invalid provider details');return v;}
export function parseProviderDetails(value:unknown):ProviderDetails{
 const v=record(value),result:ProviderDetails={};
 if(v.stage!==undefined){if(!['searching','assigned','approaching','arrived','in_trip','completed','cancelled','unknown'].includes(String(v.stage)))throw Error('Invalid provider stage');result.stage=v.stage as RideStage;}
 if(v.pickupEtaSeconds!==undefined){if(typeof v.pickupEtaSeconds!=='number'||!Number.isFinite(v.pickupEtaSeconds)||v.pickupEtaSeconds<0||v.pickupEtaSeconds>86400)throw Error('Invalid pickup ETA');result.pickupEtaSeconds=v.pickupEtaSeconds;}
 if(v.meetingInstructions!==undefined)result.meetingInstructions=display(v.meetingInstructions,500)??undefined;
 if(v.driver!==undefined){const d=record(v.driver);result.driver={displayName:display(d.displayName,80)};}
 if(v.vehicle!==undefined){const d=record(v.vehicle);result.vehicle={make:display(d.make,80),model:display(d.model,80),color:display(d.color,40),licensePlate:display(d.licensePlate,32)};}
 if(v.updatedAt!==undefined){if(typeof v.updatedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(v.updatedAt)||!Number.isFinite(Date.parse(v.updatedAt)))throw Error('Invalid provider time');result.updatedAt=v.updatedAt;}
 return result;
}
export function observeProvider(result:{status:string;details?:ProviderDetails},source:RideObservation['source'],now:number,simulated:boolean,previous?:RideObservation):RideObservation{
 const details=result.details??{},updated=details.updatedAt?Date.parse(details.updatedAt):null;
 if(updated!==null&&(updated>now+30000||previous?.providerUpdatedAt&&updated<=Date.parse(previous.providerUpdatedAt)))return previous??{stage:'unknown',providerStatus:result.status,pickupEtaSeconds:null,meetingInstructions:null,driver:null,vehicle:null,providerUpdatedAt:null,receivedAt:new Date(now).toISOString(),source,simulated};
 const stage=details.stage??(['searching','assigned','approaching','arrived','in_trip','completed','cancelled'].includes(result.status)?result.status as RideStage:'unknown');
 return{stage,providerStatus:result.status,pickupEtaSeconds:details.pickupEtaSeconds??null,meetingInstructions:details.meetingInstructions??null,driver:details.driver??null,vehicle:details.vehicle??null,providerUpdatedAt:details.updatedAt??null,receivedAt:new Date(now).toISOString(),source,simulated};
}
