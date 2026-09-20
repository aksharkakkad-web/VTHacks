/** Local judge-demo runtime. Ctrl-C stops only the processes started here. */
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {demoEnvironment, loadExistingDatabricksToken} from './demo-environment.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
try { process.loadEnvFile(join(root,'.env.local')); } catch(error) { if(error.code!=='ENOENT')throw error; }
const check=process.argv.includes('--check'), offline=process.argv.includes('--offline');
const state=await mkdtemp(join(tmpdir(),'beacon-demo-'));
const env=demoEnvironment(process.env,state,{offline,google:process.argv.includes('--google')});
const children=new Set();let stopping=false;let end;let shutdownTimer;
const stopped=new Promise(resolve=>{end=resolve;});
function start(args,childEnv=env) {
  if(stopping)throw new Error('DEMO_STOPPED');
  const child=spawn(process.execPath,args,{cwd:root,env:childEnv,stdio:'inherit'});
  children.add(child);
  child.done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{children.delete(child);if(code===0||stopping)resolve();else reject(new Error(`Demo process exited: ${code??signal}`));});});
  child.done.catch(()=>{});return child;
}
async function ready(url,child) {
  for(let i=0;i<100;i++) {
    if(stopping)throw new Error('DEMO_STOPPED');
    if(child.exitCode!==null)throw new Error('Demo service exited before startup');
    try {if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error('Demo service failed to become ready');
}
async function portAvailable(port){await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
function stop(){
  stopping=true;end();
  for(const child of children)child.kill('SIGTERM');
  shutdownTimer??=setTimeout(()=>{for(const child of children)child.kill('SIGKILL');},3000);
}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
try {
  await Promise.all([3123,4311,4312,4313].map(portAvailable));
  const buildEnv={...env,DATABRICKS_TOKEN:'',DATABRICKS_HOST:'',DATABRICKS_WAREHOUSE_ID:'',GOOGLE_ROUTES_API_KEY:''};
  if(!process.argv.includes('--skip-build'))await start(['node_modules/next/dist/bin/next','build'],buildEnv).done;
  await start(['node_modules/typescript/bin/tsc','-p','src/agents/tsconfig.test.json','--outDir',join(state,'compiled')],buildEnv).done;
  const db=!offline&&loadExistingDatabricksToken(env);
  if(!db)for(const key of ['DATABRICKS_TOKEN','DATABRICKS_HOST','DATABRICKS_WAREHOUSE_ID'])env[key]='';
  if(db){
    const {executeStatement}=createRequire(import.meta.url)(join(state,'compiled/integrations/databricks/statement.js'));
    try {
      const warm=await executeStatement({host:env.DATABRICKS_HOST,token:env.DATABRICKS_TOKEN,warehouseId:env.DATABRICKS_WAREHOUSE_ID},{statement:'SELECT 1 AS demo_ready',timeoutMs:30000});
      console.log(`Databricks read-only startup check passed: ${warm.statementId}`);
    }catch{throw new Error('Existing Databricks connection could not be verified. Retry startup, or use --offline for local ranking.');}
  }
  env.BEACON_DEMO_EXPECT_DATABRICKS=db?'true':'false';
  console.log(`Demo data: labeled campus scenario. Databricks: ${db?'existing workspace configured; receipt will verify each query':'local comparison (offline)'}. Rides and notifications: simulated.`);
  const providers=start([join(state,'compiled/agents/serve-demo.js')]);
  const app=start(['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3123']);
  await Promise.all([ready(`${env.BEACON_BACKEND_URL}/`,app),ready('http://127.0.0.1:4312/.well-known/agent-card.json',providers)]);
  if(check) {
    env.BEACON_SMOKE_FIXTURE_MODEL=process.argv.includes('--fixture-model')?'true':'false';
    await start(['scripts/demo-acceptance.mjs']).done;
  } else {
    const worker=start(['tools/beacon-laptop-worker/worker.mjs']);
    const response=await fetch(`${env.BEACON_BACKEND_URL}/api/internal/planner/pairing`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.BEACON_PLANNER_WORKER_TOKEN}`},body:'{}'});
    if(!response.ok)throw new Error('Unable to create a demo pairing code');
    const pairing=await response.json();
    const operator=join(state,'operator.json');
    await writeFile(operator,JSON.stringify({base:env.BEACON_BACKEND_URL,workerToken:env.BEACON_PLANNER_WORKER_TOKEN}),{mode:0o600,flag:'wx'});
    console.log(`\nBeacon: ${env.BEACON_BACKEND_URL}\nPairing code (10 minutes): ${pairing.code}\nOperator runtime: ${operator}\nStart a scripted trip: node scripts/demo-control.mjs ${operator} start\nCtrl-C stops this demo.\n`);
    await Promise.race([stopped,...[app,providers,worker].map(child=>child.done.then(()=>{if(!stopping)throw new Error('Demo process stopped');}))]);
  }
} catch(error) {
  if(!stopping)throw error;
} finally {
  stopping=true;
  const exits=[...children].map(child=>{child.kill('SIGTERM');return child.done.catch(()=>{});});
  const kill=setTimeout(()=>{for(const child of children)child.kill('SIGKILL');},3000);
  await Promise.all(exits);clearTimeout(kill);clearTimeout(shutdownTimer);
  console.log(`Demo receipts/state retained privately at ${state}`);
}
