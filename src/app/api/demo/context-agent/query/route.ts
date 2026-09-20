import { timingSafeEqual } from 'node:crypto';
import { contextRuntime } from '@/agents/context/runtime';
export const runtime='nodejs';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'},expected=process.env.BEACON_CONTEXT_SERVICE_TOKEN;
 const a=Buffer.from(request.headers.get('authorization')??''),b=Buffer.from(`Bearer ${expected??''}`);
 if(!expected||expected.length<32||a.length!==b.length||!timingSafeEqual(a,b))return Response.json({error:{code:'UNAUTHORIZED'}},{status:401,headers});
 try{
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('INVALID');
  const reader=request.body?.getReader();if(!reader)throw Error('INVALID');let raw='',bytes=0;const decoder=new TextDecoder();
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();throw Error('INVALID');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
  const hop=request.headers.get('x-beacon-context-hop')??'0';if(!['0','1'].includes(hop))throw Error('INVALID');
  const result=await contextRuntime().query(JSON.parse(raw),Number(hop) as 0|1);
  return Response.json(result,{headers});
 }catch{return Response.json({error:{code:'CONTEXT_UNAVAILABLE'}},{status:400,headers});}
}
