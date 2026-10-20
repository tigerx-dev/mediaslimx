"use strict";
const askConfirm = message => window.confirm(MSXI18n.t(message));
const $ = id => document.getElementById(id);
const state = {scan:null, task:null, selected:new Set(), timer:null, intent:0};
const labels = {ready:"支持",pending:"等待",processing:"处理中",committing:"正在提交",success:"成功",no_gain:"无收益",duplicate:"重复跳过",unsupported:"不支持",failed:"失败",cancelled:"取消",restored:"已恢复",restore_conflict:"恢复冲突",running:"处理中",cancelling:"取消中",completed:"已完成",interrupted:"已中断",restoring:"恢复中"};
let token = new URLSearchParams(location.hash.slice(1)).get("token") || sessionStorage.getItem("mediaslimx-token") || "";
if(token){sessionStorage.setItem("mediaslimx-token",token);history.replaceState(null,"",location.pathname);}
function showError(error){
 const message=typeof error==="string"?error:error.message;
 $("message").textContent=message;
 $("message").hidden=false;
}
const intakeGuidance={mode:"export",opener:null};
function clearIntakeGuidance(){
 $("intake-guidance").hidden=true;$("intake-guidance").dataset.state="idle";
}
function showIntakeGuidance(kind,details={},mode="export",moveFocus=true){
 intakeGuidance.mode=mode;clearError();
 const panel=$("intake-guidance"),detail=$("guidance-detail");
 if(panel.hidden&&kind!=="scanning")intakeGuidance.opener=document.activeElement;
 panel.dataset.state=kind;detail.replaceChildren();detail.removeAttribute("data-i18n-skip");
 $("guidance-scan").hidden=["quota","scanning","reading-directory","picking-directory"].includes(kind);
 $("guidance-storage").hidden=kind!=="quota";$("guidance-dismiss").hidden=["scanning","reading-directory"].includes(kind);
 $("guidance-dismiss").textContent=state.scan?"继续当前列表":"返回选择";
 if(kind==="reading-directory"){
  $("guidance-title").textContent="正在读取拖入目录";
  $("guidance-description").textContent="正在确认本机目录；当前列表和设置会保留。";
  detail.textContent="无需复制原文件，确认后直接扫描。";
 }else if(kind==="picking-directory"){
  $("guidance-title").textContent="正在选择本机目录";
  $("guidance-description").textContent="在系统窗口选中后直接扫描；若未看到窗口，请查看任务栏或取消选择。";
  detail.textContent="扫描不复制原件；仍需点击开始才优化。";
  $("guidance-dismiss").textContent="取消系统选择";
 }else if(kind==="directory-error"){
  $("guidance-title").textContent="无法读取拖入目录";
  $("guidance-description").textContent="当前列表和设置已保留。请重新拖入，或选择目录扫描。";
  detail.textContent=details.reason;
 }else if(kind==="scanning"){
  $("guidance-title").textContent="正在扫描所选目录";
  $("guidance-description").textContent="当前列表会保留至扫描成功；这里只检查文件，不会开始优化。";
  detail.textContent=details.path;detail.setAttribute("data-i18n-skip","");
 }else if(kind==="quota"){
  $("guidance-title").textContent="导入副本空间不足";
  $("guidance-description").textContent="本次未传入新文件，当前列表和设置已保留。请先查看副本占用，再确认是否清理。";
  detail.textContent="导入副本累计配额为 8 GiB。清理需主动确认，原件、导出和备份保留。";
 }else if(kind==="error"){
  $("guidance-title").textContent="目录扫描未完成";
  $("guidance-description").textContent="当前列表和设置已保留，可以重新选择目录或继续处理当前列表。";
  detail.textContent=details.reason;
 }else{
  $("guidance-title").textContent="这批媒体超过导入上限";
  $("guidance-description").textContent="本次未传入新文件，也不会截取部分处理。当前列表和设置已保留。";
  const label={files:"已发现媒体数",bytes:"单批容量上限",entries:"已检查目录项",depth:"目录层数"}[details.kind];
  if(details.kind!=="bytes"&&details.observed!==undefined)detail.append(el("span",label||"导入上限")," ",el("strong",String(details.observed))," · ");
  detail.append(el("span",details.kind==="bytes"?"单批容量上限":"单批上限")," ",el("strong",details.kind==="bytes"?"2 GiB":String(details.allowed??200)));
  detail.append(el("span","扫描使用运行设备上的目录；其他电脑的素材可缩小范围后导入。","guidance-device-note"));
 }
 panel.hidden=false;
 if(moveFocus)requestAnimationFrame(()=>{if(!panel.hidden){panel.scrollIntoView({block:"nearest",behavior:"auto"});$("guidance-title").focus({preventScroll:true});}});
}
function showImportFailure(error){
 if(error.code==="import_limit"){showIntakeGuidance("limit",error.limit);return true;}
 // The server remains authoritative, including reserved or incomplete copies
 // that are not all represented in the current scan. Map known API failures
 // here; display actions never depend on searching translated sentences.
 if(error.message==="每个导入列表最多 200 个文件"){
  showIntakeGuidance("limit",{kind:"files",allowed:200});return true;
 }
 if(error.message==="单个导入列表最多 2 GiB"){
  showIntakeGuidance("limit",{kind:"bytes",allowed:2*1024**3});return true;
 }
 if(error.message==="当前平台导入区达到 8 GiB 限制，请打开导入空间管理，确认后清理副本"){
  showIntakeGuidance("quota");return true;
 }
 return false;
}
function setConnection(message,connected){
 $("connection").querySelector(".connection-label").textContent=message;
 $("connection").setAttribute("aria-label",message);$("connection").title=message;
 $("connection").dataset.connected=String(connected);
}
function clearError(){$("message").hidden=true;}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls){n.className=cls;if(cls.split(" ").includes("mono")&&tag!=="dd")n.setAttribute("data-i18n-skip","");}return n;}
function size(n){if(!n)return "0 B";const i=Math.min(3,Math.floor(Math.log(n)/Math.log(1024)));return (n/1024**i).toFixed(i?1:0)+" "+["B","KB","MB","GB"][i];}
function pct(a,b){return b?((a/b)*100).toFixed(1)+"%":"0%";}
const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)");
let workspaceAnimation=null;
const settingsEditor={inert:[],closing:null};
function finishSettingsClose(restoreFocus){
 const panel=$("settings-section");
 for(const animation of settingsEditor.closing?.animations||[])animation.cancel();
 settingsEditor.closing=null;delete panel.dataset.closing;
 panel.dataset.expanded="false";panel.removeAttribute("role");panel.removeAttribute("aria-modal");panel.removeAttribute("aria-labelledby");
 $("toggle-settings").setAttribute("aria-expanded","false");
 $("toggle-settings").setAttribute("aria-label","展开参数设置");$("toggle-settings").title="展开参数设置";
 $("settings-toggle-label").textContent="展开设置";
 $("toggle-settings").querySelector("use").setAttribute("href","/static/icons.svg#expand");
 document.body.classList.remove("settings-editor-leaving","settings-editor-open");$("settings-backdrop").hidden=true;$("settings-placeholder").hidden=true;
 for(const [node,wasInert] of settingsEditor.inert)node.inert=wasInert;
 settingsEditor.inert=[];
 if(restoreFocus&&!panel.hidden)$("toggle-settings").focus();
}
function closeSettingsEditor(restoreFocus=true){
 const panel=$("settings-section");
 if(panel.dataset.expanded!=="true")return;
 if(settingsEditor.closing){if(!restoreFocus)finishSettingsClose(false);return;}
 document.dispatchEvent(new CustomEvent("mediaslimx-close-selects"));
 if(!restoreFocus||reducedMotion.matches||!panel.animate){finishSettingsClose(restoreFocus);return;}
 // Capture the live entry position so an early dismiss reverses without a jump.
 const backdrop=$("settings-backdrop"),panelStyle=getComputedStyle(panel),backdropStyle=getComputedStyle(backdrop);
 const fromPanel={transform:panelStyle.transform,opacity:panelStyle.opacity},fromShade=backdropStyle.opacity;
 panel.dataset.closing="true";document.body.classList.add("settings-editor-leaving");
 const animations=[
  panel.animate([fromPanel,{transform:"translateX(24px)",opacity:0}],{duration:160,easing:"cubic-bezier(.4,0,1,1)",fill:"forwards"}),
  backdrop.animate([{opacity:fromShade},{opacity:0}],{duration:140,easing:"ease-in",fill:"forwards"})
 ];
 const closing={animations};settingsEditor.closing=closing;
 Promise.all(animations.map(animation=>animation.finished.catch(()=>{}))).then(()=>{if(settingsEditor.closing===closing)finishSettingsClose(true);});
}
function openSettingsEditor(){
 const panel=$("settings-section");if(panel.hidden||panel.dataset.expanded==="true")return;
 document.dispatchEvent(new CustomEvent("mediaslimx-close-selects"));
 const placeholder=$("settings-placeholder");placeholder.style.height=panel.getBoundingClientRect().height+"px";placeholder.hidden=false;
 panel.dataset.expanded="true";panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");panel.setAttribute("aria-labelledby","settings-title");
 $("toggle-settings").setAttribute("aria-expanded","true");
 $("toggle-settings").setAttribute("aria-label","收起参数设置");$("toggle-settings").title="收起参数设置";
 $("settings-toggle-label").textContent="收起设置";
 $("toggle-settings").querySelector("use").setAttribute("href","/static/icons.svg#collapse");
 document.body.classList.add("settings-editor-open");$("settings-backdrop").hidden=false;
 panel.querySelector(".settings-scroll").scrollTop=0;
 const workbench=document.querySelector(".setup-workbench");
 settingsEditor.inert=[...document.querySelectorAll(".app-bar,.sidebar,main > :not(.setup-workbench),#scan-section")].filter(node=>node!==workbench&&node!==$("settings-backdrop")).map(node=>[node,node.inert]);
 for(const [node] of settingsEditor.inert)node.inert=true;
 $("toggle-settings").focus();
}
$("toggle-settings").onclick=()=>$("settings-section").dataset.expanded==="true"?closeSettingsEditor():openSettingsEditor();
$("settings-backdrop").onclick=()=>closeSettingsEditor();
document.addEventListener("keydown",event=>{
 if($("settings-section").dataset.expanded!=="true"||document.querySelector("dialog[open]"))return;
 if(settingsEditor.closing){if(event.key==="Tab"||event.key==="Escape")event.preventDefault();return;}
 if(event.key==="Escape"){
  if(event.defaultPrevented)return; // The focused select closes its own menu first.
  if(document.querySelector(".select-menu:not([hidden])"))return;
  event.preventDefault();closeSettingsEditor();return;
 }
 if(event.key!=="Tab")return;
 const focusable=[...$("settings-section").querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node=>!node.closest("[hidden]")&&node.getClientRects().length);
 if(!focusable.length)return;
 const first=focusable[0],last=focusable.at(-1);
 if(event.shiftKey&&(document.activeElement===first||!$("settings-section").contains(document.activeElement))){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&(document.activeElement===last||!$("settings-section").contains(document.activeElement))){event.preventDefault();first.focus();}
});
function step(n){
 if(n!==2)closeSettingsEditor(false);
 const changed=$("main").dataset.step!==String(n);
 $("main").dataset.step=String(n);
 for(let i=1;i<=4;i++){$("step-"+i).classList.toggle("current",i===n);$("step-"+i).classList.toggle("done",i<n);}
 if(!changed)return; // Polling the same task must never replay entry motion.
 workspaceAnimation?.cancel();workspaceAnimation=null;
 const actor=document.querySelector({1:"#empty-section",2:".setup-workbench",3:"#progress-section",4:"#results-section"}[n]);
 if(!reducedMotion.matches&&actor?.animate)
  workspaceAnimation=actor.animate([{opacity:.35},{opacity:1}],{duration:parseFloat(getComputedStyle(actor).getPropertyValue("--motion-context"))||180,easing:"cubic-bezier(.23,1,.32,1)"});
}
reducedMotion.addEventListener("change",()=>{if(reducedMotion.matches){workspaceAnimation?.cancel();workspaceAnimation=null;if(settingsEditor.closing)finishSettingsClose(true);}});
async function api(url,options={}){
 const headers={"X-MediaSlimX-Token":token,...options.headers};
 if(options.body!==undefined){headers["Content-Type"]="application/json";options.body=JSON.stringify(options.body);}
 const response=await fetch(url,{...options,headers});
 if(!response.ok){let detail;try{const b=await response.json();detail=typeof b.detail==="string"?b.detail:JSON.stringify(b.detail);}catch{detail="请求失败："+response.status;}throw Error(detail);}
 return response;
}
async function json(url,options){return (await api(url,options)).json();}
const listState={history:[],historyVersion:0,archiveKind:null,archiveVersion:0,clear:null};
const activeTask=t=>["running","cancelling","restoring"].includes(t.status);
const taskStatus=t=>t.status==="cancelled"&&t.stop_reason==="exit"?"已暂停":labels[t.status]||t.status;
const taskName=t=>t.source_label||t.root.replace(/[\\/]+$/,"").split(/[\\/]/).at(-1)||"任务";
function showTaskHeading(task=null){
 const name=$("workspace-title-name"),status=$("workspace-title-status");
 if(!task){name.removeAttribute("data-i18n-skip");name.removeAttribute("title");name.textContent="新建任务";status.hidden=true;status.textContent="";return;}
 name.textContent=taskName(task);name.title=task.root;
 if(task.source_kind==="import")name.removeAttribute("data-i18n-skip");else name.setAttribute("data-i18n-skip","");
 status.textContent=taskStatus(task);status.dataset.state=task.status;status.hidden=false;
}
let historyMenuLocked=false;
function historyMenu(open){$("history-menu").hidden=!open;$("history-menu-toggle").setAttribute("aria-expanded",String(open));}
$("history-organizer").addEventListener("pointerenter",event=>{if(event.pointerType==="mouse")historyMenu(true);});
$("history-organizer").addEventListener("pointerleave",event=>{if(event.pointerType==="mouse"&&!historyMenuLocked)historyMenu(false);});
$("history-menu-toggle").onclick=()=>{historyMenuLocked=!historyMenuLocked;historyMenu(historyMenuLocked);};
$("history-organizer").addEventListener("focusout",event=>{if(!$("history-organizer").contains(event.relatedTarget)&&!historyMenuLocked)historyMenu(false);});
document.addEventListener("pointerdown",event=>{if(!$("history-organizer").contains(event.target)){historyMenuLocked=false;historyMenu(false);}});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("history-menu").hidden){event.preventDefault();historyMenuLocked=false;historyMenu(false);$("history-menu-toggle").focus();}});
async function historyList(){
 const version=++listState.historyVersion;
 const [tasks,hidden]=await Promise.all([json("/api/tasks"),json("/api/tasks?hidden=true")]);
 if(version!==listState.historyVersion)return [];
 listState.history=tasks;$("history").replaceChildren();$("history-empty").hidden=tasks.length>0;$("history-count").textContent=String(tasks.length);
 $("clear-history").disabled=!tasks.some(t=>!t.pinned&&!activeTask(t));
  $("archived-history").textContent="已归档"+(hidden.length?" "+hidden.length:"");
  $("history-archive-count").textContent=String(hidden.length);$("history-archive-count").hidden=!hidden.length;
  const organizerHint=hidden.length?"整理任务 · 已归档 "+hidden.length:"整理任务";
  $("history-menu-toggle").title=organizerHint;$("history-menu-toggle").setAttribute("aria-label",organizerHint);
 $("archived-history").disabled=!hidden.length;
 for(const t of tasks){
  const row=el("div",undefined,"history-row"),b=el("button",undefined,"history-item"),pin=el("button",undefined,"icon-button list-pin");
  const parts=t.root.replace(/[\\/]+$/,"").split(/[\\/]/),name=taskName(t),parent=t.source_kind==="import"?"文件导入":parts.slice(0,-1).join(t.root.includes("\\")?"\\":"/")||t.root;
  const meta=el("small",undefined,"history-meta"),status=el("span",taskStatus(t),"history-meta-status"),location=el("span",parent,"history-meta-path mono");
  if(t.source_kind!=="import")location.setAttribute("data-i18n-skip","");
  meta.append(status,location);b.append(el("span",name),meta);
  if(t.source_kind!=="import")b.firstChild.setAttribute("data-i18n-skip","");
  b.title=t.root;b.setAttribute("aria-label",t.root);b.lastChild.id="task-status-"+t.id;b.setAttribute("aria-describedby",b.lastChild.id);
  b.dataset.taskId=t.id;b.dataset.active=String(state.task?.id===t.id);b.onclick=()=>openTask(t.id).catch(showError);
  pin.type="button";pin.dataset.pinId=t.id;pin.setAttribute("aria-label",(t.pinned?"取消固定任务 ":"固定任务 ")+t.id.slice(0,8));pin.setAttribute("aria-pressed",String(t.pinned));pin.title=t.pinned?"取消固定":"固定此任务，归档时保留";pin.append(iconElement("pin"));
  pin.onclick=async()=>{pin.disabled=true;try{await json("/api/tasks/"+t.id+"/pin",{method:"POST",body:{pinned:!t.pinned}});await historyList();document.querySelector('[data-pin-id="'+t.id+'"]')?.focus();}catch(error){showError(error);pin.disabled=false;}};
  row.dataset.pinned=String(t.pinned);row.append(b,pin);
  if(!t.pinned&&!activeTask(t)){
   const archive=el("button",undefined,"icon-button history-archive");archive.type="button";archive.dataset.archiveTaskId=t.id;archive.append(iconElement("archive"));
   archive.title="归档此任务（可从已归档找回）";archive.setAttribute("aria-label","归档任务 "+t.id.slice(0,8));
   archive.onclick=async()=>{
    archive.disabled=true;
    try{
     const result=await json("/api/tasks/clear-history",{method:"POST",body:{task_ids:[t.id]}});
     if(!result.cleared.includes(t.id))throw Error("任务状态已变化，请刷新后重试");
     await historyList();$("history-feedback").hidden=true;$("history-menu-toggle").focus();
    }catch(error){showError(error);archive.disabled=false;}
   };
   row.append(archive);
  }
  $("history").append(row);
 }
 return tasks;
}
async function requestListClear(kind){
 try{
  const items=kind==="task"?await json("/api/tasks"):folderState.shortcutItems||[];
  const eligible=items.filter(item=>!item.pinned&&(kind!=="task"||!activeTask(item)));
  if(!eligible.length)return;
  const pinned=items.filter(item=>item.pinned).length,active=kind==="task"?items.filter(activeTask).length:0;
  listState.clear={kind,keys:eligible.map(item=>kind==="task"?item.id:item.path),opener:kind==="task"?$("history-menu-toggle"):$("clear-directory-shortcuts")};
  $("clear-list-title").textContent=kind==="task"?"归档未固定任务记录":"归档未固定目录入口";
  $("clear-list-description").textContent="将移出 "+eligible.length+" 条；保留 "+pinned+" 条固定项"+(active?"、"+active+" 条进行中任务":"")+"。";
  $("clear-list-note").textContent=kind==="task"?"仅收起列表；任务、报告和备份保留，可随时恢复。":"归档仅收起快捷入口，不删除文件夹或改变允许范围；可随时从“已归档”恢复。";
  $("confirm-clear-list").textContent="归档这 "+eligible.length+" 条";$("clear-list-error").hidden=true;
  $("clear-list-dialog").showModal();
 }catch(error){showError(error);}
}
$("clear-history").onclick=()=>{historyMenuLocked=false;historyMenu(false);requestListClear("task");};
$("clear-directory-shortcuts").onclick=()=>requestListClear("directory");
$("cancel-clear-list").onclick=()=>$("clear-list-dialog").close();
$("clear-list-dialog").addEventListener("close",()=>listState.clear?.opener?.focus());
$("confirm-clear-list").onclick=async()=>{
 const context=listState.clear;if(!context)return;$("confirm-clear-list").disabled=true;
 try{
  const result=await json(context.kind==="task"?"/api/tasks/clear-history":"/api/directories/shortcuts/clear",{method:"POST",body:context.kind==="task"?{task_ids:context.keys}:{paths:context.keys}});
  $("clear-list-dialog").close();
  if(context.kind==="task"){await historyList();$("history-feedback").hidden=true;}
  else if($("folder-dialog").open){await browseFolder(folderState.path);$("folder-state").textContent="已归档 "+result.cleared.length+" 个快捷入口，允许范围未改变。";}
  if(context.opener.disabled)(context.kind==="task"?$("new-task"):$("close-folder")).focus();
 }catch(error){$("clear-list-error").hidden=false;$("clear-list-error").textContent=error.message;}
 finally{$("confirm-clear-list").disabled=false;}
};
async function openArchived(kind,opener){
 listState.archiveKind=kind;listState.archiveOpener=opener;$("list-archive-error").hidden=true;
 $("list-archive-title").textContent=kind==="task"?"已归档的任务记录":"已归档的目录入口";
 $("list-archive-dialog").showModal();await renderArchived();
}
async function renderArchived(){
 const kind=listState.archiveKind,version=++listState.archiveVersion;
 try{
  const items=await json(kind==="task"?"/api/tasks?hidden=true":"/api/directories/shortcuts?hidden=true");
  if(version!==listState.archiveVersion||!$("list-archive-dialog").open)return;
  $("list-archive-items").replaceChildren();
  if(!items.length)$("list-archive-items").append(el("p","没有已归档的记录。","muted"));
  for(const item of items){
   const row=el("div",undefined,"archive-row"),view=el("button",undefined,"archive-view"),restore=el("button","恢复到列表");
   const path=kind==="task"?item.root:item.path,parts=path.replace(/[\\/]+$/,"").split(/[\\/]/);
   const archiveName=el("strong",kind==="task"?(item.source_label||parts.at(-1)):parts.at(-1),"archive-name"),archivePath=el("span",path,"mono archive-path");
   archiveName.title=archiveName.textContent;archivePath.title=path;
   if(kind!=="task"||item.source_kind!=="import")archiveName.setAttribute("data-i18n-skip","");archivePath.setAttribute("data-i18n-skip","");
   view.append(archiveName,archivePath);
   if(kind==="task")view.append(el("small",new Date(item.created*1000).toLocaleString(MSXI18n.language==="en"?"en-US":"zh-CN")+" · "+taskStatus(item)));
   view.onclick=async()=>{$("list-archive-dialog").close();if(kind==="task")await openTask(item.id).catch(showError);else await browseFolder(item.path);};
   view.title=kind==="task"?"查看结果，不改变列表状态":"浏览此已允许目录";
   restore.onclick=async()=>{
    restore.disabled=true;
    try{
     await json(kind==="task"?"/api/tasks/"+item.id+"/restore-history":"/api/directories/shortcuts/restore",{method:"POST",body:kind==="task"?{}:{path:item.path}});
     if(kind==="task")await historyList();else if($("folder-dialog").open)await browseFolder(folderState.path);
     const remaining=await renderArchived();
     if(remaining===0)$("list-archive-dialog").close();
     else $("close-list-archive").focus();
    }catch(error){$("list-archive-error").hidden=false;$("list-archive-error").textContent=error.message;restore.disabled=false;}
   };
   row.append(view);
   if(kind==="task"){
    const remove=el("button","删除记录","quiet delete-record-button");
    remove.type="button";remove.dataset.deleteTaskId=item.id;remove.title="彻底删除这条任务记录";
    remove.disabled=item.pinned||activeTask(item);
    remove.onclick=()=>requestRecordDelete(item,remove);
    row.append(remove);
   }
   row.append(restore);$("list-archive-items").append(row);
  }
  return items.length;
 }catch(error){if(version===listState.archiveVersion&&$("list-archive-dialog").open)$("list-archive-items").replaceChildren(el("p",error.message,"bad"));}
}
// Record deletion never calls a file cleanup or media restore endpoint.
const recordDeletion={version:0,context:null,busy:false};
async function requestRecordDelete(item,opener){
 const version=++recordDeletion.version;opener.disabled=true;$("list-archive-error").hidden=true;
 try{
  const preview=await json("/api/tasks/"+item.id+"/deletion-preview");
  if(version!==recordDeletion.version||!$("list-archive-dialog").open)return;
  recordDeletion.context={id:item.id,preview,opener};
  $("delete-record-context").textContent=item.root+"\n"+new Date(item.created*1000).toLocaleString(MSXI18n.language==="en"?"en-US":"zh-CN")+" · "+item.id.slice(0,8);
  $("delete-record-impact").replaceChildren();
  for(const [label,count] of [["任务文件",preview.entry_count],["结果文件",preview.result_count],["备份文件",preview.backup_count]]){
   const line=el("li");line.append(el("span",label),el("strong",String(count)));$("delete-record-impact").append(line);
  }
  $("delete-record-warning").textContent=preview.backup_count
   ? "删除后，此任务在工具内的 CSV 报告导出、预览和备份恢复入口将不可用。原有备份文件不删除，但需自行定位并手动恢复；已保存的报告不受影响。"
   : "删除后，此任务在工具内的 CSV 报告导出、预览和恢复入口将不可用。此任务未记录备份；已保存的报告文件不受影响。";
  $("delete-record-confirm").checked=false;$("confirm-delete-record").disabled=true;
  $("delete-record-error").hidden=true;
  $("delete-record-dialog").showModal();
  document.querySelector(".delete-record-content").scrollTop=0;
 }catch(error){
  if(version===recordDeletion.version&&$("list-archive-dialog").open){
   $("list-archive-error").hidden=false;$("list-archive-error").textContent=error.message;
  }
 }finally{if(opener.isConnected)opener.disabled=false;}
}
function syncRecordDeleteConsent(){
 $("confirm-delete-record").disabled=recordDeletion.busy||!$("delete-record-confirm").checked;
}
$("delete-record-confirm").addEventListener("change",syncRecordDeleteConsent);
for(const id of ["close-delete-record","cancel-delete-record"])$(id).onclick=()=>{
 if(!recordDeletion.busy)$("delete-record-dialog").close();
};
$("delete-record-dialog").addEventListener("cancel",event=>{if(recordDeletion.busy)event.preventDefault();});
$("delete-record-dialog").addEventListener("close",()=>{
 recordDeletion.version++;
 const opener=recordDeletion.context?.opener;
 if($("list-archive-dialog").open)(opener?.isConnected?opener:$("close-list-archive")).focus();
});
$("list-archive-dialog").addEventListener("close",()=>{
 recordDeletion.version++;
 if($("delete-record-dialog").open&&!recordDeletion.busy)$("delete-record-dialog").close();
});
$("confirm-delete-record").onclick=async()=>{
 const context=recordDeletion.context;
 if(recordDeletion.busy||!context||!$("delete-record-dialog").open||!$("delete-record-confirm").checked)return;
 recordDeletion.busy=true;syncRecordDeleteConsent();$("delete-record-error").hidden=true;
 for(const id of ["close-delete-record","cancel-delete-record","delete-record-confirm"])$(id).disabled=true;
 let deleted=false;
 try{
  await json("/api/tasks/"+context.id+"/delete-record",{method:"POST",body:{confirm:true,record_version:context.preview.record_version}});
  deleted=true;
  // A result for a removed record must not remain actionable underneath the archive.
  if(state.task?.id===context.id)reset();
  await historyList();
  await renderArchived();
  $("history-feedback").hidden=false;$("history-feedback").textContent="已彻底删除任务记录；原件、导出、备份与导入原始副本均保留。";
 }catch(error){
  const notice=deleted?$("list-archive-error"):$("delete-record-error");
  notice.hidden=false;notice.textContent=deleted?"记录已删除，但列表刷新失败，请重新打开归档列表。":error.message;
  $("delete-record-confirm").checked=false;
 }finally{
  recordDeletion.busy=false;
  for(const id of ["close-delete-record","cancel-delete-record","delete-record-confirm"])$(id).disabled=false;
  syncRecordDeleteConsent();
  if(deleted){
   $("delete-record-dialog").close();
   $("close-list-archive").focus();
  }
 }
};

$("archived-history").onclick=()=>{historyMenuLocked=false;historyMenu(false);openArchived("task",$("history-menu-toggle"));};
$("archived-directory-shortcuts").onclick=()=>openArchived("directory",$("archived-directory-shortcuts"));
$("close-list-archive").onclick=()=>$("list-archive-dialog").close();
$("list-archive-dialog").addEventListener("close",()=>{listState.archiveVersion++;const opener=listState.archiveOpener;(!opener||opener.disabled?(listState.archiveKind==="task"?$("new-task"):$("close-folder")):opener).focus();});

function reset(){
 if(importState.busy){showError("请先取消或等待文件导入完成");return;}
 closeSettingsEditor(false);
 clearIntakeGuidance();
 releaseUnusedImport();sourceMode(false);$("mode").value="export";$("mode").dispatchEvent(new Event("change"));void refreshUnusedImports().catch(showError);
 state.intent++;for(const item of document.querySelectorAll("#history .history-item"))item.dataset.active="false";clearTimeout(state.timer);state.task=null;state.scan=null;state.selected.clear();
 showTaskHeading();
 for(const id of ["scan-section","settings-section","progress-section","results-section"])$(id).hidden=true;
 $("directory-section").hidden=false;$("empty-section").hidden=false;clearError();$("resize-keep").checked=true;syncSizeControls();step(1);
}
function syncSizeControls(){updateTaskPlan();}
function selectedEntries(){return (state.scan?.entries||[]).filter(e=>state.selected.has(e.id));}
function onlyPdfSelected(){const entries=selectedEntries();return !!entries.length&&entries.every(e=>e.kind==="document");}
function updateTaskPlan(){
 const entries=selectedEntries(),hasPdf=entries.some(e=>e.kind==="document"),pdfOnly=onlyPdfSelected();
 const fit=$("resize-fit").checked&&!pdfOnly,mode=$("mode").value;
 const entry=entries.find(e=>e.info&&e.kind!=="document")||entries.find(e=>e.info);
 $("quality-settings").disabled=pdfOnly;$("size-settings").disabled=pdfOnly;
 $("resize-fields").hidden=!fit;
 for(const id of ["max-width","max-height"])$(id).disabled=!fit;
 $("pdf-settings-note").hidden=!hasPdf;$("plan-pdf-note").hidden=!hasPdf;
 $("mode").querySelector('option[value="overwrite"]').disabled=hasPdf;
 $("mode").dispatchEvent(new Event("mediaslimx-select-sync"));
 $("start-button").disabled=!entries.length||importState.busy||(hasPdf&&mode==="overwrite");
 const width=$("max-width").value?Number($("max-width").value):null,height=$("max-height").value?Number($("max-height").value):null;
 if(fit){
  if(!width&&!height)$("resize-preview").textContent="像素上限，至少填一边；另一边自动按比例计算。";
  else if(entry&&$("max-width").validity.valid&&$("max-height").validity.valid){
   const i=entry.info,ratio=Math.min(1,(width||i.width)/i.width,(height||i.height)/i.height);
   let w=Math.max(1,Math.floor(i.width*ratio)),h=Math.max(1,Math.floor(i.height*ratio));
   if(entry.kind==="video"){w=Math.max(2,Math.floor(w/2)*2);h=Math.max(2,Math.floor(h/2)*2);}
   $("resize-preview").textContent="所选示例 "+entry.relative+"："+i.width+"×"+i.height+" → "+w+"×"+h+"；按像素取整，不裁切。";
  }else $("resize-preview").textContent="请填写 2–32768 的整数；另一边自动按比例计算。";
 }
 const effects={
  export:"原文件保持原位，优化结果另存到新任务目录。",
  backup:"先复制原件到备份目录，再将验证通过且更小的结果写回原路径；不移动原件。",
  overwrite:"优化成功后替换原路径文件，不保留原件，无法恢复。"
 };
 $("plan-effect").textContent=(pdfOnly?"PDF 保守结构压缩，页面尺寸与图像质量不变。":fit?"压缩并尝试等比缩小。":"仅压缩，保持原尺寸。")+effects[mode];
 $("plan-no-gain").textContent=fit?"若结果没有变小，仍保留原文件及原尺寸；这不是强制改尺寸工具。":"无收益保留原件；导出模式复制原件。";
 const preset=document.querySelector('input[name="preset"]:checked').value;
 const presetNames={quality:"画质优先",balanced:"均衡",small:"体积优先"};
 const presetNotes={quality:"更保守地压缩",balanced:"兼顾画质与体积",small:"更明显的画质取舍"};
 const modeNames={export:"另存结果 · 原件保留",backup:"备份原件 · 原位更新",overwrite:"直接覆盖 · 无法恢复"};
 $("plan-summary").textContent=pdfOnly?"PDF 结构压缩 · 页面不变":presetNames[preset]+" · "+(fit?"压缩并等比缩小":"保持原尺寸");
 $("plan-mode").textContent=modeNames[mode];
 $("plan-compact").textContent=[entries.length+" 个文件",{export:"导出",backup:"先备份",overwrite:"无备份覆盖"}[mode],pdfOnly?"PDF 结构压缩":presetNames[preset],pdfOnly?"页面不变":fit?"等比缩小":"原尺寸"].join(" · ");
 $("plan-preset").textContent=pdfOnly?"PDF 使用同一保守策略，画质预设不适用。":presetNames[preset]+" · "+presetNotes[preset];
 $("plan-dimensions").textContent=pdfOnly?"PDF 页面尺寸不变。":fit
  ? "压缩并等比缩小"+" · "+(width||height ? "最大宽度："+(width||"不限")+"；最大高度："+(height||"不限")+"。":"像素上限，至少填一边；另一边自动按比例计算。")
  : "仅压缩，保持原尺寸";
 $("plan-size-example").hidden=!fit;
 $("plan-size-example").textContent=fit?MSXI18n.sourceText($("resize-preview")):"";
 $("plan-selection").textContent=entries.length+" 个文件 · "+size(entries.reduce((n,e)=>n+e.size,0));
 $("plan-formats").textContent=[...new Set(entries.map(e=>e.info?.format).filter(Boolean))].join(" / ")||"尚未选择媒体";
 const imported=state.scan?.source_kind==="import";
 $("plan-source-note").textContent=imported
  ? "使用当前服务收到的副本；浏览器中的原文件保持不变，无法读取其原始绝对路径。"
  : "仅处理当前勾选的媒体；以下以首个所选文件说明实际目录结构。";
 $("plan-name-example").textContent=entry?entry.relative:"";
 $("plan-recovery").textContent={
  export:"原件保持原位；需要时可直接使用原件。每次导出使用独立任务目录。",
  backup:"仅在需要替换时复制原件备份，再写入验证通过且更小的结果。任务完成后可恢复；恢复前检查修改冲突。",
  overwrite:"未保留原件，无法恢复，也无法提供真实的前后对比。"
 }[mode];
 $("plan-recovery").classList.toggle("bad",mode==="overwrite");
 $("plan-recovery").classList.toggle("muted",mode!=="overwrite");
 const root=state.scan?.root||"",sep=root.includes("\\")?"\\":"/",relative=(entry?.relative||"相对路径").replace(/[\\/]/g,sep);
 const join=(...parts)=>parts.map(p=>String(p).replace(/[\\/]+$/,"")).join(sep);
 const rows=[[imported?"处理副本示例":"原文件示例",join(root||"原目录",relative)]];
 if(mode==="export")rows.push(["结果位置预览",join($("output-path").value.trim()||"输出根目录","本次任务目录",relative)]);
 else{
  rows.push(["结果位置",join(root||"原目录",relative)]);
  if(mode==="backup")rows.push(["原件备份位置预览",join($("backup-path").value.trim()||"备份根目录","本次任务目录",relative)]);
 }
 $("plan-paths").replaceChildren();
 for(const [label,value] of rows)$("plan-paths").append(el("dt",label),el("dd",value));
 $("plan-directory-note").hidden=mode==="overwrite";
 $("start-count").textContent=state.selected.size+" 个文件";
}

let taskPlanOpener=null;
function openTaskPlan(opener){
 updateTaskPlan();taskPlanOpener=opener;
 document.dispatchEvent(new CustomEvent("mediaslimx-close-selects"));
 if(!$("task-plan-dialog").open)$("task-plan-dialog").showModal();
 document.querySelector(".task-plan-content").scrollTop=0;
}
$("review-task-plan").onclick=()=>openTaskPlan($("review-task-plan"));
for(const id of ["close-task-plan","return-task-settings"])$(id).onclick=()=>$("task-plan-dialog").close();
$("task-plan-dialog").addEventListener("close",()=>taskPlanOpener?.focus());

function syncSelectionType(){
 const picker=$("selection-type"),ready=(state.scan?.entries||[]).filter(e=>e.status==="ready");
 let exact="";
 for(const option of [...picker.options].slice(1)){
  // Use inspected media format, never a guessed filename or unsupported entry.
  const group=ready.filter(e=>e.info?.format?.toUpperCase()===option.value);
  option.disabled=!group.length;
  if(group.length===state.selected.size&&group.length&&group.every(e=>state.selected.has(e.id)))exact=option.value;
 }
 picker.value=exact;
 picker.dispatchEvent(new Event("mediaslimx-select-sync"));
}
$("selection-type").onchange=()=>{
 const format=$("selection-type").value;if(!format||!state.scan)return;
 state.selected=new Set(state.scan.entries.filter(e=>e.status==="ready"&&e.info?.format?.toUpperCase()===format).map(e=>e.id));
 renderScan();
};
function updateSelection(){
 syncSelectionType();const n=state.selected.size;$("selection-count").textContent="已选 "+n+" 项";$("start-button").disabled=!n||importState.busy;updateTaskPlan();
}
function renderScan(){
 const scan=state.scan;const total=scan.entries.reduce((n,e)=>n+e.size,0);
 $("scan-summary").textContent=scan.entries.length+" 个候选 · "+size(total);
 $("scan-notice").textContent=scan.source_kind==="import"?"已验证当前服务收到的副本；"+scan.warnings.join("；")+" 按原大小从大到小显示。":"非媒体 "+scan.non_media+" 项（未读取内容），排除目录 "+scan.skipped_dirs+" 个，隐藏文件 "+(scan.skipped_files||0)+" 项。"+(scan.warnings.length?scan.warnings.join("；"):"")+" 按原大小从大到小显示。";
 $("scan-body").replaceChildren();
 if(!scan.entries.length){const tr=el("tr");const td=el("td","没有找到媒体候选，请检查目录、允许范围和排除规则。");td.colSpan=5;tr.append(td);$("scan-body").append(tr);}
 for(const e of [...scan.entries].sort((a,b)=>b.size-a.size)){
  const tr=el("tr"),select=el("td"),box=el("input");box.type="checkbox";box.disabled=e.status!=="ready";box.checked=state.selected.has(e.id);box.setAttribute("aria-label","选择 "+e.relative);
  box.onchange=()=>{box.checked?state.selected.add(e.id):state.selected.delete(e.id);updateSelection();};select.append(box);
  // This list has one row action: select/deselect. Delegate through the native
  // checkbox so pointer and keyboard changes share the same update path.
  if(!box.disabled)tr.classList.add("selectable");
  tr.onclick=event=>{
   if(box.disabled||event.target.closest("input,label,button,a,select,textarea,[contenteditable]"))return;
   // Let a dragged text selection remain copyable without toggling the row.
   if(window.getSelection()?.toString().trim())return;
   box.click();
  };
  const info=e.info?(e.kind==="document"?"PDF · "+e.info.pages+" 页":e.info.format+" · "+e.info.width+"×"+e.info.height):"待支持";
  const status=el("td",labels[e.status]||e.status);if(e.reason)status.append(el("span",e.reason,"reason"));
  tr.append(select,el("td",e.relative,"mono"),el("td",info),el("td",size(e.size)),status);$("scan-body").append(tr);
 }
 updateSelection();
}
async function scanDirectory(path,nextMode=null,options={}){
 if(importState.busy)return;
 clearError();const intent=++state.intent,swapping=nextMode!==null;
 const locks=["clear-import","back-directory","add-import-files","add-import-folder","new-task","choose-import-files","choose-import-folder","import-to-backup","empty-scan-directory"];
 if(swapping){importState.busy=true;for(const id of locks)$(id).disabled=true;$("start-button").disabled=true;showIntakeGuidance("scanning",{path},nextMode,!options.passive);}
 else clearIntakeGuidance();
 $("scan-button").disabled=true;$("scan-button").textContent="正在检查媒体…";
 try{
  const scanned=await json("/api/scans",{method:"POST",body:{path}});if(intent!==state.intent)return;
  if(swapping){
   // Only a successful scan replaces the visible intake. Existing imported
   // copies remain for explicit storage cleanup; no automatic discard occurs.
   importState.batch=null;sourceMode(false);$("mode").value=nextMode;$("mode").dispatchEvent(new Event("change"));
   $("directory-section").hidden=false;
   $("media-path").value=path;clearIntakeGuidance();void refreshUnusedImports().catch(showError);
  }
  closeSettingsEditor(false);
  state.scan=scanned;
  state.selected=new Set(state.scan.entries.filter(e=>e.status==="ready").map(e=>e.id));state.task=null;clearTimeout(state.timer);
  showTaskHeading();
  const root=state.scan.root,sep=root.includes("\\")?"\\":"/";
  $("output-path").value=root+sep+"mediaslimx-export";$("backup-path").value=root+sep+"mediaslimx-backup";
  for(const id of ["scan-section","settings-section"])$(id).hidden=false;for(const id of ["empty-section","progress-section","results-section"])$(id).hidden=true;
  step(2);renderScan();return scanned;
 }catch(error){if(swapping)showIntakeGuidance("error",{reason:error.message},nextMode);else showError(error);}
 finally{
  if(swapping){importState.busy=false;for(const id of locks)$(id).disabled=false;if(state.scan)updateSelection();}
  $("scan-button").disabled=false;$("scan-button").textContent="扫描目录";
 }
}
$("scan-form").onsubmit=event=>{
 event.preventDefault();void scanDirectory($("media-path").value.trim());
};
$("select-all").onclick=()=>{state.selected=new Set(state.scan.entries.filter(e=>e.status==="ready").map(e=>e.id));renderScan();};
$("select-none").onclick=()=>{state.selected.clear();renderScan();};
$("mode").onchange=()=>{const m=$("mode").value;$("backup-in-place").checked=m==="backup";$("output-field").hidden=m!=="export";$("backup-field").hidden=m!=="backup";$("overwrite-field").hidden=m!=="overwrite";$("overwrite-confirm").checked=false;updateTaskPlan();};
$("backup-in-place").onchange=()=>{
 $("mode").value=$("backup-in-place").checked?"backup":"export";
 $("mode").dispatchEvent(new Event("change"));
};
$("task-form").onsubmit=async event=>{
 event.preventDefault();if(importState.busy)return;clearError();$("start-button").disabled=true;
 try{
  const mode=$("mode").value,fit=$("resize-fit").checked&&!onlyPdfSelected();
  if(fit&&!$("max-width").value&&!$("max-height").value)throw Error("选择等比缩小时，请至少填写一个尺寸上限");
  if(mode==="overwrite"&&selectedEntries().some(e=>e.kind==="document"))throw Error("PDF 不允许无备份覆盖；请选择导出至新目录或备份后覆盖");
  if(mode==="overwrite"&&!$("overwrite-confirm").checked)throw Error("请明确确认直接覆盖无备份、不可恢复");
  const result=await json("/api/tasks",{method:"POST",body:{scan_id:state.scan.id,selected:[...state.selected],preset:document.querySelector('input[name="preset"]:checked').value,max_width:fit&&$("max-width").value?Number($("max-width").value):null,max_height:fit&&$("max-height").value?Number($("max-height").value):null,mode,output:mode==="export"?$("output-path").value.trim():null,backup:mode==="backup"?$("backup-path").value.trim():null,confirm:$("overwrite-confirm").checked}});
  if(state.scan.source_kind==="import")importState.batch=null;
  await openTask(result.id);await historyList();
 }catch(error){showError(error);}finally{updateSelection();}
};
async function openTask(id,intent=null){
 if(importState.busy){showError("请先取消或等待文件导入完成");return;}
 closeSettingsEditor(false);
 if(intent===null)intent=++state.intent;
 clearTimeout(state.timer);clearError();const previousTaskId=state.task?.id,wasActive=state.task&&state.task.id===id&&["running","cancelling","restoring"].includes(state.task.status);const nextTask=await json("/api/tasks/"+id);if(intent!==state.intent)return;state.task=nextTask;
 showTaskHeading(nextTask);
 if(previousTaskId!==id){$("result-folder-feedback").hidden=true;$("result-root").open=false;}
 for(const item of document.querySelectorAll("#history .history-item"))item.dataset.active=String(item.dataset.taskId===id);
 $("directory-section").hidden=true;$("scan-section").hidden=true;$("settings-section").hidden=true;$("empty-section").hidden=true;
 const active=["running","cancelling","restoring"].includes(state.task.status);
 $("progress-section").hidden=!active;$("results-section").hidden=false;step(active?3:4);
 if(active){
  const t=state.task,done=t.entries.filter(e=>!["pending","processing","committing"].includes(e.status)).length;
  $("progress").max=t.entries.length||1;$("progress").value=done;
  $("progress-title").textContent="处理进度";$("current-file").textContent=t.current||"准备任务…";
  $("progress-count").textContent=done+" / "+t.entries.length+" 项 · 错误 "+t.entries.filter(e=>e.status==="failed").length;
  $("progress-saved").textContent="实际节省 "+size(t.entries.reduce((n,e)=>n+Math.max(0,e.size-e.result_size),0));
  $("cancel-button").disabled=t.status==="cancelling";$("cancel-button").textContent=t.status==="cancelling"?"等待安全边界…":"取消剩余任务";
  state.timer=setTimeout(()=>openTask(id,intent).catch(showError),1000);
 }
 renderResults();
 if(wasActive&&!active)await historyList();
}
function renderResults(){
 const t=state.task;if(!t)return;
 $("result-title").textContent="结果明细";
 const sep=t.root.includes("\\")?"\\":"/",taskFolder=root=>root.replace(/[\\/]+$/,"")+sep+(t.folder_name||t.id);
 const hasResult=t.entries.some(e=>e.result_fp),hasBackup=t.entries.some(e=>e.backup_fp);
 const mode={export:"导出 · 保留原件",backup:"原位优化 · 先备份",overwrite:"原位优化 · 无备份"}[t.mode];
 const resultPath=t.mode==="export"?taskFolder(t.output_root):t.root;
 $("result-context").replaceChildren(el("strong",mode));
 if(t.source_label)$("result-context").append(el("span",t.source_label,"result-mode-source"));
 $("result-location-brief-label").textContent=t.mode==="export"&&!hasResult?"计划结果目录":"结果目录";
 $("result-location-brief-path").textContent=resultPath;
 $("result-location-brief-path").title=resultPath;
 $("result-paths").replaceChildren();
 const location=(label,value,note,slot=null,available=false,raw=true)=>{
  const row=el("div",undefined,"result-location"),description=el("dd",undefined,"result-location-body");
  description.append(el("span",value,raw?"mono result-location-value":"muted result-location-value"));
  description.append(el("span",note,"result-location-note"));
  if(slot&&available&&state.environment?.open_task_folder===true){
   const button=el("button","打开","result-location-open");button.type="button";button.dataset.folderSlot=slot;
   button.setAttribute("aria-label","打开"+label);description.append(button);
  }
  row.append(el("dt",label),description);$("result-paths").append(row);
 };
 if(t.source_kind==="import")location(t.import_copies_released?"导入副本目录（已清理）":"导入副本目录",t.root,t.import_copies_released?"服务端副本已清理；导出结果仍保留。":"这是服务端收到的副本，不是原文件路径。","source",!t.import_copies_released);
 else location("来源目录",t.root,t.mode==="export"?"原件留在这里，导出不会改动原件。":t.mode==="backup"?"成功项已在这里由优化结果替换；原件另存备份。":"成功项已在这里由优化结果替换；没有备份。","source",true);
 location(t.mode==="export"&&!hasResult?"计划结果目录":"结果目录",resultPath,t.mode==="export"?hasResult?"本次导出文件按原相对目录保存在这里。":"任务位置已确定，尚无可查看的结果。":"优化成功的文件写回来源目录。","result",hasResult);
 if(t.mode==="backup")location(hasBackup?"备份目录":"计划备份目录",taskFolder(t.backup_root),hasBackup?"替换前的原件保存在这里，可按任务恢复。":"仅成功替换的文件会生成备份；目前没有备份。","backup",hasBackup);
 if(t.mode==="overwrite")location("备份目录","未创建","无备份，无法从工具恢复原件。",null,false,false);
 const resume=$("resume-summary"),remaining=t.entries.filter(e=>e.status==="cancelled"&&e.source_fp).length;
 if(resume.previousElementSibling!==$("result-root"))$("result-root").after(resume);
 resume.hidden=!(remaining&&["cancelled","interrupted"].includes(t.status));
 if(!resume.hidden){
  $("resume-title").textContent=t.status==="interrupted"?"上次任务意外中断":t.stop_reason==="exit"?"已保留上次进度":"任务已停止";
  $("resume-description").replaceChildren(el("span","已完成项目保留。剩余 "),document.createTextNode(String(remaining)),el("span"," 项；点击后逐项核对原件，再继续处理。"));
  $("resume-task").disabled=false;
 }
 const original=t.entries.reduce((n,e)=>n+e.size,0),result=t.entries.reduce((n,e)=>n+e.result_size,0),saved=original-result;
 $("metrics").replaceChildren();
 for(const [name,value,cls] of [["原总体积",size(original),""],["结果总体积",size(result),""],["实际节省",size(Math.max(0,saved)),"green"],["节省比例",pct(saved,original),"green"]]){
  const m=el("div");m.append(el("div",name,"metric-label"),el("div",value,"metric-value "+cls));$("metrics").append(m);
 }
 const counts={};for(const e of t.entries)counts[e.status]=(counts[e.status]||0)+1;
 $("status-counts").textContent=Object.entries(counts).map(([k,n])=>(labels[k]||k)+" "+n).join(" · ");
 const active=["running","cancelling","restoring"].includes(t.status);
 $("restore-all").hidden=t.mode!=="backup";$("restore-all").disabled=active||!t.entries.some(e=>e.backup&&["success","restore_conflict"].includes(e.status));
 $("export-report").disabled=active;$("download-import").hidden=t.source_kind!=="import"||active||!t.entries.some(e=>e.result_fp);
 let entries=t.entries.filter(e=>!$("status-filter").value||e.status===$("status-filter").value);
 const order=$("sort-order").value;
 entries.sort((a,b)=>order==="size"?b.size-a.size:order==="saving"?(b.size-b.result_size)-(a.size-a.result_size):a.relative.localeCompare(b.relative));
 $("result-body").replaceChildren();
 for(const e of entries){
  const tr=el("tr"),status=el("td",labels[e.status]||e.status,e.status==="failed"||e.status==="restore_conflict"?"bad":"badge");
  status.dataset.status=e.status;
  if(e.reason)status.append(el("span",e.reason,"reason"));
  const actions=el("td"),detail=el("button","详情");detail.dataset.detailId=e.id;detail.onclick=()=>details(e,detail).catch(showError);actions.append(detail);
  if(t.mode==="backup"&&e.backup&&["success","restore_conflict"].includes(e.status)){const restore=el("button","恢复");restore.disabled=active;restore.onclick=()=>restoreTask(e.id);actions.append(" ",restore);}
  const available=!!e.result_fp;tr.append(el("td",e.relative,"mono"),el("td",e.kind==="document"?"PDF 文档":e.kind==="video"?"视频":"图片"),el("td",size(e.size)),el("td",available?size(e.result_size):"未生成"),el("td",available?pct(e.size-e.result_size,e.size):"未生成"),status,actions);$("result-body").append(tr);
 }
}
let detailOpener=null,detailEntryId=null;
function detailPair(list,label,value,key=null,raw=false){
 const row=el("div",undefined,key?"detail-param-row":"detail-info-row");
 if(key)row.dataset.paramKey=key;
 const description=el("dd",String(value));
 if(raw)description.setAttribute("data-i18n-skip","");
 row.append(el("dt",label),description);list.append(row);return row;
}
function previewMetadata(info){
 const list=el("dl",undefined,"preview-metadata");
 if(!info){list.append(el("p","没有已验证的媒体信息。","small muted"));return list;}
 const rows=[["格式",info.format]];
 if(info.kind==="document")rows.push(["页数",info.pages],["PDF 版本",info.pdf_version]);
 else{
  rows.push(["尺寸",info.width+" × "+info.height+" px"]);
  if(info.kind==="image")rows.push(["色彩模式",info.mode]);
  else rows.push(["时长",Number(info.duration).toFixed(2)+" s"],["视频编码",info.codec],
   ["帧率",Number(info.fps).toFixed(2)+" fps"],["像素格式",info.pixel_format],
   ["音轨 / 声道",info.audio==="无"?"—":String(info.audio).toUpperCase()+" / "+info.audio_channels]);
 }
 for(const [label,value] of rows)if(value!==undefined&&value!==null)detailPair(list,label,value,null,true);
 return list;
}
function renderDetailParameters(entry){
 const actual=entry.actual_params,recorded=!!actual&&!actual.skipped;
 const adopted=!!entry.result_fp&&["success","restore_conflict"].includes(entry.status);
 const params=recorded?actual:state.task.params||{};
 let heading=recorded?(entry.status==="restored"?"原处理参数":adopted?"处理参数":"尝试参数（未采用）"):"任务设置";
 let note="";
 if(entry.status==="no_gain")note="编码结果未变小，实际结果保留原件；下列尝试参数未被采用。";
 else if(entry.status==="duplicate")note="相同内容与参数已处理，本次未再次编码。";
 else if(entry.status==="restored")note="当前文件已恢复为任务原件；以下为恢复前的处理记录。";
 else if(!recorded)note="没有已记录的编码参数；这里只展示任务设置，不代表已生成结果。";
 else if(!adopted)note="未生成可采用的结果；下列参数仅为处理尝试记录。";
 $("detail-parameters-title").textContent=heading;
 $("detail-parameters-note").textContent=note;$("detail-parameters-note").hidden=!note;
 const list=$("detail-parameters");list.replaceChildren();
 const names={quality:"画质优先",balanced:"均衡",small:"体积优先"};
 for(const [key,value] of Object.entries(params)){
  if(value===null||value===undefined||key==="skipped"||key==="validation")continue;
  let label,valueText,raw=false;
  if(key==="preset"){label="画质预设";valueText=entry.kind==="document"?"不适用于 PDF":names[value]||value;}
  else if(key==="encoder"){label="编码器";valueText=value;raw=true;}
  else if(key==="quality"){
   label="编码质量";
   valueText=value==="lossless"?"PNG 编码优化":value==="lossless structure"?"保守结构压缩":String(value);
   raw=typeof value==="number";
  }else if(key==="size"){label=entry.status==="restored"?"原输出尺寸":adopted?"输出尺寸":"尝试尺寸";valueText=Array.isArray(value)?value.join(" × ")+" px":String(value);raw=true;}
  else if(key==="crf"){label="视频 CRF";valueText=String(value);raw=true;}
  else if(key==="encoder_preset"){label="编码速度预设";valueText=String(value);raw=true;}
  else if(key==="audio"){label="音轨处理";valueText=entry.info?.audio==="无"?"无音轨":value==="copy"?"保留原音轨":String(value);}
  else if(key==="max_width"||key==="max_height"){label=key==="max_width"?"最大宽度":"最大高度";valueText=entry.kind==="document"?"不适用于 PDF":value+" px";}
  else if(key==="compress_streams"||key==="recompress_flate"){label=key==="compress_streams"?"数据流压缩":"Flate 重压";valueText=value?"启用":"未启用";}
  else if(key==="object_streams"){label="对象流";valueText=value==="preserve"?"保留原策略":String(value);}
  else if(key==="page_resize"||key==="image_reencoding"){label=key==="page_resize"?"PDF 页面改尺寸":"图像重编码";valueText=value?"启用":"未启用";}
  else if(key==="version"){label="处理器版本";valueText=String(value);raw=true;}
  else continue; // Less common engine fields remain available in the raw record.
  detailPair(list,label,valueText,key,raw);
 }
 if(!list.children.length)detailPair(list,"处理记录","未记录");
}
// Keep full-size inspection inside this page: the desktop host blocks new windows.
const imageViewer={opener:null,request:0,mode:"fit",scale:1,ready:false};
const imageZoomSteps=[.1,.25,.5,.75,1,1.5,2,3,4];
function renderImageZoom(scale,keepCenter=false){
 const image=$("image-viewer-image"),stage=$("image-viewer-stage");
 if(!imageViewer.ready)return;
 const before=image.getBoundingClientRect(),viewport=stage.getBoundingClientRect();
 const centerX=viewport.left+stage.clientWidth/2,centerY=viewport.top+stage.clientHeight/2;
 const x=before.width?Math.max(0,Math.min(1,(centerX-before.left)/before.width)):.5;
 const y=before.height?Math.max(0,Math.min(1,(centerY-before.top)/before.height)):.5;
 imageViewer.scale=scale;
 image.style.width=Math.max(1,image.naturalWidth*scale)+"px";
 image.style.height=Math.max(1,image.naturalHeight*scale)+"px";
 if(keepCenter){const after=image.getBoundingClientRect();stage.scrollLeft+=after.left+x*after.width-centerX;stage.scrollTop+=after.top+y*after.height-centerY;}
 else{stage.scrollLeft=0;stage.scrollTop=0;}
 $("image-viewer-scale").textContent=(Math.round(scale*1000)/10)+"%";
 $("image-viewer-fit").setAttribute("aria-pressed",String(imageViewer.mode==="fit"));
 $("image-viewer-original").setAttribute("aria-pressed",String(imageViewer.mode==="pixel"&&scale===1));
 $("image-viewer-minus").disabled=scale<=imageZoomSteps[0];
 $("image-viewer-plus").disabled=scale>=imageZoomSteps.at(-1);
}
function fitImageViewer(){
 if(!imageViewer.ready)return;
 imageViewer.mode="fit";
 const image=$("image-viewer-image"),stage=$("image-viewer-stage");
 renderImageZoom(Math.min(1,Math.max(1,stage.clientWidth-32)/image.naturalWidth,Math.max(1,stage.clientHeight-32)/image.naturalHeight));
}
function stepImageZoom(direction){
 if(!imageViewer.ready)return;
 const scale=imageViewer.scale;
 const next=direction>0?imageZoomSteps.find(value=>value>scale+.001):[...imageZoomSteps].reverse().find(value=>value<scale-.001);
 if(next===undefined)return;
 imageViewer.mode="pixel";renderImageZoom(next,true);
}
function openImageViewer(url,relative,heading,opener){
 const dialog=$("image-viewer-dialog"),image=$("image-viewer-image"),request=++imageViewer.request;
 imageViewer.opener=opener;imageViewer.ready=false;imageViewer.mode="fit";
 dialog.dataset.state="loading";
 $("image-viewer-title").textContent=relative;$("image-viewer-title").scrollTop=0;
 $("image-viewer-slot").textContent=heading;
 $("image-viewer-dimensions").textContent="";$("image-viewer-scale").textContent="—";
 const message=$("image-viewer-message");message.textContent="正在读取图片…";message.classList.remove("bad");message.hidden=false;
 for(const id of ["image-viewer-fit","image-viewer-original","image-viewer-minus","image-viewer-plus"])$(id).disabled=true;
 image.hidden=true;image.alt=relative;image.style.removeProperty("width");image.style.removeProperty("height");
 image.onload=()=>{
  if(request!==imageViewer.request||!dialog.open)return;
  imageViewer.ready=true;dialog.dataset.state="ready";image.hidden=false;message.hidden=true;
  $("image-viewer-dimensions").textContent=image.naturalWidth+" × "+image.naturalHeight+" px";
  $("image-viewer-fit").disabled=false;$("image-viewer-original").disabled=false;
  fitImageViewer();
 };
 image.onerror=()=>{
  if(request!==imageViewer.request||!dialog.open)return;
  imageViewer.ready=false;dialog.dataset.state="error";image.hidden=true;
  message.textContent="媒体无法预览，文件可能已修改或移走。";message.classList.add("bad");message.hidden=false;
 };
 if(!dialog.open)dialog.showModal();
 image.src=url;
}
$("image-viewer-fit").onclick=fitImageViewer;
$("image-viewer-original").onclick=()=>{if(imageViewer.ready){imageViewer.mode="pixel";renderImageZoom(1,true);}};
$("image-viewer-minus").onclick=()=>stepImageZoom(-1);
$("image-viewer-plus").onclick=()=>stepImageZoom(1);
$("close-image-viewer").onclick=()=>$("image-viewer-dialog").close();
$("image-viewer-dialog").addEventListener("keydown",event=>{
 if(event.ctrlKey||event.metaKey||event.altKey||!imageViewer.ready)return;
 if(event.key==="+"||event.key==="="){event.preventDefault();stepImageZoom(1);}
 else if(event.key==="-"){event.preventDefault();stepImageZoom(-1);}
 else if(event.key==="0"){event.preventDefault();fitImageViewer();}
 else if(event.key==="1"){event.preventDefault();imageViewer.mode="pixel";renderImageZoom(1,true);}
});
$("image-viewer-dialog").addEventListener("close",()=>{
 if($("image-viewer-dialog").open)return; // Ignore a queued close after immediate reopening.
 imageViewer.request++;imageViewer.ready=false;
 const image=$("image-viewer-image");image.onload=null;image.onerror=null;image.removeAttribute("src");image.hidden=true;
 if($("detail-dialog").open)(imageViewer.opener?.isConnected?imageViewer.opener:$("close-detail")).focus({preventScroll:true});
 imageViewer.opener=null;
});
window.addEventListener("resize",()=>{if($("image-viewer-dialog").open&&imageViewer.mode==="fit")fitImageViewer();});
async function details(e,opener=document.activeElement){
 const dialog=$("detail-dialog");detailOpener=opener;detailEntryId=e.id;
 $("detail-title").textContent=e.relative;$("detail-title").scrollTop=0;
 const available=!!e.result_fp&&["success","no_gain","duplicate","restored","restore_conflict"].includes(e.status);
 $("detail-status").textContent=labels[e.status]||e.status;
 $("detail-status").dataset.status=e.status;
 $("detail-reason").textContent=e.reason||"";$("detail-reason").hidden=!e.reason;
 const summary=$("detail-summary");summary.replaceChildren();
 const saved=available?Math.max(0,e.size-e.result_size):null;
 for(const [key,label,value] of [
  ["original","原大小",e.source_fp?size(e.size):"未读取"],
  ["result","结果大小",available?size(e.result_size):"未生成"],
  ["saved","实际节省",available?size(saved)+" · "+pct(saved,e.size):"—"],
  ["time","处理耗时",Number.isFinite(e.elapsed)?e.elapsed+" s":"未记录"]
 ]){
  const row=detailPair(summary,label,value);row.dataset.detailStat=key;
  if(key==="time")row.querySelector("dd").id="detail-time";
 }
 $("detail-metadata").textContent=JSON.stringify({original:e.info||null,result:available?e.result_info||null:null},null,2);
 $("detail-params").textContent=JSON.stringify(e.actual_params||null,null,2);
 $("detail-task-settings").textContent=JSON.stringify(state.task.params||{},null,2);
 renderDetailParameters(e);
 detailRawMotion.settle(false);
 const previews=$("preview-grid");previews.replaceChildren();
 const canPreview=available&&["success","no_gain","duplicate","restored","restore_conflict"].includes(e.status);
 const originalReleased=!!state.task.import_copies_released;
 const originalAvailable=!originalReleased&&(state.task.mode==="export"||e.backup||["no_gain","duplicate","restored"].includes(e.status));
 const slots=canPreview?(originalAvailable?["original","result"]:["result"]):[];
 previews.dataset.slots=String(slots.length);
 for(const slot of slots){
  const wrapper=el("div",undefined,"preview-card");
  const heading=slot==="original"?(state.task.source_kind==="import"?"导入原始副本":"原文件"):(e.status==="restored"?"当前文件（已恢复）":"结果文件");
  wrapper.append(el("h3",heading));
  const url="/api/tasks/"+state.task.id+"/preview/"+e.id+"/"+slot;
  if(e.kind==="document"){
   const download=el("a","下载 PDF","pdf-download");download.href=url;download.download=e.relative.split("/").pop();
   wrapper.append(el("p","PDF 不在工具页面内嵌显示，请下载后使用本机阅读器检查。","small muted"),download);
  }else{
   const item=el(e.kind==="video"?"video":"img");
   if(e.kind==="video"){item.controls=true;item.preload="metadata";}
   else item.alt=(slot==="original"?"原文件：":"结果文件：")+e.relative;
   item.src=url;item.onerror=()=>item.replaceWith(el("p","媒体无法预览，文件可能已修改或移走。","bad"));
   if(e.kind==="image"){
    const zoom=el("button",undefined,"image-preview-trigger");zoom.type="button";zoom.title="在应用内放大查看";zoom.setAttribute("aria-label","放大图片");zoom.append(item);
    zoom.onclick=()=>openImageViewer(url,e.relative,heading,zoom);
    item.onerror=()=>{zoom.disabled=true;item.replaceWith(el("p","媒体无法预览，文件可能已修改或移走。","bad"));};
    wrapper.append(zoom,el("p","点击图片放大查看","small muted preview-help"));
   }else wrapper.append(item);
  }
  wrapper.append(previewMetadata(slot==="original"?e.info:e.result_info));previews.append(wrapper);
 }
 if(!canPreview)previews.append(el("p","未生成可预览的结果，请查看状态与原因。","small muted preview-note"));
 else if(originalReleased)previews.append(el("p","导入原始副本已清理，无法前后对比；导出结果与处理记录仍保留。","small muted preview-note"));
 else if(!originalAvailable)previews.append(el("p","未保留原文件，无法提供前后对比。","small muted preview-note"));
 if(!dialog.open)dialog.showModal();
 document.querySelector(".detail-content").scrollTop=0;
}

async function restoreTask(entry_id=null){
 if(!askConfirm(entry_id?"从任务备份恢复此文件？已修改的文件将跳过。":"从任务备份恢复整批文件？冲突文件将逐项跳过，备份仍保留。"))return;
 clearError();$("restore-all").disabled=true;
 try{await json("/api/tasks/"+state.task.id+"/restore",{method:"POST",body:{entry_id}});await openTask(state.task.id);await historyList();}catch(error){showError(error);renderResults();}
}
$("result-paths").onclick=async event=>{
 const button=event.target.closest("button[data-folder-slot]");
 if(!button||!$("result-paths").contains(button))return;
 const id=state.task?.id,slot=button.dataset.folderSlot;if(!id||!slot)return;
 const feedback=$("result-folder-feedback");button.disabled=true;feedback.hidden=true;
 try{
  await json("/api/tasks/"+id+"/open-folder/"+slot,{method:"POST",body:{}});
  feedback.textContent="已在运行设备打开"+({source:"来源",result:"结果",backup:"备份"}[slot])+"目录。";feedback.classList.remove("bad");feedback.hidden=false;
 }catch(error){feedback.textContent=error.message;feedback.classList.add("bad");feedback.hidden=false;}
 finally{if(state.task?.id===id&&button.isConnected)button.disabled=false;}
};
$("restore-all").onclick=()=>restoreTask();
$("close-detail").onclick=()=>$("detail-dialog").close();
$("detail-dialog").addEventListener("close",()=>{
 if($("image-viewer-dialog").open)$("image-viewer-dialog").close();
 for(const video of $("preview-grid").querySelectorAll("video"))video.pause();
 $("preview-grid").replaceChildren();
 detailRawMotion.settle(false);
 const fallback=[...document.querySelectorAll("#result-body button[data-detail-id]")].find(n=>n.dataset.detailId===detailEntryId);
 (detailOpener?.isConnected?detailOpener:fallback||$("export-report")).focus();
});
$("status-filter").onchange=renderResults;$("sort-order").onchange=renderResults;
$("export-report").onclick=async()=>{try{const r=await api("/api/tasks/"+state.task.id+"/report.csv");const url=URL.createObjectURL(await r.blob());const a=el("a");a.href=url;a.download="mediaslimx-"+state.task.id+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){showError(error);}};
$("cancel-button").onclick=async()=>{try{await json("/api/tasks/"+state.task.id+"/cancel",{method:"POST",body:{}});$("cancel-button").disabled=true;$("cancel-button").textContent="等待安全边界…";}catch(error){showError(error);}};
$("resume-task").onclick=async()=>{
 const id=state.task?.id;if(!id)return;
 const button=$("resume-task");button.disabled=true;clearError();
 try{await json("/api/tasks/"+id+"/resume",{method:"POST",body:{}});await openTask(id);await historyList();}
 catch(error){showError(error);button.disabled=false;}
};
$("new-task").onclick=reset;
$("download-import").onclick=()=>{const a=el("a");a.href="/api/tasks/"+state.task.id+"/download.zip";a.download="mediaslimx-"+state.task.id+".zip";a.click();};

// Browsers supply file bytes, never a trustworthy original absolute path.
// Imports go only to this authenticated service; the Python core enforces export-only.
const importState={batch:null,busy:false,xhr:null,cancelled:false};
function sourceMode(imported){
 document.dispatchEvent(new CustomEvent("mediaslimx-close-selects",{detail:null}));
 $("mode").disabled=imported;$("mode").dispatchEvent(new Event("mediaslimx-select-sync"));
 $("scan-form").hidden=imported;$("import-source").hidden=!imported;
 $("import-limit-row").hidden=!imported;
 $("source-title").textContent=imported?"导入媒体文件":"选择媒体目录";
 $("source-note").textContent=imported?"传至当前服务 · 不发第三方":"目录扫描 · 不上传文件";
 $("import-export-note").hidden=!imported;$("import-to-backup").hidden=!imported;$("backup-toggle-field").hidden=imported;
 $("mode").closest(".custom-select").hidden=imported;
 document.querySelector('label[for="mode"]').hidden=imported;
 if(imported){$("mode").value="export";$("mode").dispatchEvent(new Event("change"));}
 if(!imported){$("import-transfer").hidden=true;$("import-notice").hidden=true;}
}
async function refreshUnusedImports(){
 const records=await json("/api/imports/unused");
 $("clear-unused-imports").hidden=!records.length;
 $("clear-unused-imports").textContent="清理未使用副本 · "+records.length;
}
$("clear-unused-imports").onclick=async()=>{
 try{
  const records=await json("/api/imports/unused");if(!records.length){await refreshUnusedImports();return;}
  if(!askConfirm("清理 "+records.length+" 批未用于任务的导入副本（"+size(records.reduce((n,b)=>n+b.bytes,0))+"）？只删除当前服务保存的副本，不删除你拖入的原文件、任务原始副本或导出结果。"))return;
  const result=await json("/api/imports/clear-unused",{method:"POST",body:{import_ids:records.slice(0,200).map(b=>b.id)}});
  if(result.cleared.includes(importState.batch)){importState.batch=null;reset();}
  await refreshUnusedImports();
 }catch(error){showError(error);}
};
function releaseUnusedImport(){
 const key=importState.batch;importState.batch=null;
 if(key)void json("/api/imports/"+key+"/discard",{method:"POST",body:{}}).catch(showError);
}
function showImportScan(scan){
 closeSettingsEditor(false);
 const previous=state.scan?.import_id===scan.import_id?state.scan:null,old=state.selected;
 state.scan=scan;state.task=null;clearTimeout(state.timer);
 showTaskHeading();
 state.selected=new Set(scan.entries.filter(e=>e.status==="ready"&&(!previous||!previous.entries.some(p=>p.id===e.id)||old.has(e.id))).map(e=>e.id));
 $("output-path").value=previous?$("output-path").value:scan.default_output;
 $("directory-section").hidden=false;$("import-summary").textContent=scan.entries.length+" 项 · "+size(scan.entries.reduce((n,e)=>n+e.size,0));
 for(const id of ["scan-section","settings-section"])$(id).hidden=false;
 for(const id of ["empty-section","results-section","progress-section"])$(id).hidden=true;
 sourceMode(true);step(2);renderScan();
}
function uploadFile(key,item,file,index,total){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();importState.xhr=xhr;
  xhr.open("PUT","/api/imports/"+key+"/files/"+item.id);
  xhr.setRequestHeader("X-MediaSlimX-Token",token);xhr.setRequestHeader("Content-Type","application/octet-stream");
  const progress=(loaded,length)=>{
   $("import-progress").value=length?loaded/length*100:0;
   $("import-progress-text").textContent=(index+1)+" / "+total+" · "+file.name+" · "+size(loaded)+" / "+size(file.size)+(loaded===length?" · 校验写入…":"");
  };
  xhr.upload.onprogress=e=>progress(e.loaded,e.total||file.size);progress(0,file.size);
  xhr.onload=()=>{importState.xhr=null;if(xhr.status===200)resolve();else{let reason="传输失败（"+xhr.status+"）";try{reason=JSON.parse(xhr.responseText).detail||reason;}catch{}reject(Error(reason));}};
  xhr.onerror=()=>{importState.xhr=null;reject(Error("连接中断，请检查当前 MediaSlim X 服务"));};
  xhr.onabort=()=>{importState.xhr=null;reject(new DOMException("已取消剩余导入","AbortError"));};
  xhr.send(file);
 });
}
async function importFiles(files,entries=null){
 if(importState.busy){showError("文件正在导入，请等待完成后继续添加");return;}
 if(state.task&&activeTask(state.task)){showError("请等待当前处理任务结束后再导入");return;}
 if(document.querySelector("dialog[open]")){showError("请关闭当前弹窗后再导入文件");return;}
 const directoryWasHidden=$("directory-section").hidden;let applied=false,notes=[];
 importState.busy=true;importState.cancelled=false;clearError();clearIntakeGuidance();
 $("directory-section").hidden=false;$("import-transfer").hidden=false;
 const locks=["clear-import","back-directory","add-import-files","add-import-folder","new-task","choose-import-files","choose-import-folder","import-to-backup","empty-scan-directory"];
 for(const id of locks)$(id).disabled=true;
 $("start-button").disabled=true;$("cancel-import").disabled=false;
 $("import-progress").removeAttribute("value");$("import-progress-text").textContent="正在收集媒体文件…";
 try{
  const policy=await json("/api/imports/policy");
  const controls={cancelled:()=>importState.cancelled,progress:(path,n)=>{$("import-progress-text").textContent="正在收集："+path+" · 已找到 "+n+" 个媒体文件";}};
  const collected=entries?await MSXImportTree.collectEntries(entries,policy,controls):await MSXImportTree.collectFiles(files,policy,controls);
  notes=collected.notes;
  if(importState.cancelled)throw new DOMException("已取消剩余导入","AbortError");
  const valid=collected.files;
  if(!valid.length)throw Error(notes.join("；")||"没有可导入的文件");
  const existing=importState.batch&&state.scan?.import_id===importState.batch?state.scan.entries:[];
  const totalFiles=existing.length+valid.length,totalBytes=existing.reduce((n,e)=>n+e.size,0)+valid.reduce((n,e)=>n+e.file.size,0);
  if(totalFiles>policy.files)throw MSXImportTree.limitError("files",totalFiles,policy.files);
  if(totalBytes>policy.batch_bytes)throw MSXImportTree.limitError("bytes",totalBytes,policy.batch_bytes);
  const allocation=await json("/api/imports",{method:"POST",body:{files:valid.map(f=>({name:f.file.name,size:f.file.size,relative_path:f.relative_path})),import_id:importState.batch}});
  state.intent++;clearTimeout(state.timer);
  if(!importState.batch||state.scan?.import_id!==importState.batch){
   state.scan=null;state.task=null;state.selected.clear();
   showTaskHeading();
   for(const id of ["scan-section","settings-section","results-section","progress-section"])$(id).hidden=true;
   $("empty-section").hidden=false;
  }
  applied=true;importState.batch=allocation.id;sourceMode(true);
  for(let i=0;i<valid.length;i++){
   if(importState.cancelled)break;
   try{await uploadFile(allocation.id,allocation.files[i],valid[i].file,i,valid.length);}
   catch(error){if(error.name!=="AbortError")notes.push(valid[i].relative_path+"："+error.message);else break;}
  }
  if(importState.cancelled)notes.push("已取消剩余导入；完整传入的文件仍可处理。");
  let scanned;
  for(let attempt=0;attempt<30;attempt++){
   try{scanned=await json("/api/imports/"+allocation.id+"/scan",{method:"POST",body:{}});break;}
   catch(error){if(error.message.includes("仍在传输")&&attempt<29){await new Promise(r=>setTimeout(r,100));continue;}if(!error.message.includes("尚无完整"))throw error;break;}
  }
  if(scanned)showImportScan(scanned);else $("import-summary").textContent="暂无完整文件 · 可清空或继续添加";
 }catch(error){
  if(error.name==="AbortError")notes.push("已取消剩余导入；未传输文件。");else if(!showImportFailure(error)){if(!notes.includes(error.message))notes.push(error.message);showError(error);}
 }finally{
  importState.busy=false;importState.xhr=null;$("import-transfer").hidden=true;
  for(const id of locks)$(id).disabled=false;
  if(!applied){sourceMode(state.scan?.source_kind==="import");$("directory-section").hidden=directoryWasHidden;}
  else if(!importState.batch)sourceMode(false);
  $("import-notice").textContent=notes.join("\n");$("import-notice").hidden=!notes.length;
  if(state.scan)updateSelection();
 }
}
$("cancel-import").onclick=()=>{importState.cancelled=true;$("cancel-import").disabled=true;importState.xhr?.abort();};
for(const id of ["choose-import-files","add-import-files"])$(id).onclick=()=>$("import-file-input").click();
const localFolderPicker={request:null};
async function chooseLocalDirectory(){
 if(importState.busy||state.task&&activeTask(state.task))return;
 const opener=$("choose-import-folder"),locks=["clear-import","back-directory","add-import-files","add-import-folder","new-task","choose-import-files","choose-import-folder","import-to-backup","empty-scan-directory"];
 const request={id:crypto.randomUUID(),cancelled:false};localFolderPicker.request=request;
 let restoreFocus=false;
 showIntakeGuidance("picking-directory",{},"export",false);
 importState.busy=true;for(const id of locks)$(id).disabled=true;$("start-button").disabled=true;
 $("guidance-dismiss").focus();
 try{
  const result=await json("/api/directories/native",{method:"POST",body:{purpose:"media",request_id:request.id}});
  if(request.cancelled||!result.path){restoreFocus=true;clearIntakeGuidance();return;}
  await refreshEnvironment();
  importState.busy=false;
  await scanDirectory(result.path,"export");
 }catch(error){if(request.cancelled){restoreFocus=true;clearIntakeGuidance();}else showIntakeGuidance("error",{reason:error.message},"export");}
 finally{if(localFolderPicker.request===request)localFolderPicker.request=null;importState.busy=false;for(const id of locks)$(id).disabled=false;$("guidance-dismiss").disabled=false;if(state.scan)updateSelection();if(restoreFocus)opener.focus();}
}
async function cancelLocalDirectoryPick(){
 const request=localFolderPicker.request;if(!request||request.cancelled)return;
 request.cancelled=true;$("guidance-dismiss").disabled=true;
 $("guidance-description").textContent="正在取消系统选择…";
 try{await json("/api/directories/native/cancel",{method:"POST",body:{request_id:request.id}});}
 catch(error){if(localFolderPicker.request===request){request.cancelled=false;$("guidance-dismiss").disabled=false;showError(error);}}
}
$("choose-import-folder").onclick=()=>{
 if(state.environment?.window_directory_drop===true&&state.environment.native_picker===true)void chooseLocalDirectory();
 else $("import-folder-input").click();
};
$("add-import-folder").onclick=()=>$("import-folder-input").click();
$("import-folder-input").onchange=event=>{const files=[...event.target.files];event.target.value="";void importFiles(files);};
$("import-file-input").onchange=event=>{const files=[...event.target.files];event.target.value="";void importFiles(files);};
$("clear-import").onclick=async()=>{
 if(importState.busy)return;
 const controls=["clear-import","back-directory","add-import-files","add-import-folder","new-task","choose-import-files","choose-import-folder","import-to-backup","empty-scan-directory"];
 importState.busy=true;for(const id of controls)$(id).disabled=true;
 try{
  if(importState.batch)await json("/api/imports/"+importState.batch+"/discard",{method:"POST",body:{}});
  importState.batch=null;importState.busy=false;reset();
 }catch(error){showError(error);}
 finally{importState.busy=false;for(const id of controls)$(id).disabled=false;}
};
// A browser cannot reveal an original absolute path. The Windows host can
// resolve exactly one real dropped File through AdditionalObjects; no file
// name, directory-entry name, URL or JavaScript-supplied path is trusted here.
const directoryDrop={pending:null};
function releaseDirectoryDrop(pending){
 if(directoryDrop.pending!==pending)return false;
 directoryDrop.pending=null;clearTimeout(pending.timer);importState.busy=false;
 for(const [id,disabled]of pending.locks)$(id).disabled=disabled;
 if(state.scan)updateSelection();return true;
}
function tryNativeDirectoryDrop(file,fallback){
 const bridge=window.chrome?.webview;
 if(state.environment?.window_directory_drop!==true||typeof bridge?.postMessageWithAdditionalObjects!=="function")return false;
 if(importState.busy||state.task&&activeTask(state.task)||document.querySelector("dialog[open]"))return false;
 const ids=["clear-import","back-directory","add-import-files","add-import-folder","new-task","choose-import-files","choose-import-folder","import-to-backup","empty-scan-directory","scan-button","browse-media","start-button"];
 const pending={id:crypto.randomUUID().replaceAll("-",""),intent:++state.intent,locks:ids.map(id=>[id,$(id).disabled]),fallback,timer:null};
 directoryDrop.pending=pending;importState.busy=true;
 for(const [id]of pending.locks)$(id).disabled=true;
 showIntakeGuidance("reading-directory",{},"export",false);
 const useImport=()=>{
  if(!releaseDirectoryDrop(pending))return;
  clearIntakeGuidance();pending.fallback();
 };
 pending.timer=setTimeout(useImport,7000);
 try{bridge.postMessageWithAdditionalObjects({op:"dropped_directory",request_id:pending.id},[file]);}
 catch{useImport();}
 return true;
}
window.chrome?.webview?.addEventListener("message",async event=>{
 const value=event.data,pending=directoryDrop.pending;
 if(!pending||!value||value.type!=="mediaslimx-directory-drop"||value.request_id!==pending.id)return;
 if(!releaseDirectoryDrop(pending)||pending.intent!==state.intent)return;
 if(typeof value.path!=="string"||!value.path){
  showIntakeGuidance("directory-error",{reason:typeof value.error==="string"?value.error:"未能识别拖入的本机目录，请使用选择目录。"},"export");return;
 }
 // The bridge is restricted to the authenticated first-party workspace. Only
 // its correlated reply reaches this branch; the server revalidates the path
 // against directory, link, exclusions and access rules before scanning.
 if(document.querySelector("dialog[open]")||state.task&&activeTask(state.task)){
  showIntakeGuidance("directory-error",{reason:"请关闭当前弹窗，或等待任务结束后重新拖入目录。"},"export");return;
 }
 const scanned=await scanDirectory(value.path,"export",{passive:true});
 if(scanned&&pending.intent+1===state.intent){
  // A successful drop needs a small status line, not another large panel or
  // focus move that interrupts selecting files in the newly scanned list.
  clearError();clearIntakeGuidance();$("import-notice").textContent="已按目录扫描；保留原件，点击开始后优化。";$("import-notice").hidden=false;
  void refreshEnvironment().catch(()=>{}); // Include any newly authorized native root in the displayed scope.
 }
});
window.addEventListener("pagehide",()=>{
 // Closing/reloading the display never falls back to copying media later.
 const pending=directoryDrop.pending;if(pending){clearTimeout(pending.timer);directoryDrop.pending=null;}
});
// The native host owns closing. This first-party dialog only returns a bounded
// decision for its current nonce; it never exposes an HTTP shutdown endpoint.
const windowClose={pending:null,lastFocus:null,ignoredCloseEvents:0,finished:new Set()};
const closeNonce=/^[a-f0-9]{32}$/;
function windowCloseCapability(){return state.environment?.window_directory_drop===true&&typeof window.chrome?.webview?.postMessage==="function";}
function sendWindowMessage(value){
 if(!windowCloseCapability())return false;
 try{window.chrome.webview.postMessage(value);return true;}catch{return false;}
}
function sendWindowUiReady(){
 if(!windowCloseCapability())return;
 sendWindowMessage({op:"window_ui_ready",language:MSXI18n.language==="en"?"en":"zh-CN",theme:document.documentElement.dataset.theme==="light"?"light":"dark"});
}
function meaningfulWindowFocus(node){
 return node instanceof HTMLElement&&node!==document.body&&node!==document.documentElement&&!node.closest(".skip-link,#window-close-dialog");
}
function availableWindowFocus(node){return meaningfulWindowFocus(node)&&node.isConnected&&!node.disabled&&!node.closest("[hidden],[inert]")&&!!node.getClientRects().length;}
document.addEventListener("focusin",event=>{if(meaningfulWindowFocus(event.target))windowClose.lastFocus=event.target;});
document.addEventListener("keydown",event=>{if(event.key==="Tab")document.documentElement.dataset.keyboardNavigation="true";},true);
document.addEventListener("pointerdown",()=>{delete document.documentElement.dataset.keyboardNavigation;},true);
window.addEventListener("blur",()=>{delete document.documentElement.dataset.keyboardNavigation;});
function rememberWindowFocus(node){
 const opener=meaningfulWindowFocus(node)?node:windowClose.lastFocus;
 return {opener,focusKey:opener?{id:opener.id,task:opener.dataset.taskId,detail:opener.dataset.detailId}:null};
}
function restoreWindowFocus(context){
 const focus=()=>{
  let target=context.opener,focusKey=context.focusKey;
  if(!availableWindowFocus(target)&&focusKey){
   if(focusKey.id)target=$(focusKey.id);
   if(!availableWindowFocus(target)&&focusKey.task)target=[...document.querySelectorAll("[data-task-id]")].find(node=>node.dataset.taskId===focusKey.task);
   if(!availableWindowFocus(target)&&focusKey.detail)target=[...document.querySelectorAll("[data-detail-id]")].find(node=>node.dataset.detailId===focusKey.detail);
  }
  if(!availableWindowFocus(target))target=["cancel-button","start-button","scan-button","media-path","new-task"].map($).find(availableWindowFocus);
  if(!target){target=!$("progress-section").hidden?$("progress-title"):!$("results-section").hidden?$("result-title"):$("main");target.tabIndex=-1;}
  target.focus({preventScroll:true});
 };
 focus();requestAnimationFrame(()=>{if(!$("window-close-dialog").open&&!meaningfulWindowFocus(document.activeElement))focus();});
}
function finishWindowCloseNonce(id){
 windowClose.finished.add(id);if(windowClose.finished.size>32)windowClose.finished.delete(windowClose.finished.values().next().value);
}
function closeWindowDecision(context){
 if(windowClose.pending!==context)return;
 finishWindowCloseNonce(context.id);windowClose.pending=null;
 const dialog=$("window-close-dialog");dialog.dataset.state="idle";
 for(const id of ["window-close-stay","window-close-exit","close-window-close","quit-app"])$(id).disabled=false;
 if(dialog.open){windowClose.ignoredCloseEvents++;dialog.close();}
 restoreWindowFocus(context);
}
function windowCloseSendFailure(){
 $("window-close-status").textContent="无法发送退出请求，请重试。";$("window-close-status").classList.add("bad");$("window-close-status").hidden=false;
}
function stayInWindow(){
 const context=windowClose.pending;if(!context||context.phase!=="open")return;
 if(!sendWindowMessage({op:"close_response",request_id:context.id,decision:"stay"})){windowCloseSendFailure();return;}
 closeWindowDecision(context);
}
$("window-close-stay").onclick=stayInWindow;$("close-window-close").onclick=stayInWindow;
$("window-close-dialog").addEventListener("cancel",event=>{event.preventDefault();stayInWindow();});
$("window-close-dialog").addEventListener("close",()=>{
 if(windowClose.ignoredCloseEvents){windowClose.ignoredCloseEvents--;return;}
 // Treat an unexpected page-side close as Stay; it can never authorize Exit.
 const context=windowClose.pending;if(!context||context.phase!=="open")return;
 if(sendWindowMessage({op:"close_response",request_id:context.id,decision:"stay"}))closeWindowDecision(context);
 else{try{$("window-close-dialog").showModal();}catch{}windowCloseSendFailure();}
});
$("window-close-exit").onclick=()=>{
 const context=windowClose.pending;if(!context||context.phase!=="open")return;
 if(!sendWindowMessage({op:"close_response",request_id:context.id,decision:"exit"})){windowCloseSendFailure();return;}
 context.phase="exiting";$("window-close-dialog").dataset.state="exiting";
 for(const id of ["window-close-stay","window-close-exit","close-window-close","quit-app"])$(id).disabled=true;
 $("window-close-status").classList.remove("bad");$("window-close-status").textContent="正在保留进度并退出…";$("window-close-status").hidden=false;
};
$("quit-app").onclick=()=>{if(windowClose.pending?.phase!=="exiting")sendWindowMessage({op:"request_close"});};
window.chrome?.webview?.addEventListener("message",event=>{
 const value=event.data;if(!windowCloseCapability()||!value||typeof value!=="object"||Array.isArray(value)||typeof value.request_id!=="string"||!closeNonce.test(value.request_id))return;
 const fields=Object.keys(value),dialog=$("window-close-dialog"),current=windowClose.pending;
 if(value.type==="mediaslimx-close-dismiss"&&fields.length===2&&fields.includes("type")&&fields.includes("request_id")){
  if(current?.id===value.request_id)closeWindowDecision(current);return;
 }
 if(value.type!=="mediaslimx-close-request"||fields.length!==3||!fields.includes("type")||!fields.includes("request_id")||!fields.includes("busy")||value.busy!==true||windowClose.finished.has(value.request_id))return;
 if(current?.phase==="exiting")return;
 if(current?.id===value.request_id){$("window-close-stay").focus({preventScroll:true});return;}
 const saved=current?{opener:current.opener,focusKey:current.focusKey}:rememberWindowFocus(document.activeElement);
 if(current)finishWindowCloseNonce(current.id);
 const context={id:value.request_id,phase:"open",...saved};windowClose.pending=context;
 delete document.documentElement.dataset.keyboardNavigation;
 for(const id of ["window-close-stay","window-close-exit","close-window-close","quit-app"])$(id).disabled=false;
 $("window-close-status").hidden=true;$("window-close-status").classList.remove("bad");dialog.dataset.state="open";
 try{
  if(!dialog.open)dialog.showModal();
  if(!dialog.matches(":modal"))throw Error("Close confirmation is not modal");
  $("window-close-stay").focus({preventScroll:true});
  if(!sendWindowMessage({op:"close_response",request_id:context.id,decision:"shown"}))closeWindowDecision(context);
 }catch{if(windowClose.pending===context)closeWindowDecision(context);}
});
new MutationObserver(sendWindowUiReady).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
window.addEventListener("pagehide",()=>{windowClose.pending=null;});
let dragDepth=0;
const isFileDrag=event=>[...event.dataTransfer?.types||[]].includes("Files");
function hideDrop(){dragDepth=0;$("file-drop-overlay").hidden=true;}
window.addEventListener("dragenter",event=>{if(isFileDrag(event)){event.preventDefault();dragDepth++;if(!document.querySelector("dialog[open]")&&!importState.busy)$("file-drop-overlay").hidden=false;}});
window.addEventListener("dragover",event=>{if(isFileDrag(event)){event.preventDefault();event.dataTransfer.dropEffect="copy";}});
window.addEventListener("dragleave",event=>{if(isFileDrag(event)&&--dragDepth<=0)hideDrop();});
window.addEventListener("blur",hideDrop);
window.addEventListener("drop",event=>{
 if(!isFileDrag(event))return;event.preventDefault();hideDrop();
 closeSettingsEditor(false);
 // Capture entry handles synchronously while the drop data store is readable.
 const items=[...event.dataTransfer.items||[]],entries=[],files=[],droppedFiles=[...event.dataTransfer.files||[]];
 for(const item of items.filter(i=>i.kind==="file")){
  const entry=(item.getAsEntry||item.webkitGetAsEntry)?.call(item);
  if(entry)entries.push(entry);else {const file=item.getAsFile();if(file)files.push(file);}
 }
 const fallback=()=>{
  if(entries.length)void importFiles([],entries.concat(files.map(file=>({name:file.name,isFile:true,isDirectory:false,file:resolve=>resolve(file)}))));
  else void importFiles(files.length?files:droppedFiles);
 };
 if(entries.length===1&&entries[0].isDirectory&&items.filter(item=>item.kind==="file").length===1&&droppedFiles.length===1&&tryNativeDirectoryDrop(droppedFiles[0],fallback))return;
 fallback();

});

/* Native controls remain the data source; the enhanced list owns only presentation. */
function enhanceSelect(select){
 const shell=el("div",undefined,"custom-select");
 select.before(shell);shell.append(select);
 const trigger=el("button"),caption=el("span"),chevron=el("span",undefined,"chevron"),menu=el("div",undefined,"select-menu");
 trigger.id=select.id+"-trigger";trigger.type="button";trigger.className="select-trigger";
 trigger.setAttribute("role","combobox");trigger.setAttribute("aria-expanded","false");trigger.setAttribute("aria-haspopup","listbox");
 trigger.setAttribute("aria-label",select.id==="mode"?"处理方式":select.id==="status-filter"?"状态筛选":select.id==="selection-type"?"按类型选择":"结果排序");
 menu.id=select.id+"-options";menu.setAttribute("role","listbox");menu.hidden=true;
 trigger.setAttribute("aria-controls",menu.id);trigger.append(caption,chevron);shell.append(trigger);document.body.append(menu);
 select.tabIndex=-1;select.setAttribute("aria-hidden","true");
 let highlighted=select.selectedIndex,anchor=null;
 const buttons=[...select.options].map((option,index)=>{
  const b=el("button",MSXI18n.sourceText(option));b.id=select.id+"-option-"+index;b.className="select-option";b.type="button";b.tabIndex=-1;b.setAttribute("role","option");b.setAttribute("aria-label",MSXI18n.sourceText(option));
  b.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event("change",{bubbles:true}));close();trigger.focus();};
  menu.append(b);return b;
 });
 function sync(){
  caption.textContent=MSXI18n.sourceText(select.options[select.selectedIndex]);
  buttons.forEach((b,i)=>{b.disabled=select.options[i].disabled;b.setAttribute("aria-disabled",String(b.disabled));b.setAttribute("aria-selected",String(i===select.selectedIndex));});
  trigger.disabled=select.disabled||buttons.every(b=>b.disabled);
 }
 function close(){anchor=null;menu.hidden=true;trigger.setAttribute("aria-expanded","false");trigger.removeAttribute("aria-activedescendant");}
 function highlight(index,direction=1){
  let next=(index+buttons.length)%buttons.length,visited=0;
  while(buttons[next].disabled&&visited<buttons.length){next=(next+direction+buttons.length)%buttons.length;visited++;}
  if(visited===buttons.length){trigger.removeAttribute("aria-activedescendant");return;}
  highlighted=next;buttons.forEach((b,i)=>b.dataset.highlight=String(i===highlighted));trigger.setAttribute("aria-activedescendant",buttons[highlighted].id);
  // Scroll only the options, never the workspace or the page behind them.
  const item=buttons[highlighted],top=item.offsetTop,bottom=top+item.offsetHeight;
  if(top<menu.scrollTop)menu.scrollTop=top;else if(bottom>menu.scrollTop+menu.clientHeight)menu.scrollTop=bottom-menu.clientHeight;
 }
 function open(){
  document.dispatchEvent(new CustomEvent("mediaslimx-close-selects",{detail:trigger.id}));
  // A body-level menu escapes scrolling pane clipping and stays inside the viewport.
  const rect=trigger.getBoundingClientRect(),below=innerHeight-rect.bottom-12,above=rect.top-12;
  menu.classList.toggle("open-up",below<Math.min(290,buttons.length*44+12)&&above>below);
  anchor={top:rect.top,left:rect.left};
  const up=menu.classList.contains("open-up"),width=Math.min(rect.width,innerWidth-24);
  menu.style.width=width+"px";menu.style.left=Math.max(12,Math.min(rect.left,innerWidth-width-12))+"px";
  menu.style.maxHeight=Math.max(44,Math.min(290,up?above:below))+"px";
  menu.style.top=up?"auto":rect.bottom+6+"px";menu.style.bottom=up?innerHeight-rect.top+6+"px":"auto";
  menu.hidden=false;trigger.setAttribute("aria-expanded","true");highlight(select.selectedIndex);
 }
 trigger.onclick=()=>menu.hidden?open():close();
 trigger.onkeydown=event=>{
  if(["ArrowDown","ArrowUp","Home","End","Escape","Enter"," "].includes(event.key)){
   event.preventDefault();
   if(event.key==="Escape"){close();return;}
   if((event.key==="Enter"||event.key===" ")&&!menu.hidden){buttons[highlighted].click();return;}
   if(menu.hidden){open();if(event.key==="ArrowUp")highlight(select.selectedIndex-1,-1);return;}
   if(event.key==="ArrowDown")highlight(highlighted+1);
   if(event.key==="ArrowUp")highlight(highlighted-1,-1);
   if(event.key==="Home")highlight(0);
   if(event.key==="End")highlight(buttons.length-1,-1);
  }else if(event.key==="Tab"){close();}
 };
 select.addEventListener("change",sync);
 select.addEventListener("mediaslimx-select-sync",sync);
 window.addEventListener("resize",close);
 document.addEventListener("scroll",event=>{
  if(menu.hidden||menu.contains(event.target)||!anchor)return;
  // Focus may queue a scroll event before open(). Close only if the anchor
  // actually moved, so keyboard opening is not undone by that queued event.
  const rect=trigger.getBoundingClientRect();
  if(Math.abs(rect.top-anchor.top)>.5||Math.abs(rect.left-anchor.left)>.5)close();
 },true);
 document.addEventListener("pointerdown",event=>{if(!shell.contains(event.target)&&!menu.contains(event.target))close();});
 document.addEventListener("mediaslimx-close-selects",event=>{if(event.detail!==trigger.id)close();});
 sync();
}
for(const select of document.querySelectorAll("select"))enhanceSelect(select);
function iconElement(name){
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg"),use=document.createElementNS("http://www.w3.org/2000/svg","use");
 svg.classList.add("icon");svg.setAttribute("aria-hidden","true");use.setAttribute("href","/static/icons.svg#"+name);svg.append(use);return svg;
}
let environmentOpener=null;
function openEnvironment(opener){
 environmentOpener=opener;
 if(!$("environment-dialog").open)$("environment-dialog").showModal();
}
$("open-environment").onclick=()=>openEnvironment($("open-environment"));
$("show-privacy").onclick=event=>{event.preventDefault();openEnvironment($("show-privacy"));const panel=document.querySelector(".environment-content");panel.scrollTop=panel.scrollHeight;};
$("close-environment").onclick=()=>$("environment-dialog").close();
$("environment-dialog").addEventListener("close",()=>environmentOpener?.focus());
function smoothDisclosure(details,{mobileDialog=false}={}){
 const summary=details.querySelector(":scope > summary");
 const content=[...details.children].filter(n=>n!==summary);
 let desired=details.open,animation=null;
 function state(){
  details.dataset.expanded=String(desired);summary.setAttribute("aria-expanded",String(desired));
  for(const node of content)node.inert=!desired;
 }
 function settle(open=desired){
  desired=open;animation?.cancel();animation=null;
  details.open=open;details.classList.remove("disclosure-moving");state();
 }
 function toggle(open){
  // Capture the rendered intermediate extent BEFORE cancelling, so reversals are continuous.
  const from=details.getBoundingClientRect().height;
  animation?.cancel();animation=null;desired=open;
  if(!open&&content.some(n=>n.contains(document.activeElement)))summary.focus();
  details.open=true;state();
  if(reducedMotion.matches||!details.animate){settle();return;}
  const expanded=details.getBoundingClientRect().height;
  const collapsed=summary.getBoundingClientRect().height+
   parseFloat(getComputedStyle(details).borderTopWidth)+parseFloat(getComputedStyle(details).borderBottomWidth);
  const to=open?expanded:collapsed;
  details.classList.add("disclosure-moving");
  const distance=Math.abs(to-from),duration=Math.max(80,Math.min(220,(open?220:180)*distance/Math.max(expanded-collapsed,1)));
  const next=details.animate([{height:from+"px"},{height:to+"px"}],{duration,easing:"cubic-bezier(.23,1,.32,1)"});
  animation=next;
  next.onfinish=()=>{if(animation===next)settle();};
 }
 summary.addEventListener("click",event=>{
  if(mobileDialog&&matchMedia("(max-width:767px)").matches){
   event.preventDefault();settle(false);openEnvironment(summary);return;
  }
  event.preventDefault();toggle(!desired);
 });
 details.addEventListener("toggle",()=>{
  // External native state changes (including programmatic close) must still work.
  if(!animation)settle(details.open);
  else if(!details.open)settle(false);
 });
 const settleCurrent=()=>{if(animation)settle();};
 window.addEventListener("resize",settleCurrent);
 document.addEventListener("mediaslimx-language",settleCurrent);
 reducedMotion.addEventListener("change",()=>{if(reducedMotion.matches)settleCurrent();});
 state();return {settle};
}
const environmentMotion=smoothDisclosure(document.querySelector(".environment"),{mobileDialog:true});
smoothDisclosure(document.querySelector(".compression-notice"));
const detailRawMotion=smoothDisclosure($("detail-raw"));
const environmentDisclosure=document.querySelector(".environment");
function adaptEnvironment(){
 if(matchMedia("(max-width:767px)").matches&&environmentDisclosure.open){
  environmentMotion.settle(false);openEnvironment(environmentDisclosure.querySelector("summary"));
 }
}
environmentDisclosure.addEventListener("toggle",adaptEnvironment);
window.addEventListener("resize",adaptEnvironment);

const folderState={version:0,path:null,parent:null,purpose:"media",target:"media-path",opener:null,nativeRequest:null,shortcutItems:[]};
async function refreshEnvironment(){
 const env=await json("/api/environment");state.environment=env;$("environment").replaceChildren();
 $("quit-app").hidden=!windowCloseCapability();sendWindowUiReady();
 const localWindow=env.window_directory_drop===true&&env.native_picker===true;
 $("choose-import-folder").textContent=localWindow?"选择本机目录":"导入文件夹副本";
 $("choose-import-folder").title=localWindow?"系统选择后直接扫描，不上传副本；仍需点击开始优化":"浏览器会把文件夹副本传入当前服务；最多 200 个文件、2 GiB";
 $("add-import-folder").textContent="添加文件夹副本";
 $("add-import-folder").title="追加到当前导入列表；浏览器可能确认文件夹传输";
 $("empty-scan-directory").hidden=localWindow;
 $("empty-scan-directory").textContent="扫描运行设备目录";
 $("empty-import-limit").textContent=localWindow?"拖文件夹直接扫描。文件导入上限：200 项 / 2 GiB。":"文件夹副本传至当前服务，导入最多 200 个、2 GiB；大批量扫描运行设备目录。";
 $("runtime-label").textContent=env.runtime;$("runtime-brief").textContent="v"+env.version;
 $("native-folder").hidden=!env.native_picker;
 $("environment-brief").textContent=env.runtime+" · Pillow "+env.pillow+" · "+(env.ffmpeg&&env.ffprobe?"视频依赖可用":"缺少视频依赖");
 $("pdf-runtime").textContent=env.pdf?"PDF 模块可用":"PDF 模块未安装：在当前平台虚拟环境运行 python -m pip install -r requirements-pdf.txt";
 $("scope-brief").textContent="允许范围 "+env.roots.length+" 处 · "+(env.roots[0]||"未设置");
 $("scope-brief").title=env.roots.join("\n");
 for(const [key,value] of [["运行平台",env.platform],["运行目录",env.cwd],["Python",env.python],["图片引擎","Pillow "+env.pillow],["视频依赖",env.ffmpeg&&env.ffprobe?"FFmpeg / ffprobe 可用":"缺少 FFmpeg/ffprobe，请安装并加入 PATH"],["允许范围",env.roots.join("\n")],["任务记录",env.data_dir]]){
  $("environment").append(el("dt",key),el("dd",value));
 }
 return env;
}
async function browseFolder(pathValue){
 if(folderState.nativeRequest&&!folderState.nativeRequest.finished)void cancelNative();
 const version=++folderState.version;
 $("folder-state").textContent="正在读取目录…";$("folder-state").classList.remove("error");$("choose-folder").disabled=true;
 try{
  const data=await json("/api/directories/browse",{method:"POST",body:{path:pathValue||null,purpose:folderState.purpose}});
  if(version!==folderState.version||!$("folder-dialog").open)return;
  folderState.path=data.path;folderState.parent=data.parent;
  $("folder-current").textContent=data.path||MSXI18n.t("请选择一个允许根目录");
  $("folder-up").disabled=!data.parent;$("choose-folder").disabled=!data.path;
  $("folder-list").replaceChildren();$("folder-roots").replaceChildren();
  folderState.shortcutItems=data.root_items||data.roots.map(path=>({path,pinned:false}));
  $("clear-directory-shortcuts").disabled=!folderState.shortcutItems.some(item=>!item.pinned);
  $("archived-directory-shortcuts").disabled=!data.hidden_roots_count;
  $("archived-directory-shortcuts").textContent="已归档"+(data.hidden_roots_count?" "+data.hidden_roots_count:"");
  for(const item of folderState.shortcutItems){
   const root=item.path,row=el("div",undefined,"folder-root-row");
   const button=el("button",undefined,"folder-root"),pin=el("button",undefined,"icon-button list-pin");
   button.append(el("span",root.split(/[\\/]/).filter(Boolean).pop()||root,"folder-root-label"));
   button.setAttribute("data-i18n-skip","");button.setAttribute("aria-label",root);button.title=root;
   button.classList.toggle("selected",!!data.path&&data.path.toLocaleLowerCase().startsWith(root.toLocaleLowerCase()));button.onclick=()=>browseFolder(root);
   pin.type="button";pin.dataset.directory=root;pin.setAttribute("aria-label",(item.pinned?"取消固定目录 ":"固定目录 ")+root);pin.setAttribute("aria-pressed",String(item.pinned));pin.title=item.pinned?"取消固定":"固定此入口，归档时保留";pin.append(iconElement("pin"));
   pin.onclick=async()=>{const version=folderState.version;pin.disabled=true;try{await json("/api/directories/shortcuts/pin",{method:"POST",body:{path:root,pinned:!item.pinned}});if(version===folderState.version&&$("folder-dialog").open){await browseFolder(folderState.path);[...document.querySelectorAll(".folder-root-row .list-pin")].find(b=>b.dataset.directory===root)?.focus();}}catch(error){$("folder-state").textContent=error.message;pin.disabled=false;}};
   row.append(button,pin);$("folder-roots").append(row);
  }
  if(!folderState.shortcutItems.length)$("folder-roots").append(el("p","没有快捷入口，可从“已归档”找回。","small muted"));
  for(const dir of data.directories){
   const button=el("button",undefined,"folder-entry");button.type="button";button.setAttribute("aria-label",dir.name);button.append(iconElement("folder"),el("span",dir.name,"mono"));button.onclick=()=>browseFolder(dir.path);$("folder-list").append(button);
  }
  $("folder-state").textContent=data.path?(data.directories.length?"子文件夹 "+data.directories.length+" 个":"当前文件夹没有可浏览的子目录，可直接选择。"):"从左侧选择允许范围。Windows 本地可使用系统窗口选择其他目录。";
  $("folder-skipped").textContent=data.skipped?"已隐藏 "+data.skipped+" 个依赖、隐藏或排除目录":"仅列出目录，不读取文件内容";
 }catch(error){if(version!==folderState.version)return;$("folder-state").textContent=error.message;$("folder-state").classList.add("error");}
}
async function openFolder(purpose,target,opener,nextMode=null){
 folderState.purpose=purpose;folderState.target=target;folderState.opener=opener;folderState.path=null;folderState.nextMode=nextMode;
 $("folder-title").textContent={media:"选择媒体目录",output:"选择输出目录",backup:"选择备份目录"}[purpose];
 $("folder-note").textContent=(state.environment?.runtime||"运行设备")+"上的文件夹；不会把浏览器所在设备的文件上传。";
 $("choose-folder").textContent=purpose==="media"?"扫描此目录":"使用此目录";
 $("native-folder-label").textContent=purpose==="media"?"系统选择并扫描…":"系统选择…";
 $("folder-scan-note").hidden=purpose!=="media";
 $("folder-dialog").showModal();
 const current=$(target).value.trim();
 await browseFolder(current||null);
}
function useFolder(value){
 if(!value)return;
 const nextMode=folderState.nextMode;
 if(folderState.purpose==="media"){
  if(importState.busy)return;
  if(!nextMode)$("media-path").value=value;
  $("folder-dialog").close();void scanDirectory(value,nextMode);return;
 }
 $(folderState.target).value=value;$(folderState.target).dispatchEvent(new Event("change",{bubbles:true}));
 $("folder-dialog").close();
}
$("guidance-scan").onclick=()=>{if(!importState.busy)void openFolder("media","media-path",$("guidance-scan"),intakeGuidance.mode);};
for(const id of ["empty-scan-directory","back-directory"])$(id).onclick=()=>{if(!importState.busy)void openFolder("media","media-path",$(id),"export");};
$("guidance-dismiss").onclick=()=>{
 if(localFolderPicker.request){void cancelLocalDirectoryPick();return;}
 const opener=intakeGuidance.opener;clearIntakeGuidance();
 (opener?.isConnected&&!opener.disabled&&opener.getClientRects().length?opener:$(state.scan?.source_kind==="import"?"add-import-files":"choose-import-files")).focus();
};
$("guidance-storage").onclick=()=>openStorage($("guidance-storage"));
$("import-to-backup").onclick=()=>{if(!importState.busy)void openFolder("media","media-path",$("import-to-backup"),"backup");};
$("browse-media").onclick=()=>openFolder("media","media-path",$("browse-media"));
$("browse-output").onclick=()=>openFolder("output","output-path",$("browse-output"));
$("browse-backup").onclick=()=>openFolder("backup","backup-path",$("browse-backup"));
$("folder-up").onclick=()=>browseFolder(folderState.parent);
$("choose-folder").onclick=()=>useFolder(folderState.path);
$("close-folder").onclick=()=>$("folder-dialog").close();
async function cancelNative(){
 const request=folderState.nativeRequest;if(!request||request.finished)return;
 request.cancelled=true;
 if(folderState.version===request.version&&$("folder-dialog").open)$("folder-state").textContent="正在取消系统选择…";
 try{
  await json("/api/directories/native/cancel",{method:"POST",body:{request_id:request.id}});
  if(folderState.nativeRequest===request&&folderState.version===request.version&&$("folder-dialog").open)$("folder-state").textContent="已取消系统选择，可以继续使用网页目录浏览器。";
 }catch(error){if(folderState.nativeRequest===request&&folderState.version===request.version&&$("folder-dialog").open){$("folder-state").textContent=error.message;$("folder-state").classList.add("error");}}
}
$("cancel-native-folder").onclick=cancelNative;
$("folder-dialog").addEventListener("close",()=>{folderState.version++;void cancelNative();folderState.opener?.focus();});
$("native-folder").onclick=async()=>{
 if(folderState.nativeRequest)return;
 const version=folderState.version,request={id:crypto.randomUUID(),version,cancelled:false,finished:false};folderState.nativeRequest=request;
 $("native-folder").disabled=true;$("cancel-native-folder").hidden=false;$("folder-state").classList.remove("error");
 $("folder-state").textContent="请在系统窗口选择目录；若未看到窗口，请查看任务栏中的 MediaSlim X，或点“取消系统选择”。";
 try{
  const result=await json("/api/directories/native",{method:"POST",body:{purpose:folderState.purpose,request_id:request.id}});
  if(request.cancelled||version!==folderState.version)return;
  await refreshEnvironment();if(request.cancelled||version!==folderState.version)return;
  request.finished=true;
  if(result.path)useFolder(result.path);else $("folder-state").textContent="已取消系统选择，可以继续在此浏览。";
 }catch(error){if(!request.cancelled&&version===folderState.version){$("folder-state").textContent=error.message;$("folder-state").classList.add("error");}}
 finally{request.finished=true;if(request.cancelled&&version===folderState.version&&$("folder-dialog").open)$("folder-state").textContent="已取消系统选择，可以继续使用网页目录浏览器。";if(folderState.nativeRequest===request){folderState.nativeRequest=null;$("native-folder").disabled=false;$("cancel-native-folder").hidden=true;}}
};
function syncThemeButton(){
 const dark=document.documentElement.dataset.theme==="dark",label=dark?"切换为浅色主题":"切换为深色主题";
 $("theme-toggle").setAttribute("aria-label",label);$("theme-toggle").title=label;
 $("theme-toggle").querySelector("use").setAttribute("href","/static/icons.svg#"+(dark?"sun":"moon"));
}
$("theme-toggle").onclick=()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;try{localStorage.setItem("mediaslimx-theme",next);}catch{}syncThemeButton();};
syncThemeButton();
for(const radio of document.querySelectorAll('input[name="preset"]'))radio.addEventListener("change",updateTaskPlan);
for(const id of ["resize-keep","resize-fit"])$(id).addEventListener("change",syncSizeControls);
for(const id of ["max-width","max-height","output-path","backup-path"])for(const event of ["input","change"])$(id).addEventListener(event,updateTaskPlan);
syncSizeControls();
document.addEventListener("keydown",event=>{if(event.altKey&&event.key.toLowerCase()==="o"&&!$("directory-section").hidden&&!$("scan-form").hidden){event.preventDefault();$("browse-media").click();}});

(async()=>{
 try{
  if(!token)throw Error("请从启动终端打开包含 #token= 的完整本机 URL");
  await json("/api/session",{method:"POST",body:{}});
  const env=await refreshEnvironment();setConnection("已连接",true);
  if(env.roots.length===1)$("media-path").value=env.roots[0];
  const tasks=await historyList();await refreshUnusedImports();
  const latest=tasks.filter(t=>t.status==="interrupted"||(t.status==="cancelled"&&t.stop_reason==="exit"))
   .sort((a,b)=>b.created-a.created)[0];
  if(latest&&state.intent===0)
   await openTask(latest.id);
  // The native cover may leave only after the actual workspace state loads.
  sendWindowMessage({op:"workspace_ready"});
 }catch(error){
  setConnection("尚未连接",false);showError(error);
  // This is presentation-only; it grants no directory or exit capability.
  try{window.chrome?.webview?.postMessage({op:"workspace_failed",language:MSXI18n.language==="en"?"en":"zh-CN",theme:document.documentElement.dataset.theme==="light"?"light":"dark"});}catch{}
 }
})();

document.addEventListener("mediaslimx-language",()=>{
 sendWindowUiReady();void historyList().catch(showError);
 if($("folder-dialog").open&&!folderState.path)$("folder-current").textContent=MSXI18n.t("请选择一个允许根目录");
});
