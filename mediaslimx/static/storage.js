"use strict";
/* Explicit private-copy maintenance. Deleting a task never calls this API. */
const storageState={version:0,previewVersion:0,busy:false,preview:null,opener:null,releaseOpener:null};
function storagePair(list,label,value,raw=false){
 const dt=el("dt",label),dd=el("dd",String(value));if(raw)dd.setAttribute("data-i18n-skip","");list.append(dt,dd);
}
function storageError(id,error){$(id).textContent=error.message||String(error);$(id).hidden=false;}
function storageMeta(label,value){const item=el("span");item.append(el("span",label)," ",el("strong",String(value)));return item;}
function renderStorage(data){
 const metrics=$("storage-metrics");metrics.replaceChildren();
 for(const [label,value]of [["实际占用",data.usage_complete?size(data.usage_bytes):"暂无法完整统计"],["配额占用",size(data.reserved_bytes)],["可用导入配额",size(Math.max(0,data.limit_bytes-data.reserved_bytes))]]){
  const item=el("div");storagePair(item,label,value);metrics.append(item);
 }
 $("storage-quota").max=data.limit_bytes;$("storage-quota").value=data.reserved_bytes;
 const list=$("storage-batches");list.replaceChildren();
 if(!data.batches.length){list.append(el("p","还没有导入副本；目录扫描不占用这里的空间。","storage-empty"));return;}
 for(const batch of data.batches){
  const row=el("article",undefined,"storage-batch"),content=el("div",undefined,"storage-batch-content");row.dataset.importId=batch.id;row.dataset.released=String(batch.state==="released");
  const heading=el("h4");
  if(batch.sample_files?.length){heading.textContent=batch.sample_files[0];heading.setAttribute("data-i18n-skip","");}
  else heading.append(el("span","导入批次")," ",el("span",batch.id.slice(0,8),"mono"));
  content.append(heading);
  const meta=el("div",undefined,"storage-batch-meta");
  meta.append(storageMeta("文件",batch.files),storageMeta(batch.usage_verified?"副本占用":"已确认占用",size(batch.bytes)),storageMeta("关联任务",batch.task_count),storageMeta("导入批次",batch.id.slice(0,8)));
  const time=el("time",new Date(batch.created*1000).toLocaleString(MSXI18n.language==="en"?"en-US":"zh-CN"));time.dateTime=new Date(batch.created*1000).toISOString();time.setAttribute("data-i18n-skip","");meta.append(time);content.append(meta);
  if(batch.state==="released")content.append(el("p","副本已释放；任务、报告和导出仍保留。","storage-batch-note"));
  else if(batch.protected_reason)content.append(el("p",batch.protected_reason,"storage-batch-note"));
  else if(batch.state==="release_failed")content.append(el("p","上次清理未完成；重新确认后可继续。","storage-batch-note"));
  else if(batch.sealed)content.append(el("p",batch.task_count?"历史副本用于原件预览；清理后仅保留结果预览。":"任务记录已删除；副本仍保留，可在这里单独释放。","storage-batch-note"));
  else content.append(el("p","尚未用于任务，清理后将移出当前待处理列表。","storage-batch-note"));
  row.append(content);
  if(batch.state==="released")row.append(el("span","已释放","storage-batch-state"));
  else{const release=el("button","释放副本","storage-batch-action");release.type="button";release.disabled=!batch.can_release;release.dataset.importId=batch.id;release.onclick=()=>prepareImportRelease(batch.id,release);row.append(release);}
  list.append(row);
 }
}
async function refreshStorage(){
 const version=++storageState.version;$("refresh-storage").disabled=true;$("storage-error").hidden=true;
 try{const data=await json("/api/imports/storage");if(version===storageState.version&&$("storage-dialog").open)renderStorage(data);}
 catch(error){if(version===storageState.version&&$("storage-dialog").open)storageError("storage-error",error);}
 finally{if(version===storageState.version)$("refresh-storage").disabled=false;}
}
function openStorage(opener=$("open-storage")){
 storageState.opener=opener;$("storage-feedback").hidden=true;$("storage-dialog").showModal();void refreshStorage();
}
$("open-storage").onclick=()=>openStorage();
$("refresh-storage").onclick=()=>void refreshStorage();
$("close-storage").onclick=()=>$("storage-dialog").close();
$("storage-dialog").addEventListener("close",()=>{storageState.version++;storageState.previewVersion++;storageState.opener?.focus();});
async function prepareImportRelease(id,opener){
 if(storageState.busy)return;
 const version=++storageState.previewVersion;storageState.busy=true;opener.disabled=true;$("storage-error").hidden=true;
 $("storage-feedback").textContent="正在校验副本，请稍候…";$("storage-feedback").hidden=false;
 try{
  const preview=await json("/api/imports/"+id+"/release-preview");
  if(version!==storageState.previewVersion||!$("storage-dialog").open)return;
  if(!preview.can_release)throw Error(preview.protected_reason||"此批副本当前不能清理，请刷新后重试。");
  storageState.preview=preview;storageState.releaseOpener=opener;
  const summary=$("release-import-summary");summary.replaceChildren();storagePair(summary,"导入批次",preview.id.slice(0,8),true);storagePair(summary,"文件",preview.files);storagePair(summary,"预计释放",size(preview.bytes));storagePair(summary,"关联任务",preview.task_count);
  if(preview.sample_files?.length)storagePair(summary,"文件示例",preview.sample_files.join("\n"),true);
  if(preview.snapshot_only_files)storagePair(summary,"旧副本按本次快照确认",preview.snapshot_only_files);
  const unexported=$("release-import-unexported");unexported.replaceChildren(el("span","未记录导出结果的副本")," ",el("strong",String(preview.unexported_files)),el("span"," 份；数量依据现存任务记录，不保证导出文件仍在。"));unexported.hidden=!preview.unexported_files;
  $("release-import-consent").checked=false;$("confirm-release-import").disabled=true;$("release-import-error").hidden=true;$("release-import-dialog").showModal();
 }catch(error){if(version===storageState.previewVersion&&$("storage-dialog").open)storageError("storage-error",error);}
 finally{storageState.busy=false;$("storage-feedback").hidden=true;if(opener.isConnected)opener.disabled=false;}
}
$("release-import-consent").onchange=()=>$("confirm-release-import").disabled=!$("release-import-consent").checked||storageState.busy;
for(const id of ["close-release-import","cancel-release-import"])$(id).onclick=()=>{if(!storageState.busy)$("release-import-dialog").close();};
$("release-import-dialog").addEventListener("cancel",event=>{if(storageState.busy)event.preventDefault();});
$("release-import-dialog").addEventListener("close",()=>{
 storageState.previewVersion++;storageState.preview=null;
 (storageState.releaseOpener?.isConnected?storageState.releaseOpener:$("refresh-storage")).focus();
});
$("confirm-release-import").onclick=async()=>{
 const preview=storageState.preview;if(storageState.busy||!preview||!$("release-import-consent").checked)return;
 storageState.busy=true;$("release-import-error").hidden=true;
 $("confirm-release-import").textContent="正在安全清理…";
 for(const id of ["close-release-import","cancel-release-import","confirm-release-import","release-import-consent"])$(id).disabled=true;
 try{
  const result=await json("/api/imports/"+preview.id+"/release",{method:"POST",body:{confirm:true,record_version:preview.record_version}});
  storageState.busy=false;$("release-import-dialog").close();
  const feedback=$("storage-feedback");feedback.replaceChildren(el("span",result.already_released?"副本此前已释放。":"已释放副本")," ",el("strong",size(result.released_bytes||0))," · ",el("span","导出与任务记录保留。"));feedback.hidden=false;
  if(importState.batch===preview.id){importState.batch=null;reset();}
  if(state.task?.import_id===preview.id)await openTask(state.task.id);
  await refreshUnusedImports();await refreshStorage();$("refresh-storage").focus();
 }catch(error){storageError("release-import-error",error);}
 finally{
  storageState.busy=false;for(const id of ["close-release-import","cancel-release-import","release-import-consent"])$(id).disabled=false;
  $("confirm-release-import").textContent="释放副本";
  // A changed/failing batch needs a new server preview and a new confirmation.
  $("release-import-consent").checked=false;$("confirm-release-import").disabled=true;
 }
};
document.addEventListener("mediaslimx-language",()=>{if($("storage-dialog").open&&!storageState.busy)void refreshStorage();});
