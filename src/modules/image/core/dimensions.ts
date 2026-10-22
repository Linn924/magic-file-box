export type ImageSize={width:number;height:number;mime:string};
/** Bounded header inspection; never allocate decoded pixels to discover dimensions. */
export function imageSize(bytes:Uint8Array):ImageSize|undefined{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const text=(start:number,length:number)=>String.fromCharCode(...bytes.subarray(start,start+length));
  if(bytes.length>=24&&text(1,3)==='PNG')return {width:view.getUint32(16),height:view.getUint32(20),mime:'image/png'};
  if(bytes.length>=10&&text(0,3)==='GIF')return {width:view.getUint16(6,true),height:view.getUint16(8,true),mime:'image/gif'};
  if(bytes.length>=26&&text(0,2)==='BM'){
    const size=view.getUint32(14,true);
    return size===12?{width:view.getUint16(18,true),height:view.getUint16(20,true),mime:'image/bmp'}:{width:Math.abs(view.getInt32(18,true)),height:Math.abs(view.getInt32(22,true)),mime:'image/bmp'};
  }
  if(bytes.length>=30&&text(0,4)==='RIFF'&&text(8,4)==='WEBP'){
    if(text(12,4)==='VP8X')return {width:1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),height:1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16),mime:'image/webp'};
    if(text(12,4)==='VP8 '&&text(23,3)==='\x9d\x01\x2a')return {width:view.getUint16(26,true)&16383,height:view.getUint16(28,true)&16383,mime:'image/webp'};
    if(text(12,4)==='VP8L'&&bytes[20]===47){const bits=view.getUint32(21,true);return {width:(bits&16383)+1,height:((bits>>>14)&16383)+1,mime:'image/webp'};}
  }
  if(bytes[0]===255&&bytes[1]===216){
    for(let at=2;at+4<bytes.length;){
      if(bytes[at++]!==255)continue;while(bytes[at]===255)at++;const marker=bytes[at++];
      if(marker===0xd9||marker===0xda)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
      if(at+2>bytes.length)break;const length=view.getUint16(at);if(length<2)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&at+7<=bytes.length)return {height:view.getUint16(at+3),width:view.getUint16(at+5),mime:'image/jpeg'};
      at+=length;
    }
  }
}
export function validateImageSize(size:ImageSize|undefined):ImageSize{
  if(!size||!size.width||!size.height)throw Error('无法在读取预算内识别图片尺寸。');
  if(!Number.isSafeInteger(size.width*size.height)||size.width*size.height>64_000_000||size.width>65535||size.height>65535)throw Error('图片解码像素超过 6400 万像素预算，请先缩小原图。');
  return size;
}
