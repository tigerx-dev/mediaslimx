"use strict";
/* Metadata-only enumeration. Excluded directories are rejected before readEntries,
   unsupported files before entry.file(). No file contents are opened here. */
window.MSXImportTree=(()=>{
 const media=/\.(jpe?g|png|webp|mp4|pdf)$/i;
 const limitMessages={
  files:"每个导入列表最多 200 个文件，请缩小范围或使用目录扫描",
  bytes:"单个导入列表最多 2 GiB，请缩小范围或使用目录扫描",
  entries:"目录项超过 20000 个，请缩小范围或使用目录扫描",
  depth:"导入目录超过 20 层，请改用目录扫描或缩小范围"
 };
 class ImportLimitError extends Error{
  constructor(kind,observed,allowed){
   super(limitMessages[kind]);this.name="ImportLimitError";
   this.code="import_limit";this.action="scan_directory";
   this.limit={kind,observed,allowed};
  }
 }
 // Stable metadata lets the UI offer an action without parsing translated text.
 // Limits are still enforced again by the service before reserving any files.
 function limitError(kind,observed,allowed){return new ImportLimitError(kind,observed,allowed);}
 function context(policy,controls){
  const files=[],notes=[],counts={hidden:0,excluded:0,unsupported:0,failed:0};
  const skip=new Set(policy.skip_dirs);let visited=0,total=0;
  function check(){if(controls.cancelled())throw new DOMException("已取消剩余导入","AbortError");}
  function tick(path){
   check();if(++visited>policy.max_entries)throw limitError("entries",visited,policy.max_entries);
   controls.progress(path,files.length);
  }
  function ignored(path,directory=false){
   const parts=path.split("/");
   if(parts.some(p=>p.startsWith("."))){counts.hidden++;return true;}
   const dirs=directory?parts:parts.slice(0,-1);
   if(dirs.some(p=>skip.has(p.normalize("NFC").toLowerCase()))){counts.excluded++;return true;}
   if(parts.length>(policy.max_depth+1)){throw limitError("depth",parts.length-1,policy.max_depth);}
   return false;
  }
  function append(file,relative){
   check();
   if(/\.pdf$/i.test(file.name)&&file.size>64*1024**2){counts.failed++;if(notes.length<20)notes.push(relative+"：PDF 超过 64 MiB 的首版文件限制");return;}
   if(!file.size||file.size>1024**3){counts.failed++;if(notes.length<20)notes.push(relative+"：文件需大于 0 且不超过 1 GiB");return;}
   if(files.length>=policy.files)throw limitError("files",files.length+1,policy.files);
   total+=file.size;if(total>policy.batch_bytes)throw limitError("bytes",total,policy.batch_bytes);
   files.push({file,relative_path:relative});
  }
  function finish(){
   const summary=[];
   if(counts.hidden)summary.push("隐藏项 "+counts.hidden);
   if(counts.excluded)summary.push("依赖、输出或备份目录项 "+counts.excluded);
   if(counts.unsupported)summary.push("不支持的扩展名 "+counts.unsupported);
   if(counts.failed)summary.push("无法读取或空/过大文件 "+counts.failed);
   if(summary.length)notes.unshift("已跳过："+summary.join("；"));
   return {files,notes,counts};
  }
  return {files,notes,counts,check,tick,ignored,append,finish};
 }
 async function collectEntries(roots,policy,controls){
  const c=context(policy,controls);
  async function walk(entry,parent=""){
   const relative=parent?parent+"/"+entry.name:entry.name;c.tick(relative);
   if(c.ignored(relative,entry.isDirectory))return;
   if(entry.isDirectory){
    const reader=entry.createReader();
    // Chromium batches directory results; keep reading until an empty batch.
    const seen=new Set();
    for(;;){
     c.check();let entries;
     try{entries=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));}
     catch(error){c.counts.failed++;if(c.notes.length<20)c.notes.push(relative+"：无法读取目录");return;}
     c.check();if(!entries.length)break;
     let fresh=0;for(const child of entries){if(seen.has(child.name))continue;seen.add(child.name);fresh++;await walk(child,relative);}
     if(!fresh)throw Error("目录读取返回重复条目，请重试或使用目录扫描");
    }
   }else if(entry.isFile){
    if(!media.test(entry.name)){c.counts.unsupported++;return;}
    try{const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));c.append(file,relative);}
    catch(error){if(error.name==="AbortError"||error.code==="import_limit")throw error;c.counts.failed++;if(c.notes.length<20)c.notes.push(relative+"：无法读取文件");}
   }else{c.counts.failed++;}
  }
  for(const entry of roots)await walk(entry);
  return c.finish();
 }
 async function collectFiles(files,policy,controls){
  const c=context(policy,controls);
  for(const file of files){
   const relative=file.webkitRelativePath||file.name;c.tick(relative);
   if(c.ignored(relative))continue;
   if(!media.test(file.name)){c.counts.unsupported++;if(!file.webkitRelativePath&&c.notes.length<20)c.notes.push(file.name+"：暂不支持此格式");continue;}
   c.append(file,relative);
   if(c.files.length%25===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  return c.finish();
 }
 return {collectEntries,collectFiles,limitError};
})();
