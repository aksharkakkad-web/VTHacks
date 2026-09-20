import {Backend} from '../tools/beacon-laptop-worker/worker.mjs';

export class DemoClient {
  constructor(base,workerToken,cookie=''){this.base=base;this.backend=new Backend(base,workerToken);this.cookie=cookie;}
  async call(path,body,expected=200){
    const response=await fetch(`${this.base}${path}`,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(this.cookie?{Cookie:this.cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const cookie=response.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];
    const result=await response.json();
    if(response.status!==expected)throw new Error(`${path}: ${result.error?.code??response.status}`);
    return result;
  }
  async pair(){const {code}=await this.backend.post('pairing',{});await this.call('/api/demo/planner/pair',{code});}
  create({budget=10,minimize=false,variant='baseline'}={}){return this.call('/api/trips',{journeyContract:'beacon-journey-v1',demoScenarioVariant:variant,preferences:{maxBudget:budget,walkingPreference:minimize?'minimize':'normal',transferPreference:'minimize',trustedContact:{name:'Demo contact',telegramChatId:'123456',consent:true,shareLocation:false}}},201);}
  journey(id){return this.call(`/api/trips/${id}/journey`);}
  async plan(id,step){
    await this.call(`/api/trips/${id}/planning`,{},202);
    const until=Date.now()+180000;
    while(Date.now()<until){
      if(step)await step();
      const result=await this.journey(id);
      if(result.planning?.phase==='ready')return result;
      if(['needs_input','unavailable'].includes(result.planning?.phase))throw new Error(`Planning failed: ${result.planning.messageCode}`);
      if(!step)await new Promise(resolve=>setTimeout(resolve,1000));
    }
    throw new Error('Planner did not finish within three minutes');
  }
  async approve(id){const {journey}=await this.journey(id);await this.call(`/api/trips/${id}/confirm`,{planId:journey.selectedPlanId,journeyRevision:journey.revision,...(journey.selectedOffer?{quoteId:journey.selectedOffer.quoteId}:{})});await this.call(`/api/trips/${id}/verify`,{});return this.call(`/api/trips/${id}/request`,{});}
  async scenario(id,variant){const {journey}=await this.journey(id);return this.call(`/api/demo/trips/${id}/scenario`,{variant,journeyRevision:journey.revision});}
  advance(id,stage){return this.call(`/api/demo/trips/${id}/advance-ride`,{stage,...(stage==='approaching'?{pickupEtaSeconds:90}:{})});}
}

export function receipt(view){const result=view.journey.complete;return{tripId:view.trip.id,state:view.trip.state,variant:result?.demoScenario?.variant,selected:result?.selected?.kind,scoreUnits:result?.selected?.scoreUnits,costMinor:result?.selected?.costMinor,exposure:result?.selected?.scenarioExposure,engine:result?.execution.engine,statementId:result?.execution.statementId,alternativeCount:result?.alternatives.length,nextStep:view.journey.nextStep,ride:view.ride,notification:view.notification,planning:view.planning};}
