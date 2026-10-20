"use strict";
/* Local display localization only. Task records, filenames, paths, API values,
   fingerprints and settings are never translated or rewritten. */
window.MSXI18n=(()=>{
 const messages=window.MSXEnglish, sources=new WeakMap(),attributes=new WeakMap();
 let language="zh-CN";try{if(localStorage.getItem("mediaslimx-language")==="en")language="en";}catch{}
 const prefixes={
  "后台任务未能启动：":"The background task could not start: ",
  "文件操作失败，请检查权限、路径或磁盘空间：":"File operation failed. Check permissions, paths, and disk space: ",
  "媒体解码/编码失败：":"Media decoding/encoding failed: ",
  "导入路径包含隐藏、依赖、输出或备份目录：":"Import path contains an excluded folder: ",
  "导入文件与目录名称冲突，请重命名：":"Import file/folder name conflict. Rename: ",
  "允许根目录不存在：":"Allowed root does not exist: ",
  "目录无法访问：":"Folder inaccessible: ","恢复跳过：":"Restore skipped: ",
  "请求失败：":"Request failed: ","路径区分：":"Distinct import path: ",
  "固定任务 ":"Pin task ","取消固定任务 ":"Unpin task ","归档任务 ":"Archive task ","固定目录 ":"Pin folder ","取消固定目录 ":"Unpin folder ",
  "选择 ":"Select ","已选 ":"Selected ","清理未使用副本 · ":"Clean unused copies · ",
  "任务结果 · ":"Task results · ","实际节省 ":"Space saved: ","处理耗时 ":"Processing time: ",
  "已清空 ":"Cleared ","已归档 ":"Archived ","已隐藏 ":"Hidden ","子文件夹 ":"Subfolders: ",
  "隐藏项 ":"Hidden entries: ","依赖、输出或备份目录项 ":"Dependency/output/backup entries: ",
  "不支持的扩展名 ":"Unsupported extensions: ","无法读取或空/过大文件 ":"Unreadable, empty, or oversized files: ",
  "已跳过：":"Skipped: ","正在收集：":"Collecting: ",
  "已验证当前服务收到的副本；":"Validated copies received by this service; "
 };
 const suffixes={
  "：文件需大于 0 且不超过 1 GiB":": file must be larger than zero and no larger than 1 GiB",
  "：无法读取文件":": cannot read file","：无法读取目录":": cannot read folder","：暂不支持此格式":": unsupported format",
  " 个文件未完整传入，未加入待处理列表":" files were not fully transferred and were not added",
  " 条，可找回；固定和进行中项保留。":" entries; they can be recovered. Pinned and active tasks remain.",
  " 个快捷入口，允许范围未改变。":" shortcuts; allowed folders are unchanged.",
  " 个依赖、隐藏或排除目录":" dependency, hidden, or excluded folders",
  " 个文件 · 结果以实际处理为准":" files · Results are measured after processing",
  " 按原大小从大到小显示。":" Shown by original size, largest first.",
  " 秒":" seconds"
 };
 const prefixKeys=Object.keys(prefixes).sort((a,b)=>b.length-a.length),suffixKeys=Object.keys(suffixes).sort((a,b)=>b.length-a.length);
 function english(source,depth=0){
  if(!source||depth>14)return source;
  if(Object.hasOwn(messages,source))return messages[source];
  const core=source.trim();if(core!==source){const index=source.indexOf(core);return source.slice(0,index)+english(core,depth+1)+source.slice(index+core.length);}
  if(!/[\u3400-\u9fff]/.test(source))return source;
  let m;
  if((m=source.match(/^最大宽度：(.*)；最大高度：(.*)。$/)))
   return "Max width: "+english(m[1],depth+1)+"; max height: "+english(m[2],depth+1)+".";
  if((m=source.match(/^清理未使用副本 · (\d+)$/)))return "Clean unused copies · "+m[1];
  if((m=source.match(/^非媒体 (\d+) 项（未读取内容），排除目录 (\d+) 个，隐藏文件 (\d+) 项。([\s\S]*)$/)))
   return "Non-media "+m[1]+" (contents not read), excluded folders "+m[2]+", hidden files "+m[3]+". "+english(m[4],depth+1);
  if((m=source.match(/^将移出 (\d+) 条；保留 (\d+) 条固定项(?:、(\d+) 条进行中任务)?。$/)))
   return "Remove "+m[1]+" entries; keep "+m[2]+" pinned"+(m[3]?" and "+m[3]+" active":"")+".";
  if((m=source.match(/^清空这 (\d+) 条$/)))return "Clear these "+m[1]+" entries";
  if((m=source.match(/^归档这 (\d+) 条$/)))return "Archive these "+m[1]+" entries";
  if((m=source.match(/^(\d+) 页$/)))return m[1]+" pages";
  if((m=source.match(/^清理 (\d+) 批未用于任务的导入副本（(.*)）？只删除当前服务保存的副本，不删除你拖入的原文件、任务原始副本或导出结果。$/)))
   return "Delete "+m[1]+" unused import batches ("+m[2]+") from this service? Dropped originals, task source copies, and exported results will remain.";
  if((m=source.match(/^所选示例 (.*)：(.*)；按像素取整，不裁切。$/)))
   return "Selected example "+m[1]+": "+m[2]+"; rounded to whole pixels, no cropping.";
  if((m=source.match(/^允许范围 (\d+) 处 · (.*)$/)))return "Allowed folders: "+m[1]+" · "+m[2];
  if((m=source.match(/^(.*)上的文件夹；不会把浏览器所在设备的文件上传。$/)))
   return "Folders on "+english(m[1],depth+1)+". Browser-device files are not uploaded by folder scanning.";
  if((m=source.match(/^传输失败（(\d+)）$/)))return "Transfer failed ("+m[1]+")";
  if((m=source.match(/^(.*) · (导出新目录|备份覆盖|直接覆盖)$/)))return english(m[1],depth+1)+" · "+english(m[2],depth+1);
  if((m=source.match(/^(\d+) 个候选$/)))return m[1]+" candidates";
  if((m=source.match(/^(\d+) 个文件$/)))return m[1]+" files";
  if((m=source.match(/^(\d+) 项 · 错误 (\d+)$/)))return m[1]+" items · Errors "+m[2];
  if((m=source.match(/^(\d+) (项|个|条)(。)?$/)))return m[1]+" "+({项:"items",个:"folders",条:"entries"}[m[2]])+(m[3]?".":"");
  if((m=source.match(/^(.*) · 已找到 (\d+) 个媒体文件$/)))return english(m[1],depth+1)+" · Found "+m[2]+" media files";
  if((m=source.match(/^(.+) (\d+)$/)))return english(m[1],depth+1)+" "+m[2];
  if((m=source.match(/^(.*)候选 · (.*)$/)))return english(m[1]+"候选",depth+1)+" · "+m[2];
  if((m=source.match(/^(.*[/\\])本次任务目录([/\\])(.*)$/)))return english(m[1].slice(0,-1),depth+1)+m[1].slice(-1)+"new-task"+m[2]+english(m[3],depth+1);
  if(source.includes("\n"))return source.split("\n").map(v=>english(v,depth+1)).join("\n");
  if(source.includes(" · "))return source.split(" · ").map(v=>english(v,depth+1)).join(" · ");
  for(const key of prefixKeys)if(source.startsWith(key))return prefixes[key]+english(source.slice(key.length),depth+1);
  for(const key of suffixKeys)if(source.endsWith(key))return english(source.slice(0,-key.length),depth+1)+suffixes[key];
  if(/^(?:[A-Za-z]:[\\/]|\/)/.test(source)||/\.(?:jpe?g|png|webp|mp4)$/i.test(source))return source;
  if(source.startsWith("原媒体\n"))return "Original media\n"+english(source.slice(4),depth+1);
  if(source==="原媒体")return "Original media";if(source==="结果媒体")return "Result media";
  if(source.includes("；"))return source.split("；").map(v=>english(v,depth+1)).join("; ");
  const sentences=source.match(/[^。]+。?/g);if(sentences?.length>1)return sentences.map(v=>english(v,depth+1)).join(" ");
  if((m=source.match(/^(.*)：(.*)$/)))return m[1]+": "+english(m[2],depth+1);
  return source; // Preserve OS diagnostics and user metadata verbatim.
 }
 function t(source){source=String(source??"");return language==="en"?english(source):source;}
 function excluded(node){return !!node.parentElement?.closest("[data-i18n-skip],script,style,pre,code");}
 function text(node){
  if(excluded(node))return;
  let record=sources.get(node);
  if(!record||node.nodeValue!==record.last)record={source:node.nodeValue,last:node.nodeValue};
  const value=t(record.source);record.last=value;sources.set(node,record);
  if(node.nodeValue!==value)node.nodeValue=value;
 }
 const attrNames=["title","aria-label","placeholder","alt","content"];
 function attrs(node){
  if(node.closest("[data-i18n-skip],script,style"))return;
  let records=attributes.get(node);if(!records){records={};attributes.set(node,records);}
  for(const name of attrNames){
   if(!node.hasAttribute(name))continue;
   const value=node.getAttribute(name);let record=records[name];
   if(!record||value!==record.last)record={source:value,last:value};
   const translated=t(record.source);record.last=translated;records[name]=record;
   if(value!==translated)node.setAttribute(name,translated);
  }
 }
 function tree(root){
  if(root.nodeType===Node.TEXT_NODE){text(root);return;}
  if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;
  if(root.nodeType===Node.ELEMENT_NODE)attrs(root);
  const walk=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let node;
  while((node=walk.nextNode()))node.nodeType===Node.TEXT_NODE?text(node):attrs(node);
 }
 function sourceText(element){let value="";const walk=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;while((node=walk.nextNode()))value+=(sources.get(node)?.source??node.nodeValue);return value;}
 function apply(){
  document.documentElement.lang=language;tree(document.documentElement);
  const button=document.getElementById("language-toggle");
  if(button){button.textContent=language==="en"?"中文":"EN";button.setAttribute("aria-label",language==="en"?"切换为中文":"Switch to English");button.title=button.getAttribute("aria-label");button.lang=language==="en"?"zh-CN":"en";}
 }
 const observer=new MutationObserver(records=>{
  for(const record of records){
   if(record.type==="characterData")text(record.target);
   else if(record.type==="attributes")attrs(record.target);
   else for(const node of record.addedNodes)tree(node);
  }
 });
 apply();observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attrNames});
 document.getElementById("language-toggle").onclick=()=>{
  language=language==="en"?"zh-CN":"en";try{localStorage.setItem("mediaslimx-language",language);}catch{}
  apply();document.dispatchEvent(new Event("mediaslimx-language"));
 };
 return {t,sourceText,get language(){return language;}};
})();
