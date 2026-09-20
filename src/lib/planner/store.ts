import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export interface JsonStore<T>{read():Promise<T>;update<R>(fn:(value:T)=>R):Promise<R>}
export class MemoryJsonStore<T> implements JsonStore<T>{
 protected value:T;private pending:Promise<unknown>=Promise.resolve();
 constructor(value:T){this.value=structuredClone(value);}
 async read(){return structuredClone(this.value);}
 protected async save(v:T){this.value=structuredClone(v);}
 async update<R>(fn:(value:T)=>R):Promise<R>{
  const op=this.pending.catch(()=>{}).then(async()=>{const state=await this.read();const result=fn(state);if(result instanceof Promise)throw new Error('ASYNC_TRANSACTION_FORBIDDEN');await this.save(state);return structuredClone(result);});this.pending=op;return op;
 }
}
export class FileJsonStore<T> extends MemoryJsonStore<T>{
 constructor(private path:string,initial:T){super(initial);}
 async read(){try{return JSON.parse(await readFile(this.path,'utf8')) as T;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return super.read();throw e;}}
 protected async save(value:T){await mkdir(dirname(this.path),{recursive:true,mode:0o700});const tmp=`${this.path}.${randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,this.path);}
}
export class RedisJsonStore<T> implements JsonStore<T>{
 constructor(private url:string,private token:string,private key:string,private initial:()=>T){if(new URL(url).protocol!=='https:')throw new Error('REDIS_HTTPS_REQUIRED');}
 private async command(args:(string|number)[]){const response=await fetch(this.url,{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('PLANNER_STORE_UNAVAILABLE');const data=await response.json();if(data.error)throw new Error('PLANNER_STORE_UNAVAILABLE');return data.result;}
 async read(){const raw=await this.command(['GET',this.key]);return typeof raw==='string'?JSON.parse(raw) as T:this.initial();}
 async update<R>(fn:(state:T)=>R):Promise<R>{
  for(let attempt=0;attempt<12;attempt++){
   const raw=await this.command(['GET',this.key]);const state=typeof raw==='string'?JSON.parse(raw) as T:this.initial();const result=fn(state);if(result instanceof Promise)throw new Error('ASYNC_TRANSACTION_FORBIDDEN');
   const saved=await this.command(['EVAL',"local old=redis.call('GET',KEYS[1]);if (old or '')~=ARGV[1] then return 0 end;redis.call('SET',KEYS[1],ARGV[2],'EX',86400);return 1",1,this.key,typeof raw==='string'?raw:'',JSON.stringify(state)]);
   if(saved===1)return structuredClone(result);
  }throw new Error('PLANNER_STORE_BUSY');
 }
}
