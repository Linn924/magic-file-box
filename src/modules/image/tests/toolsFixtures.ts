export function withExif(jpeg:Uint8Array,orientation=1,exposure:[number,number]=[1,125]){
  const bytes=new Uint8Array(1024),view=new DataView(bytes.buffer);bytes.set([73,73,42,0,8,0,0,0]);let data=256;
  const entry=(at:number,tag:number,type:number,value:string|number|[number,number])=>{
    view.setUint16(at,tag,true);view.setUint16(at+2,type,true);
    if(typeof value==='string'){const text=new TextEncoder().encode(value+'\0');view.setUint32(at+4,text.length,true);view.setUint32(at+8,data,true);bytes.set(text,data);data+=text.length;}
    else if(Array.isArray(value)){view.setUint32(at+4,1,true);view.setUint32(at+8,data,true);view.setUint32(data,value[0],true);view.setUint32(data+4,value[1],true);data+=8;}
    else{view.setUint32(at+4,1,true);if(type===3)view.setUint16(at+8,value,true);else view.setUint32(at+8,value,true);}
  };
  view.setUint16(8,4,true);entry(10,0x10f,2,'Fixture Camera');entry(22,0x110,2,'Model X');entry(34,0x112,3,orientation);entry(46,0x8769,4,80);
  view.setUint16(80,4,true);entry(82,0x9003,2,'2026:10:23 12:34:56');entry(94,0x829a,5,exposure);entry(106,0x829d,5,[28,10]);entry(118,0x8827,3,200);
  const tiff=bytes.slice(0,data),length=tiff.length+8,app=new Uint8Array(length+2);app.set([255,225,length>>8,length&255,69,120,105,102,0,0]);app.set(tiff,10);
  const out=new Uint8Array(jpeg.length+app.length);out.set(jpeg.subarray(0,2));out.set(app,2);out.set(jpeg.subarray(2),2+app.length);return out;
}
