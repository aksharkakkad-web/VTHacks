import test from "node:test";
import assert from "node:assert/strict";
import { createPairing, pairPlanner } from "../lib/planner/http";

function post(path:string,body:unknown,headers:Record<string,string>={}){return new Request(`http://localhost${path}`,{method:"POST",headers:{"content-type":"application/json",origin:"http://localhost",...headers},body:JSON.stringify(body)});}
async function payload(response:Response){return await response.json() as {error?:{code?:string}};}

test("planner endpoints fail closed unless laptop mode and a strong worker bearer are configured",{concurrency:false},async()=>{
 const previousMode=process.env.BEACON_PLANNER_MODE,previousToken=process.env.BEACON_PLANNER_WORKER_TOKEN;
 try{
  delete process.env.BEACON_PLANNER_MODE;delete process.env.BEACON_PLANNER_WORKER_TOKEN;
  let response=await createPairing(post("/api/internal/planner/pairing",{}));
  assert.equal(response.status,503);assert.equal((await payload(response)).error?.code,"SERVICE_NOT_CONFIGURED");
  process.env.BEACON_PLANNER_MODE="codex_laptop";process.env.BEACON_PLANNER_WORKER_TOKEN="short";
  response=await createPairing(post("/api/internal/planner/pairing",{}, {authorization:"Bearer short"}));
  assert.equal(response.status,503);assert.equal((await payload(response)).error?.code,"SERVICE_NOT_CONFIGURED");
 }finally{
  if(previousMode===undefined)delete process.env.BEACON_PLANNER_MODE;else process.env.BEACON_PLANNER_MODE=previousMode;
  if(previousToken===undefined)delete process.env.BEACON_PLANNER_WORKER_TOKEN;else process.env.BEACON_PLANNER_WORKER_TOKEN=previousToken;
 }
});

test("a normal owner cookie cannot call worker-only routes",{concurrency:false},async()=>{
 const previousMode=process.env.BEACON_PLANNER_MODE,previousToken=process.env.BEACON_PLANNER_WORKER_TOKEN;
 try{
  process.env.BEACON_PLANNER_MODE="codex_laptop";process.env.BEACON_PLANNER_WORKER_TOKEN="a".repeat(32);
  const response=await createPairing(post("/api/internal/planner/pairing",{}, {cookie:`beacon-session=${"b".repeat(64)}`}));
  assert.equal(response.status,401);assert.equal((await payload(response)).error?.code,"UNAUTHORIZED");
 }finally{
  if(previousMode===undefined)delete process.env.BEACON_PLANNER_MODE;else process.env.BEACON_PLANNER_MODE=previousMode;
  if(previousToken===undefined)delete process.env.BEACON_PLANNER_WORKER_TOKEN;else process.env.BEACON_PLANNER_WORKER_TOKEN=previousToken;
 }
});

test("owner pairing also stays disabled outside explicit laptop mode",{concurrency:false},async()=>{
 const previousMode=process.env.BEACON_PLANNER_MODE;
 try{
  delete process.env.BEACON_PLANNER_MODE;
  const response=await pairPlanner(post("/api/demo/planner/pair",{code:"0".repeat(32)}));
  assert.equal(response.status,503);assert.equal((await payload(response)).error?.code,"SERVICE_NOT_CONFIGURED");
 }finally{if(previousMode===undefined)delete process.env.BEACON_PLANNER_MODE;else process.env.BEACON_PLANNER_MODE=previousMode;}
});
