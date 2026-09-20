import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const output='docs/ui-research/beacon-signoff/tests/baseline';
await mkdir(output,{recursive:true});
const files=(await readdir('scripts')).filter(f=>/^verify-.*\.mjs$/.test(f));
const results=[];
for(const file of files){
  const dir=`${output}/${file.replace('.mjs','')}`;
  await mkdir(`${dir}/screenshots`,{recursive:true});await mkdir(`${dir}/video`,{recursive:true});
  // Only redirect artifact paths; preserve every baseline assertion and interaction.
  const source=(await readFile(`scripts/${file}`,'utf8')).replaceAll('docs/ui-research/',`${dir}/prior-paths/`);
  const temp=`scripts/.baseline-${file}`;await writeFile(temp,source);
  const start=Date.now();let log='';
  const child=spawn(process.execPath,[temp],{env:{...process.env,BEACON_URL:'http://localhost:3000',SAFECIRCLE_URL:'http://localhost:3000',BEACON_GALLERY_URL:'http://localhost:3000',PLAYWRIGHT_MODULE:'/Users/rishits/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',BEACON_EVIDENCE_DIR:dir,SAFECIRCLE_SCREENSHOTS:dir,BEACON_RUN_NAME:'baseline'}});
  child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  // A deadlocked test is a failed baseline, never a retry or hidden pass.
  const watchdog=setTimeout(()=>child.kill('SIGTERM'),180000);
  const code=await new Promise(resolve=>child.on('close',resolve));clearTimeout(watchdog);
  await writeFile(`${dir}/run.log`,log);await unlink(temp);
  results.push({file,code,durationMs:Date.now()-start,log:`${dir}/run.log`});
  await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  console.log(file,code,log.slice(-450));
}
