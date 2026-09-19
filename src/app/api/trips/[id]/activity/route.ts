import { readActivity } from "@/lib/planner/http";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return readActivity(request,(await context.params).id);}
