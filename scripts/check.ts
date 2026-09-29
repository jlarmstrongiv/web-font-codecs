/** Complete serial local validation; browser engines are provisioned separately. */
import { execute } from './process.ts';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
process.env.NODE_OPTIONS=[process.env.NODE_OPTIONS,'--conditions=web-font-codecs:source'].filter(Boolean).join(' ');
process.env.npm_config_offline='true';
process.env.npm_config_audit='false';
process.env.npm_config_fund='false';
process.env.npm_config_update_notifier='false';
for(const script of ['build:ts','check:records','typecheck','test','test:reference','test:pack','web:build','test:browser']) {
  console.log(`\nChecking ${script}`);
  const result=await execute('npm',['run',script],{stdio:'inherit'});

  if(result.signal) process.kill(process.pid,result.signal);
  if(result.status!==0) process.exit(result.status??1);
}
console.log('Complete check passed (Chromium, Firefox and Playwright WebKit).');
