import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execute,run} from '../scripts/process.ts';
test('async process capture preserves binary output and nonzero exit codes',async()=>{
 const result=await execute(process.execPath,['-e',"process.stdout.write(Buffer.from([0,255,1]));process.stderr.write('failure');process.exitCode=7"]);
 assert.deepEqual(result.stdout,Buffer.from([0,255,1]));assert.equal(result.stderr.toString(),'failure');assert.equal(result.status,7);assert.equal(result.signal,null);
 await assert.rejects(run(process.execPath,['-e','process.exitCode=3']),/failed \(3\)/);
});
test('async process spawn failure rejects and cleans up signal listeners',async()=>{
 const before=process.listenerCount('SIGTERM');
 await assert.rejects(execute('/definitely-missing-web-font-tool',[]),{code:'ENOENT'});
 assert.equal(process.listenerCount('SIGTERM'),before);
});
test('async process captures signal termination',async()=>{
 const result=await execute(process.execPath,['-e',"process.kill(process.pid,'SIGTERM')"]);
 assert.equal(result.status,null);assert.equal(result.signal,'SIGTERM');
});
test('async process accepts AbortSignal cancellation',async()=>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),100);
 try{await assert.rejects(execute(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal}),{name:'AbortError'});}finally{clearTimeout(timer);}
});
