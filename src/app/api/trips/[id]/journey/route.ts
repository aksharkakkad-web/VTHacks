import { getJourney } from '@/lib/trip-state/http';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return getJourney(request,(await context.params).id);}
