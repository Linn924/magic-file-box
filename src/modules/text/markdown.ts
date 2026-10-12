import DOMPurify from 'dompurify';
import {Marked,Renderer} from 'marked';
import footnote from 'marked-footnote';
import katex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
export const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function headingSlug(text:string){return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}_ -]/gu,'').trim().replace(/\s/g,'-');}
const renderer=new Renderer();
renderer.link=function({href,title,tokens}){return `<a href="#" data-md-href="${escapeHtml(href)}"${title?` title="${escapeHtml(title)}"`:''}>${this.parser.parseInline(tokens)}</a>`;};
renderer.image=({href,title,text})=>`<img data-md-image="${escapeHtml(href)}" alt="${escapeHtml(text)}"${title?` title="${escapeHtml(title)}"`:''}>`;
renderer.checkbox=({checked})=>`<span class="md-task" role="img" aria-label="${checked?'已完成':'未完成'}">${checked?'☑':'☐'}</span> `;
let mathCount=0;
const math=katex({throwOnError:false,trust:false,maxExpand:1000,maxSize:20,strict:'warn'});
for(const extension of math.extensions||[]){const render=extension.renderer;if(render)extension.renderer=function(token){if(++mathCount>500||String(token.text).length>10000)return `<code title="公式超过渲染额度，显示源码">${escapeHtml(String(token.raw))}</code>`;return render.call(this,token);};}
const parser=new Marked({renderer,gfm:true}).use(footnote({description:'脚注',backRefLabel:'返回正文'})).use(math);
export function renderMarkdown(text:string){
  mathCount=0;const template=document.createElement('template');
  template.innerHTML=DOMPurify.sanitize(parser.parse(text,{async:false}),{FORBID_TAGS:['iframe','object','embed','form','input','button','style','video','audio','source'],FORBID_ATTR:['srcset','name']});
  const counts=new Map<string,number>();
  for(const heading of template.content.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')){
    const slug=headingSlug(heading.textContent||'')||'section',count=counts.get(slug)||0;counts.set(slug,count+1);
    heading.dataset.mdOriginal=heading.id;heading.dataset.mdAnchor=slug+(count?'-'+count:'');heading.id='md-heading-'+heading.dataset.mdAnchor;
  }
  // Neutralize raw HTML images before the fragment reaches the live document.
  for(const image of template.content.querySelectorAll('img')){if(!image.hasAttribute('data-md-image'))image.dataset.mdImage=image.getAttribute('src')||'';image.removeAttribute('src');image.removeAttribute('srcset');}
  return template.innerHTML;
}
export function safeSvg(text:string){
  const template=document.createElement('template');template.innerHTML=DOMPurify.sanitize(text,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['foreignObject','image','a','script','animate','set'],FORBID_ATTR:['onload','onclick']});
  for(const element of template.content.querySelectorAll('*'))for(const attr of Array.from(element.attributes)){
    if((attr.name==='href'||attr.name==='xlink:href')&&!attr.value.startsWith('#'))element.removeAttribute(attr.name);
    if(attr.name==='style'&&/url\s*\(/i.test(attr.value)&&!/url\s*\(\s*['"]?#/i.test(attr.value))element.removeAttribute(attr.name);
  }
  return template.innerHTML;
}
