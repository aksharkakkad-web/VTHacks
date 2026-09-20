export const runtime='nodejs';
export function GET(){return Response.json({name:'Beacon Route Context',operator:'Beacon demo team',profileVersion:'beacon-context-v1',capabilities:['query_context'],description:'Public evidence research; no booking, safety certification or live crime prediction.'},{headers:{'Cache-Control':'no-store'}});}
