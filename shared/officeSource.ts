import {sourceXml} from './sourceXml';
import type {SourceArchive} from './fileSource';
export function partPath(base:string,target:string){
  const parts=target.startsWith('/')?[]:base.split('/').slice(0,-1);
  for(const part of target.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)throw Error('Office 关系指向无效位置。');parts.pop();}else parts.push(part);}
  if(target.includes('\\')||target.includes(':')||target.includes('\0'))throw Error('Office 关系地址无效。');
  return parts.join('/');
}
export const localName=(name:string)=>name.split(':').pop()!;
export async function relationships(archive:SourceArchive,part:string,signal:AbortSignal){
  const name=part.split('/');const file=name.pop()!;name.push('_rels',file+'.rels');const relation=name.join('/');
  const map=new Map<string,string>();if(!archive.names.includes(relation))return map;
  const data=await archive.small(relation,4*1024*1024,signal);
  const parser=sourceXml({open(tag){if(localName(tag.name)==='Relationship'&&tag.attributes.TargetMode!=='External')map.set(tag.attributes.Id,partPath(part,tag.attributes.Target));}});
  parser.write(new TextDecoder().decode(data));parser.close();return map;
}
