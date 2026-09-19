export const operations = ['planner.intent','directory.discover','identity.verify','provider.quote','context.query','context.delegate','source.lookup','decision.evaluate','plan.validate','planner.explain','student.confirm','booking.authorize','provider.book','provider.status','provider.cancel','payment.settle','trip.replan','trip.arrive','notification.send'] as const;
export type Operation = typeof operations[number];
export type ActivityEvent = {
 version:'beacon-agent-activity-v1'; eventId:string; sequence:number; runId:string; requestId:string; causationId:string|null; occurredAt:string;
 sender:string; recipient:string; operation:Operation; phase:'request'|'response'|'rejected'|'timeout'|'info';
 execution:'live'|'simulated'|'local_fallback'|'not_called'; identity:'ans_verified'|'local_demo'|'not_verified'|'not_applicable';
 summaryCode:string; safeData:Record<string,string|number|boolean|null>; evidenceIds:string[];
};
export type ActivityInput = Pick<ActivityEvent,'sender'|'recipient'|'operation'|'phase'> & Partial<Omit<ActivityEvent,'version'|'sequence'|'occurredAt'|'sender'|'recipient'|'operation'|'phase'>>;
export type CallInput = Omit<ActivityInput,'phase'>;
export type CallResult = Pick<Partial<ActivityEvent>,'safeData'|'execution'|'identity'|'evidenceIds'>;
