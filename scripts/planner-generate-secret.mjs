import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
const dir=join(homedir(),'.config/beacon-demo');mkdirSync(dir,{recursive:true,mode:0o700});
const path=join(dir,'worker.env');
try{writeFileSync(path,`BEACON_PLANNER_WORKER_TOKEN=${randomBytes(32).toString('hex')}\nBEACON_PLANNER_MODEL=gpt-5.6-sol\n`,{mode:0o600,flag:'wx'});console.log(`Created private configuration: ${path}. Add BEACON_BACKEND_URL; existing files are never overwritten.`);}
catch(error){if(error.code==='EEXIST')console.log(`Private configuration already exists: ${path}`);else throw error;}
