const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {planUpdate,dependencyKey,makeLauncher}=require('../../scripts/windows-launcher.cjs');
const remote='https://github.com/originone494/EasyStsGame.git';
test('更新策略保留修改、其他分支与其他来源',()=>{
 assert.equal(planUpdate({remote,dirty:false,branch:'main'}),'pull');
 assert.equal(planUpdate({remote,dirty:true,branch:'main'}),'modified');
 assert.equal(planUpdate({remote,dirty:false,branch:'my-work'}),'branch');
 assert.equal(planUpdate({remote:'https://github.com/else/other.git',dirty:false,branch:'main'}),'foreign');
});
test('只有依赖锁或 Node 版本变化会改变安装标记',()=>{
 assert.equal(dependencyKey('lock','24.0'),dependencyKey('lock','24.0'));
 assert.notEqual(dependencyKey('lock2','24.0'),dependencyKey('lock','24.0'));
 assert.notEqual(dependencyKey('lock','24.1'),dependencyKey('lock','24.0'));
});
function fixture({installed=true,dirty=false,branch='main',foreign=false,stamp=true,pullFail=false,installFail=false}={}){
 const root='/fake/user folder/EasyStsGame',repo=path.join(root,'repository'),calls=[],messages=[],writes=[];
 const files=new Map();
 if(installed)files.set(path.join(repo,'.git'),'git');
 for(const f of ['package-lock.json','package.json','node_modules/vite/bin/vite.js'])files.set(path.join(repo,f),f==='package-lock.json'?'lock':'present');
 if(stamp)files.set(path.join(root,'dependencies.sha256'),dependencyKey('lock','24.0'));
 const launcher=makeLauncher({root,version:'24.0',exists:p=>files.has(p),read:p=>Buffer.from(files.get(p)),write:(p,v)=>{writes.push(p);files.set(p,v)},mkdir:()=>{},output:m=>messages.push(m),run:(cmd,args,opts)=>{
  calls.push({cmd,args,...opts});
  if(args[0]==='status')return{status:0,stdout:dirty?' M content.ts':''};
  if(args[0]==='symbolic-ref')return{status:0,stdout:branch};
  if(args[0]==='remote')return{status:0,stdout:foreign?'https://github.com/else/repo':remote};
  if(args[0]==='pull')return{status:pullFail?1:0,stdout:''};
  if(args[0]==='ci')return{status:installFail?1:0,stdout:''};
  return{status:0,stdout:''};
 }});
 return{launcher,calls,messages,writes};
}
test('首次只克隆到专用目录，再安装并打开浏览器',()=>{
 const f=fixture({installed:false,stamp:false});f.launcher.launch();
 assert.deepEqual(f.calls.map(x=>x.args[0]),['clone','ci','run']);
 assert.equal(f.calls[0].args[1],'--branch');
 assert.equal(f.calls[0].args[2],'main');
 assert.ok(f.calls[2].args.includes('--open'));
 assert.ok(f.calls[2].args.includes('127.0.0.1'));
});
test('重复启动使用 ff-only，依赖未变不重装',()=>{
 const f=fixture();f.launcher.launch();
 assert.ok(f.calls.some(x=>x.args.join(' ')==='pull --ff-only origin main'));
 assert.equal(f.calls.filter(x=>x.args[0]==='ci').length,0);
 assert.equal(f.calls.at(-1).args[0],'run');
});
test('有本地修改或其他分支时不执行 pull，仍可启动原版',()=>{
 for(const options of [{dirty:true},{branch:'experiment'}]){const f=fixture(options);f.launcher.launch();assert.ok(!f.calls.some(x=>x.args[0]==='pull'));assert.equal(f.calls.at(-1).args[0],'run');}
});
test('更新网络失败仍启动现有可用版本',()=>{
 const f=fixture({pullFail:true});f.launcher.launch();assert.equal(f.calls.at(-1).args[0],'run');assert.ok(f.messages.some(m=>m.includes('暂时无法更新')));
});
test('来源不符时停止，不安装、不启动',()=>{
 const f=fixture({foreign:true});assert.throws(()=>f.launcher.launch(),/来源/);assert.ok(!f.calls.some(x=>x.cmd==='npm'));
});
test('安装失败不写成功标记、不启动游戏',()=>{
 const f=fixture({stamp:false,installFail:true});assert.throws(()=>f.launcher.launch(),/执行失败/);assert.equal(f.writes.length,0);assert.ok(!f.calls.some(x=>x.args[0]==='run'));
});
test('双击文件中的 JS 与可维护源完全一致并可以加载',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../scripts/windows-launcher.cjs'),'utf8').replace(/\r/g,'');
 const cmd=fs.readFileSync(path.join(__dirname,'../../启动游戏.cmd'),'utf8').replace(/\r/g,'');
 const embedded=cmd.split('\n// EASYSTS_NODE_SCRIPT\n')[1];assert.equal(embedded,source);
 const module={exports:{}};vm.runInNewContext(embedded,{require,module});assert.equal(typeof module.exports.main,'function');
});
