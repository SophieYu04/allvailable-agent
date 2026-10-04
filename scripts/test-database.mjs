// Disposable local PostgreSQL only. Never reads a remote connection string.
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
const root = mkdtempSync(join(tmpdir(), 'allvailable-db-'));
const bin = process.env.ALLVAILABLE_POSTGRES_BIN || execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
const probe=createServer();
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const run=(name,args)=>execFileSync(join(bin,name),args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let started=false;
try {
 run('initdb',['-D',join(root,'data'),'-A','trust','--no-locale']);
 run('pg_ctl',['-D',join(root,'data'),'-l',join(root,'server.log'),'-o',`-p ${port} -h 127.0.0.1 -k ${root}`,'start']);started=true;
 const sql=file=>run('psql',['-h','127.0.0.1','-p',String(port),'-d','postgres','-v','ON_ERROR_STOP=1','-f',file]);
 sql('tests/database/bootstrap.sql');
 const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const file of migrations)sql(join('supabase/migrations',file));
 const suites=['roadmap.sql','productivity.sql','lifecycle.sql','ai-quota.sql','full-day-import.sql'];
 for(const file of suites){writeFileSync(join(root,file+'.log'),sql(join('tests/database',file)));console.log('PASS '+file);}
 console.log(JSON.stringify({migrations:migrations.length,suites:suites.length,localOnly:true,logs:root}));
} catch(error) {
 console.error(error.stderr?.toString() || error.message);
 process.exitCode=1;
} finally {
 if(started)run('pg_ctl',['-D',join(root,'data'),'-m','fast','stop']);
}
