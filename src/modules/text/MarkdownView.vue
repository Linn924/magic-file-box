<script setup lang="ts">
import {ref,watch,nextTick,onMounted,onBeforeUnmount} from 'vue';
import type {PreviewFile} from '../../../shared/contracts';
import {renderMarkdown,safeSvg} from './markdown';
import {renderDiagram} from './mermaid';
import {highlightRendered} from './renderedSearch';
const props=defineProps<{file:PreviewFile;raw:string;query:string;zoom:number}>();
const emit=defineEmits<{headings:[Array<{anchor:string;text:string;level:number}>];active:[string];hits:[{count:number;index:number}];error:[string]}>();
const article=ref<HTMLElement>(),html=ref(renderMarkdown(props.raw));
let revision=0,diagramRevision=0,disposed=false,urls:string[]=[],hits:HTMLElement[]=[],index=-1,themeObserver:MutationObserver|undefined,scrollRoot:Element|null=null,activeFrame=0;
const timers=new Set<ReturnType<typeof setTimeout>>();
let lastTheme=document.documentElement.dataset.theme;
let navigation:{anchor:string;top:number}|undefined;
function release(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
function updateActive(){if(activeFrame)return;activeFrame=requestAnimationFrame(()=>{activeFrame=0;const root=article.value,scroll=root?.closest('.text-scroll');if(!root||!scroll)return;if(navigation&&Math.abs(scroll.scrollTop-navigation.top)<1){emit('active',navigation.anchor);return;}navigation=undefined;const top=scroll.getBoundingClientRect().top+24;const list=Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'));let current=list[0];for(const heading of list){if(heading.getBoundingClientRect().top>top)break;current=heading;}emit('active',current?.dataset.mdAnchor||'');});}
function jumpAnchor(fragment:string,decoded=false){
  const root=article.value;if(!root)return false;let anchor:string;
  try{anchor=decoded?fragment:decodeURIComponent(fragment.replace(/^#/,''));}catch{emit('error','链接位置编码无效。');return false;}
  if(!anchor){root.closest('.text-scroll')?.scrollTo({top:0});return true;}
  const target=Array.from(root.querySelectorAll<HTMLElement>('[data-md-anchor],[id]')).find(n=>n.dataset.mdAnchor===anchor||n.dataset.mdOriginal===anchor||n.id===anchor);
  if(!target){emit('error','找不到文档中的链接位置。');return false;}target.scrollIntoView({block:'start'});if(target.dataset.mdAnchor){navigation={anchor:target.dataset.mdAnchor,top:root.closest('.text-scroll')?.scrollTop||0};emit('active',target.dataset.mdAnchor);}return true;
}
function findNext(delta=1){if(!hits.length)return;index=(index+delta+hits.length)%hits.length;for(const hit of hits)hit.classList.remove('md-current-hit');hits[index].classList.add('md-current-hit');hits[index].scrollIntoView({block:'center'});emit('hits',{count:hits.length,index});}
function search(){if(!article.value)return;hits=highlightRendered(article.value,props.query);index=-1;emit('hits',{count:hits.length,index});if(hits.length)findNext();}
async function click(event:MouseEvent){
  const target=event.target as Element,button=target.closest<HTMLButtonElement>('.md-copy-code');
  if(button){event.preventDefault();try{await window.localPreview.markdownCopy(props.file.id,button.closest('pre')?.querySelector('code')?.textContent||'');button.title='已复制';button.setAttribute('aria-label','已复制');const timer=setTimeout(()=>{timers.delete(timer);button.title='复制代码';button.setAttribute('aria-label','复制代码');},1800);timers.add(timer);}catch(e){emit('error',String(e));}return;}
  const link=target.closest<HTMLAnchorElement>('a');if(!link)return;event.preventDefault();const href=link.getAttribute('data-md-href')??link.getAttribute('href');if(!href)return;emit('error','');if(href.startsWith('#')){jumpAnchor(href);return;}
  try{await window.localPreview.followMarkdownLink(props.file.id,href);}catch(e){emit('error',String(e).replace(/^Error:.*?Error: /,''));}
}
function imageError(image:HTMLImageElement,message:string){image.hidden=true;const label=document.createElement('span');label.className='md-image-error';label.textContent=`图片 ${image.alt||''}：${message}`;label.setAttribute('role','note');image.after(label);}
async function loadImages(root:HTMLElement,valid:()=>boolean){
  let total=0,count=0;
  for(const image of root.querySelectorAll<HTMLImageElement>('img[data-md-image]')){
    if(!valid())return;
    if(++count>64||total>=64*1024*1024){imageError(image,'本页图片数量或字节额度已用完。');continue;}
    try{
      const result=await window.localPreview.markdownImage(props.file.id,image.dataset.mdImage||'');if(!valid())return;
      total+=result.data.byteLength;if(total>64*1024*1024)throw Error('本页图片合计超过 64 MB。');
      const data=result.mime==='image/svg+xml'?safeSvg(new TextDecoder().decode(result.data)):result.data;
      const url=URL.createObjectURL(new Blob([data],{type:result.mime}));urls.push(url);image.src=url;try{await image.decode();}catch{if(valid())imageError(image,'无法解码此图片。');}if(valid())updateActive();
    }catch(e){if(valid())imageError(image,String(e).replace(/^Error:.*?Error: /,''));}
  }
}
async function diagrams(root:HTMLElement,valid:()=>boolean){
  const token=++diagramRevision,previousValid=valid;valid=()=>previousValid()&&diagramRevision===token;
  for(const old of root.querySelectorAll('.md-diagram,.md-diagram-toggle'))old.remove();
  for(const pre of root.querySelectorAll('.md-diagram-source'))pre.classList.remove('md-diagram-source','md-source-visible');
  let count=0;
  for(const code of root.querySelectorAll<HTMLElement>('pre>code.language-mermaid')){
    if(!valid())return;const pre=code.parentElement!,host=document.createElement('div');host.className='md-diagram';pre.after(host);
    try{if(++count>20)throw Error('本页图表数量超过 20 个。');const svg=await renderDiagram(code.textContent||'',document.documentElement.dataset.theme==='dark',valid);if(!valid())return;
      const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<style>:host{display:block;overflow:auto}svg{display:block;max-width:100%;height:auto;margin:auto}</style>'+svg;pre.classList.add('md-diagram-source');
      const toggle=document.createElement('button');toggle.type='button';toggle.className='md-diagram-toggle';toggle.title='查看图表源码';toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-expanded','false');toggle.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 4-4 4 4 4M11 4l4 4-4 4M9 2 7 14"/></svg>';toggle.onclick=()=>{const visible=pre.classList.toggle('md-source-visible');toggle.title=visible?'收起图表源码':'查看图表源码';toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-expanded',String(visible));search();};host.before(toggle);
    }catch(e){if(valid()){host.classList.add('md-diagram-error');const message=e instanceof Error?e.message:'';host.textContent=/^(图表过大|本页图表数量)/.test(message)?message:'图表无法显示，请检查 Mermaid 语法。源码已保留。';}}
  }
}
async function decorate(){
  const token=++revision;release();await nextTick();const root=article.value;if(!root)return;const valid=()=>!disposed&&revision===token;
  emit('headings',Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'),h=>({anchor:h.dataset.mdAnchor!,text:h.textContent||'',level:Number(h.tagName.slice(1))})));
  for(const pre of root.querySelectorAll('pre')){const button=document.createElement('button');button.type='button';button.className='md-copy-code';button.title='复制代码';button.setAttribute('aria-label','复制代码');button.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 5h8v9H6V5ZM10 5V2H2v9h4"/></svg>';pre.prepend(button);}
  search();const loading=Promise.all([loadImages(root,valid),diagrams(root,valid)]).then(()=>{if(valid()){search();updateActive();}});
  const anchor=props.file.view?.markdownAnchor;if(anchor){delete props.file.view!.markdownAnchor;await loading;if(valid())jumpAnchor(anchor,true);}
}
watch(()=>props.raw,()=>{html.value=renderMarkdown(props.raw);void decorate();});
watch(()=>props.query,()=>{void nextTick().then(search);});
onMounted(()=>{void decorate();scrollRoot=article.value?.closest('.text-scroll')||null;scrollRoot?.addEventListener('scroll',updateActive,{passive:true});themeObserver=new MutationObserver(()=>{const theme=document.documentElement.dataset.theme;if(theme===lastTheme)return;lastTheme=theme;const root=article.value,token=revision;if(root)void diagrams(root,()=>!disposed&&revision===token).then(()=>{if(!disposed){search();updateActive();}});});themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});});
onBeforeUnmount(()=>{disposed=true;revision++;diagramRevision++;release();scrollRoot?.removeEventListener('scroll',updateActive);themeObserver?.disconnect();cancelAnimationFrame(activeFrame);for(const timer of timers)clearTimeout(timer);});
defineExpose({jumpAnchor,findNext});
</script>
<template><article ref="article" class="markdown preview-content" :style="{fontSize:15*zoom/100+'px'}" @click="click" v-html="html"></article></template>
