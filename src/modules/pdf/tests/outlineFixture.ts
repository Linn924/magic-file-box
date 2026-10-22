import {writeFileSync} from 'node:fs';

/** Three local-only pages with enough bookmarks to scroll the outline pane. */
export function outlineFixture(path:string,titles?:string[],parents?:Array<number|null>){
 const content='0.2 0.4 0.8 rg 40 40 100 100 re f';
 const count=30;
 const roots=parents?.flatMap((parent,i)=>parent===null?[i]:[]);
 const descendants=(index:number):number=>parents?.reduce<number>((total,parent,i)=>parent===index?total+1+descendants(i):total,0)??0;
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R /Outlines 7 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 300] /Resources << >> /Contents 6 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 300] /Resources << >> /Contents 6 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 300] /Resources << >> /Contents 6 0 R >>',
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  `<< /Type /Outlines /First ${8+(roots?.[0]??0)} 0 R /Last ${8+(roots?.at(-1)??count-1)} 0 R /Count ${count} >>`,
  ...Array.from({length:count},(_,i)=>{
   const siblings=parents?.flatMap((parent,j)=>parent===parents[i]?[j]:[]),position=siblings?.indexOf(i)??i;
   const before=siblings?siblings[position-1]:i-1,after=siblings?siblings[position+1]:i+1;
   const prev=before!==undefined&&before>=0?`/Prev ${8+before} 0 R`:'';
   const next=after!==undefined&&after<count?`/Next ${8+after} 0 R`:'';
   const children=parents?.flatMap((parent,j)=>parent===i?[j]:[]);
   const branch=children?.length?` /First ${8+children[0]} 0 R /Last ${8+children.at(-1)!} 0 R /Count ${descendants(i)}`:'';
   const parent=parents?.[i]===null||parents?.[i]===undefined?7:8+parents[i]!;
   const title=titles?.[i]??(i===0?'Section One':i===count-1?'Section Two':`Chapter ${i}`);
   const encoded=titles?'<FEFF'+title.split('').map(char=>char.charCodeAt(0).toString(16).padStart(4,'0')).join('')+'>':`(${title})`;
   const target=i===0?3:i===count-1?5:4;
   return `<< /Title ${encoded} /Parent ${parent} 0 R ${prev} ${next}${branch} /Dest [${target} 0 R /Fit] >>`;
  }),
 ];
 let pdf='%PDF-1.4\n';const offsets=objects.map((object,i)=>{const offset=Buffer.byteLength(pdf);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;return offset;});
 const xref=Buffer.byteLength(pdf);
 pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 writeFileSync(path,pdf);
}
