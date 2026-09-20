/** Isolated real HTTP backend. Deterministic by default; --real-model is legacy opt-in coverage. */
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {demoEnvironment} from './demo-environment.mjs';
import {Backend,Worker} from '../tools/beacon-laptop-worker/worker.mjs';
import {connectPlanner} from '../tools/beacon-laptop-worker/client.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const state=await mkdtemp(join(tmpdir(),'beacon-browser-backend-'));
const env=demoEnvironment(process.env,state,{offline:true});
const realModel=process.argv.includes('--real-model');
if(realModel)env.BEACON_PLANNER_MODE='codex_laptop';
env.NEXT_PUBLIC_BEACON_TEST_RUNTIME=realModel?'0':'1';
const port=Number(process.env.BEACON_PORT||3123);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('BEACON_PORT must be an integer from 1024 to 65535');
env.BEACON_BACKEND_URL=`http://localhost:${port}`;
env.BEACON_SMOKE_URL=env.BEACON_BACKEND_URL;
env.BEACON_CONTEXT_AGENT_URL=`${env.BEACON_BACKEND_URL}/api/demo/context-agent`;
env.BEACON_DIST_DIR=process.env.BEACON_DIST_DIR||'.next-browser-backend';
const children=new Set();let stopping=false,worker,workerStop;
let resolveStop;const stopped=new Promise(resolve=>{resolveStop=resolve;});
function stop(){stopping=true;resolveStop();workerStop??=worker?.stop();for(const child of children)child.kill('SIGTERM');}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
function start(args){const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});children.add(child);child.done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{children.delete(child);if(code===0||stopping)resolve();else reject(new Error(`Runtime process exited (${code})`));});});child.done.catch(()=>{});return child;}
async function ready(url,child){for(let i=0;i<180;i++){if(stopping||child.exitCode!==null)throw new Error('Runtime stopped before ready');try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}throw new Error('Runtime startup timeout');}
try{
  await Promise.all([port,4311,4312,4313].map(listenPort=>new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(listenPort,'127.0.0.1',()=>server.close(resolve));})));
  await start(['node_modules/typescript/bin/tsc','-p','src/agents/tsconfig.test.json','--outDir',join(state,'compiled')]).done;
  const production=process.argv.includes('--production');
  if(production&&!process.argv.includes('--skip-build'))await start(['node_modules/next/dist/bin/next','build']).done;
  const providers=start([join(state,'compiled/agents/serve-demo.js')]);
  const app=start(['node_modules/next/dist/bin/next',production?'start':'dev','-H','127.0.0.1','-p',String(port)]);
  await Promise.all([ready(`${env.BEACON_BACKEND_URL}/`,app),ready('http://127.0.0.1:4312/.well-known/agent-card.json',providers)]);
  // runtime.ts owns the single local 10-second monitor loop. Verify its protected
  // endpoint once at startup; do not create a competing scheduler here.
  const monitor=await fetch(`${env.BEACON_BACKEND_URL}/api/trips/monitor`,{method:'POST',headers:{Authorization:`Bearer ${env.BEACON_MONITOR_TOKEN}`},signal:AbortSignal.timeout(10000)});
  if(!monitor.ok)throw new Error('Authenticated monitor startup check failed');
  if((await monitor.json()).checked!==true)throw new Error('Unexpected monitor startup response');
  await writeFile(join(state,'monitor-startup.json'),JSON.stringify({checkedAt:new Date().toISOString(),status:'passed',endpoint:'/api/trips/monitor',scheduler:'server_runtime',intervalMs:10000}),{mode:0o600,flag:'wx'});
  const planner=realModel?await connectPlanner():null;
  if(planner)worker=new Worker(new Backend(env.BEACON_BACKEND_URL,env.BEACON_PLANNER_WORKER_TOKEN),planner);
  const operator=join(state,'operator.json');
  await writeFile(operator,JSON.stringify({base:env.BEACON_BACKEND_URL,workerToken:env.BEACON_PLANNER_WORKER_TOKEN,plannerMode:env.BEACON_PLANNER_MODE,modelInference:realModel?'codex_subscription':'none',runtime:production?'production':'development'}),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({ready:true,base:env.BEACON_BACKEND_URL,operator,plannerMode:env.BEACON_PLANNER_MODE,modelInference:realModel?'codex_subscription':'none',model:planner?.model??'none',ranking:'offline',providers:'simulated',notifications:'simulated',monitor:'server_runtime_10s_startup_verified'}));
  const work=worker?(async()=>{while(!stopping){let worked=false;try{worked=await worker.step();}catch(error){if(error.message==='WORKER_UNAUTHORIZED')throw error;console.error(JSON.stringify({worker:'retrying',code:['STALE_LEASE','BACKEND_UNAVAILABLE'].includes(error.message)?error.message:'WORKER_UNAVAILABLE'}));}await Promise.race([stopped,new Promise(resolve=>setTimeout(resolve,worked?350:1500))]);}})():null;
  await Promise.race([stopped,...(work?[work]:[]),...[app,providers].map(child=>child.done.then(()=>{if(!stopping)throw new Error('Runtime stopped');}))]);
}finally{stop();const timer=setTimeout(()=>{for(const child of children)child.kill('SIGKILL');},3000);await Promise.all([...children].map(child=>child.done.catch(()=>{})));await workerStop;clearTimeout(timer);console.log(`Private runtime retained: ${state}`);}
