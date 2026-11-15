const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  if(['node_modules','.git','dist'].includes(e.name))return [];
  const p=path.join(dir,e.name);return e.isDirectory()?files(p):e.name.endsWith('.js')?[p]:[];
});}
const list=files(path.resolve(__dirname,'..'));
for(const file of list){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){process.stderr.write(result.stderr);process.exit(1);}}
console.log(`Syntax OK: ${list.length} JavaScript files`);
