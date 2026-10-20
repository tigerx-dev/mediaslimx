/* Metadata-only import boundary checks: no large files, uploads, or media reads.
   Run with: node tests/import-limits-unit.cjs */
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const sandbox={window:{},DOMException,Error,Set,setTimeout};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../mediaslimx/static/import-tree.js"),"utf8"),sandbox);
const tree=sandbox.window.MSXImportTree;
const MiB=1024**2,GiB=1024**3;
const policy={skip_dirs:["node_modules","mediaslimx-export","mediaslimx-backup"],max_entries:20000,max_depth:20,files:200,batch_bytes:2*GiB};
const controls={cancelled:()=>false,progress:()=>{}};
let checks=0,contentsRead=0;
function media(name,size=1,relative=""){
 const file={name,size,webkitRelativePath:relative};
 // The collector must inspect only names, paths and sizes.
 for(const method of ["arrayBuffer","text","stream","slice"])
  file[method]=()=>{contentsRead++;throw Error("File contents must not be read");};
 return file;
}
function entry(file){return {name:file.name,isFile:true,isDirectory:false,file(resolve){resolve(file);}};}
function folder(name,children){return {name,isFile:false,isDirectory:true,createReader(){let read=false;return {readEntries(resolve){resolve(read?[]:(read=true,children));}};}};}
async function limited(promise,kind,observed,allowed){
 await assert.rejects(promise,error=>{
  assert.equal(error.name,"ImportLimitError");assert.equal(error.code,"import_limit");assert.equal(error.action,"scan_directory");
  assert.equal(error.limit.kind,kind);assert.equal(error.limit.observed,observed);assert.equal(error.limit.allowed,allowed);
  assert.match(error.message,/目录扫描/);return true;
 });checks++;
}
(async()=>{
 const files=Array.from({length:200},(_,i)=>media(i+".jpg"));
 assert.equal((await tree.collectFiles(files,policy,controls)).files.length,200);checks++;
 await limited(tree.collectFiles([...files,media("201.jpg")],policy,controls),"files",201,200);
 // Directory-entry collection must propagate the same error out of its per-file catch.
 await limited(tree.collectEntries([folder("photos",[...files,media("201.jpg")].map(entry))],policy,controls),"files",201,200);
 const exact=[media("a.mp4",GiB),media("b.mp4",GiB)];
 assert.equal((await tree.collectFiles(exact,policy,controls)).files.length,2);checks++;
 await limited(tree.collectFiles([...exact,media("extra.jpg")],policy,controls),"bytes",2*GiB+1,2*GiB);
 await limited(tree.collectEntries([folder("videos",[...exact,media("extra.jpg")].map(entry))],policy,controls),"bytes",2*GiB+1,2*GiB);
 const nonMedia=Array.from({length:20001},(_,i)=>media(i+".txt"));
 await limited(tree.collectFiles(nonMedia,policy,controls),"entries",20001,20000);
 const deep=Array.from({length:21},(_,i)=>"level"+i).join("/")+"/image.jpg";
 await limited(tree.collectFiles([media("image.jpg",1,deep)],policy,controls),"depth",21,20);
 let nested=entry(media("image.jpg"));for(let i=20;i>=0;i--)nested=folder("level"+i,[nested]);
 await limited(tree.collectEntries([nested],policy,controls),"depth",21,20);
 // Oversized PDFs are a per-file skip, while valid neighboring media stays usable.
 const mixed=[media("large.pdf",64*MiB+1),media("ok.jpg",20),media("at-limit.pdf",64*MiB)];
 for(const collected of [await tree.collectFiles(mixed,policy,controls),await tree.collectEntries([folder("mixed",mixed.map(entry))],policy,controls)]){
  assert.equal(collected.files.length,2);assert.equal(collected.counts.failed,1);
  assert.ok(collected.notes.some(note=>note.includes("large.pdf")&&note.includes("64 MiB")));checks++;
 }
 const invalid=await tree.collectFiles([media("zero.png",0),media("too-big.mp4",GiB+1),media("good.png",8)],policy,controls);
 assert.equal(invalid.files.length,1);assert.equal(invalid.counts.failed,2);checks++;
 // Exclusions are checked before opening directory entries or requesting File metadata.
 const forbiddenFolder=name=>({name,isDirectory:true,createReader(){throw Error("Excluded folder was opened");}});
 const codeFile={name:"private.py",isFile:true,file(){throw Error("Non-media file metadata was requested");}};
 const skipped=await tree.collectEntries([folder("root",[forbiddenFolder(".git"),forbiddenFolder("node_modules"),forbiddenFolder("mediaslimx-export"),forbiddenFolder("mediaslimx-backup"),codeFile,entry(media("safe.jpg"))])],policy,controls);
 assert.equal(skipped.files.length,1);assert.equal(skipped.counts.hidden,1);assert.equal(skipped.counts.excluded,3);assert.equal(skipped.counts.unsupported,1);checks++;
 await assert.rejects(tree.collectFiles([media("ok.jpg")],policy,{...controls,cancelled:()=>true}),error=>error.name==="AbortError");checks++;
 const helper=tree.limitError("files",201,200);assert.equal(helper.code,"import_limit");assert.equal(helper.limit.observed,201);checks++;
 assert.equal(contentsRead,0);checks++;
 console.log(JSON.stringify({checks,contentsRead,limits:["files","bytes","entries","depth"],ok:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
