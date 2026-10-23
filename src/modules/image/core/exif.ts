export interface ImageInfoField {label:string;value:string}
/** Read bounded JPEG/PNG/WebP EXIF headers only. Never follow file/network references. */
export function imageExif(input:Uint8Array):ImageInfoField[]{
  const bytes=input.subarray(0,1024*1024),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const text=(at:number,size:number)=>String.fromCharCode(...bytes.subarray(at,at+Math.min(size,512)));
  let base=-1,end=bytes.length;
  try{
    if(bytes[0]===255&&bytes[1]===216){
      for(let at=2;at+4<=bytes.length;){
        if(bytes[at]!==255)break;const marker=bytes[at+1];if(marker===0xda||marker===0xd9)break;
        if(marker===255){at++;continue;}if(marker>=0xd0&&marker<=0xd7){at+=2;continue;}
        const length=view.getUint16(at+2);if(length<2||at+2+length>bytes.length)break;
        if(marker===0xe1&&text(at+4,6)==='Exif\0\0'){base=at+10;end=at+2+length;break;}at+=2+length;
      }
    }else if(text(1,3)==='PNG'){
      for(let at=8;at+12<=bytes.length;){const length=view.getUint32(at);if(length>bytes.length-at-12||text(at+4,4)==='IEND')break;if(text(at+4,4)==='eXIf'){base=at+8;end=base+length;break;}at+=length+12;}
    }else if(text(0,4)==='RIFF'&&text(8,4)==='WEBP'){
      for(let at=12;at+8<=bytes.length;){const length=view.getUint32(at+4,true);if(length>bytes.length-at-8)break;if(text(at,4)==='EXIF'){base=at+8;end=base+length;if(text(base,6)==='Exif\0\0')base+=6;break;}at+=8+length+(length%2);}
    }
    if(base<0||base+8>end)return [];
    const little=text(base,2)==='II';if(!little&&text(base,2)!=='MM')return [];
    const bounds=(at:number,n:number)=>{if(!Number.isSafeInteger(at)||!Number.isSafeInteger(n)||at<base||n<0||at+n>end)throw Error('EXIF boundary');};
    const u16=(at:number)=>{bounds(at,2);return view.getUint16(at,little);},u32=(at:number)=>{bounds(at,4);return view.getUint32(at,little);};
    if(u16(base+2)!==42)return [];
    const tags=new Map<number,string|number[]>(),gps=new Map<number,string|number[]>(),visited=new Set<number>();let entries=0;
    const read=(offset:number,target:typeof tags,depth=0)=>{
      if(depth>4||visited.has(offset))return;visited.add(offset);const at=base+offset,count=u16(at);if(count>256||entries+count>512)throw Error('EXIF entries');entries+=count;bounds(at+2,count*12+4);
      for(let i=0;i<count;i++){
        const entry=at+2+i*12,tag=u16(entry),type=u16(entry+2),count=u32(entry+4),size=({1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8} as Record<number,number>)[type];
        if(!size||count>512)continue;const length=count*size,start=length<=4?entry+8:base+u32(entry+8);bounds(start,length);
        if((tag===0x8769||tag===0x8825)&&type===4&&count===1){read(u32(start),tag===0x8825?gps:target,depth+1);continue;}
        if(type===2){target.set(tag,new TextDecoder('utf-8').decode(bytes.subarray(start,start+length)).replace(/[\u0000-\u001f]/g,' ').trim());continue;}
        if(type===7)continue;const values:number[]=[];
        for(let n=0;n<count;n++){const pos=start+n*size;let value:number;
          if(type===5||type===10){const numerator=type===10?view.getInt32(pos,little):u32(pos),denominator=type===10?view.getInt32(pos+4,little):u32(pos+4);value=denominator?numerator/denominator:NaN;}
          else value=type===1?bytes[pos]:type===3?u16(pos):type===9?view.getInt32(pos,little):u32(pos);values.push(value);
        }target.set(tag,values);
      }
    };
    read(u32(base+4),tags);
    const fields:ImageInfoField[]=[],string=(tag:number)=>{const value=tags.get(tag);return typeof value==='string'?value:'';},number=(tag:number)=>{const value=tags.get(tag);return Array.isArray(value)&&Number.isFinite(value[0])?value[0]:undefined;};
    const add=(label:string,value:string|number|undefined)=>{if(value!==undefined&&value!=='')fields.push({label,value:String(value)});};
    add('相机厂商',string(0x10f));add('相机型号',string(0x110));add('拍摄时间',string(0x9003)||string(0x132));add('镜头',string(0xa434));
    const exposure=number(0x829a),aperture=number(0x829d),focal=number(0x920a);
    add('曝光时间',exposure===undefined?undefined:exposure>0&&exposure<1?`1/${Math.round(1/exposure)} s`:`${exposure} s`);
    add('光圈',aperture===undefined?undefined:`f/${Number(aperture.toFixed(2))}`);add('ISO',number(0x8827));add('焦距',focal===undefined?undefined:`${Number(focal.toFixed(2))} mm`);
    const orientations=['','正常','水平镜像','旋转 180°','垂直镜像','转置','旋转 90°','横向转置','旋转 270°'];add('EXIF 方向',orientations[number(0x112)??0]||undefined);
    add('软件',string(0x131));add('作者',string(0x13b));add('版权',string(0x8298));
    const coordinate=(tag:number,ref:number)=>{const value=gps.get(tag),direction=gps.get(ref);if(!Array.isArray(value)||value.length!==3||!value.every(Number.isFinite)||typeof direction!=='string')return;return (value[0]+value[1]/60+value[2]/3600)*(/[SW]/.test(direction)?-1:1);};
    const latitude=coordinate(2,1),longitude=coordinate(4,3);
    if(latitude!==undefined&&longitude!==undefined&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180)add('GPS',`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    return fields;
  }catch{return [];}
}
