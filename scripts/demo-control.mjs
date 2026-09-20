import {readFile, writeFile} from 'node:fs/promises';
import {DemoClient,receipt} from './demo-client.mjs';

const [runtimePath,command='show',argument]=process.argv.slice(2);
if(!runtimePath)throw new Error('Usage: node scripts/demo-control.mjs /private/runtime/operator.json start|show|scenario|advance|cancel|overdue|home [value]');
const runtime=JSON.parse(await readFile(runtimePath,'utf8'));
const client=new DemoClient(runtime.base,runtime.workerToken,runtime.cookie);
if(!runtime.cookie&&runtime.plannerMode==='codex_laptop'){await client.pair();runtime.cookie=client.cookie;}
if(command==='start'){
  const trip=await client.create({budget:argument===undefined?10:Number(argument)});runtime.tripId=trip.id;
  runtime.cookie=client.cookie;await writeFile(runtimePath,JSON.stringify(runtime),{mode:0o600});
  console.log(JSON.stringify(receipt(await client.plan(trip.id)),null,2));
}else{
  if(!runtime.tripId)throw new Error('Run start first');
  const id=runtime.tripId;
  if(command==='scenario'){await client.scenario(id,argument);await client.plan(id);}
  else if(command==='approve')await client.approve(id);
  else if(command==='advance')await client.advance(id,argument);
  else if(command==='cancel'){await client.advance(id,'cancelled');await client.plan(id);}
  else if(command==='overdue')await client.call(`/api/demo/trips/${id}/expire-deadline`,{});
  else if(command==='home'){
    for(let i=0;i<3;i++){if(i)await new Promise(resolve=>setTimeout(resolve,15010));await client.call(`/api/trips/${id}/location`,{lat:37.221,lng:-80.420,accuracyMeters:5,recordedAt:new Date().toISOString()});}
  }else if(command!=='show')throw new Error('Unknown demo command');
  console.log(JSON.stringify(receipt(await client.journey(id)),null,2));
}
