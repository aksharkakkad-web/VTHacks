import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connectPlanner } from '../tools/beacon-laptop-worker/client.mjs';
const file=join(homedir(),'.config','beacon-demo','worker.env');
if(existsSync(file))process.loadEnvFile(file);
let client;
try {
  client=await connectPlanner();
  const started=Date.now();
  const result=await client.run('student-intent',{objective:'get_home',exhausted:true,minimizeWalking:true,maxBudget:10,publicCorridor:'downtown-pritchard'});
  console.log(JSON.stringify({authMode:'chatgpt',model:client.model,reasoning:'low',structuredOutput:true,toolsExecuted:0,durationMs:Date.now()-started,result}));
}catch(error){console.error(JSON.stringify({ok:false,error:['AUTH_REQUIRED','TIMEOUT','INVALID_OUTPUT','MODEL_UNAVAILABLE','ISOLATION_UNAVAILABLE'].includes(error.message)?error.message:'MODEL_UNAVAILABLE',...(error.message==='ISOLATION_UNAVAILABLE'?{checks:error.cause}:{})}));process.exitCode=1;}
finally {await client?.close();}
