import assert from 'node:assert/strict';
import esbuild from 'esbuild';
const bundle=await esbuild.build({entryPoints:['src/main.ts'],bundle:true,platform:'browser',format:'cjs',external:['obsidian'],write:false,logLevel:'silent'});
const mod={exports:{}};
class TFolder { constructor(path){this.path=path;} }
new Function('require','module','exports',bundle.outputFiles[0].text)(()=>({Plugin:class{},PluginSettingTab:class{},Platform:{isDesktopApp:true},Notice:class{},Setting:class{},TFolder}),mod,mod.exports);
const Plugin=mod.exports.default;
const deadline=(promise)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('serialized adapter queue timed out')),250))]);
function fixture(){
 let tail=Promise.resolve();const calls=[];const queue=job=>{const result=tail.then(job,job);tail=result;return result};
 const adapter={queue,getFullPath:p=>p,getRealPath:p=>p,_exists:async()=>true,reconcileDeletion:async(_real,p)=>{calls.push(['delete',p])},stat:p=>queue(async()=>({type:p.endsWith('/folder')?'folder':'file'})),reconcileFileInternal:async(_real,p)=>{calls.push(['reveal',p])},reconcileFolderCreation:async(_real,p)=>{calls.push(['folder',p])},listRecursive:async()=>{}};
 const plugin=new Plugin();plugin.settings={...plugin.settings};plugin.app={vault:{adapter,configDir:'.obsidian',setConfig(){}}};plugin.enableHiddenFiles();return {plugin,adapter,calls,queue};
}
const f=fixture();
await deadline(f.queue(()=>f.adapter.reconcileDeletion('.fixture','.fixture')));
await deadline(f.queue(async()=>true));
await deadline(f.plugin.disableHiddenFiles());
assert.ok(f.calls.some(([action,path])=>action==='reveal'&&path==='.fixture'),'safe hidden file actually revealed');
assert.ok(f.calls.some(([action,path])=>action==='delete'&&path==='.fixture'),'disable removes the temporary native-cache reveal');
for(const path of ['.git/config','.trash/file','.obsidian/private','.db.sqlite-wal']){
 const t=fixture();await deadline(t.queue(()=>t.adapter.reconcileDeletion(path,path)));assert.ok(t.calls.some(([a,p])=>a==='delete'&&p===path));await deadline(t.plugin.disableHiddenFiles());
}
const sidecar=fixture();sidecar.plugin.settings.showSqliteSidecars=true;
await deadline(sidecar.queue(()=>sidecar.adapter.reconcileDeletion('.db.sqlite-wal','.db.sqlite-wal')));await deadline(sidecar.plugin.disableHiddenFiles());assert.ok(sidecar.calls.some(([a])=>a==='reveal'));
const failure=fixture();failure.adapter.stat=()=>failure.queue(async()=>{throw new Error('file disappeared')});
const originalError=console.error;console.error=()=>{};
try{await deadline(failure.queue(()=>failure.adapter.reconcileDeletion('.gone','.gone')));await deadline(failure.plugin.disableHiddenFiles());}finally{console.error=originalError}
// A requested enable during disable must win after pending work drains.
const overlap=fixture();let release;
const gate=new Promise(resolve=>{release=resolve});
overlap.adapter.stat=()=>overlap.queue(async()=>{await gate;return {type:'file'}});
await deadline(overlap.queue(()=>overlap.adapter.reconcileDeletion('.overlap','.overlap')));
const stopping=overlap.plugin.disableHiddenFiles();overlap.plugin.enableHiddenFiles();release();
await deadline(stopping);
assert.ok(overlap.plugin.originalReconcileDeletion,'latest enable survives an in-flight disable');
assert.equal(overlap.plugin.stoppingReveals,false);
await deadline(overlap.plugin.disableHiddenFiles());
// Partial native-cache mutation must remain eligible for cleanup.
const partial=fixture();partial.adapter.stat=p=>partial.queue(async()=>({type:'folder'}));
partial.adapter.listRecursive=async()=>{throw new Error('folder listing failed')};
console.error=()=>{};
try{await deadline(partial.queue(()=>partial.adapter.reconcileDeletion('.folder','.folder')));await deadline(partial.plugin.disableHiddenFiles());}finally{console.error=originalError}
assert.ok(partial.calls.some(([a,p])=>a==='folder'&&p==='.folder'));
assert.ok(partial.calls.some(([a,p])=>a==='delete'&&p==='.folder'),'partial reveal is removed during disable');
// Native 1.15.1 only descends into folders that are absent from its cache.
// A root-only rescan therefore misses a hidden file in an existing folder.
const cached=fixture();let visible=false;
cached.plugin.app.vault.getAllLoadedFiles=()=>[new TFolder('existing')];
cached.adapter.listRecursive=async path=>{if(path==='existing')await cached.adapter.reconcileDeletion('existing/.file','existing/.file');};
cached.adapter.reconcileFileInternal=async()=>{await new Promise(resolve=>setTimeout(resolve,15));visible=true;};
const originalDelete=cached.plugin.originalReconcileDeletion;
cached.plugin.originalReconcileDeletion=async(...args)=>{visible=false;await originalDelete(...args);};
await deadline(cached.plugin.rescanHiddenFiles());
assert.equal(visible,true,'rescan waits for reveal in an already cached parent');
await deadline(cached.plugin.disableHiddenFiles());assert.equal(visible,false);
cached.plugin.enableHiddenFiles();await deadline(cached.plugin.rescanHiddenFiles());
assert.equal(visible,true,'disable/re-enable rescan revisits cached parent');
await deadline(cached.plugin.disableHiddenFiles());
// A newly revealed dotfolder can schedule children after the first pending
// snapshot was captured; rescan is complete only after those children finish.
const nested=fixture();let childVisible=false;
nested.plugin.app.vault.getAllLoadedFiles=()=>[new TFolder('existing')];
nested.adapter.stat=path=>nested.queue(async()=>({type:path.endsWith('.parent')?'folder':'file'}));
nested.adapter.listRecursive=async path=>{
 if(path==='existing')await nested.adapter.reconcileDeletion('existing/.parent','existing/.parent');
 if(path==='existing/.parent')await nested.adapter.reconcileDeletion('existing/.parent/.child','existing/.parent/.child');
};
nested.adapter.reconcileFileInternal=async()=>{await new Promise(resolve=>setTimeout(resolve,25));childVisible=true;};
await deadline(nested.plugin.rescanHiddenFiles());
assert.equal(childVisible,true,'rescan drains child work scheduled by a parent reveal');
assert.equal(nested.plugin.pendingReveals.size,0,'rescan leaves no pending child reveals');
await deadline(nested.plugin.disableHiddenFiles());
console.log('Serialized adapter queue, denylist, sidecar opt-in, read continuity and disable/error cleanup passed.');
