import { startPlanning } from "@/lib/planner/http";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return startPlanning(request,(await context.params).id);}
