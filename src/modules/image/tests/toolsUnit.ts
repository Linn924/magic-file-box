import assert from 'node:assert/strict';
import {imageExif} from '../core/exif';
import {pixelAt,sampledColor} from '../core/colorSample';
import {withExif} from './toolsFixtures';
const jpeg=withExif(new Uint8Array([255,216,255,217]),6),fields=imageExif(jpeg);
assert.ok(fields.some(field=>field.label==='相机厂商'&&field.value==='Fixture Camera'));
assert.ok(fields.some(field=>field.label==='曝光时间'&&field.value==='1/125 s'));
assert.ok(fields.some(field=>field.label==='EXIF 方向'&&field.value==='旋转 90°'));
assert.ok(fields.some(field=>field.label==='拍摄时间'&&field.value==='2026:10:23 12:34:56'));
const tiff=jpeg.slice(12,4+((jpeg[4]<<8)|jpeg[5])),png=new Uint8Array(20+tiff.length+4);png.set([137,80,78,71,13,10,26,10]);new DataView(png.buffer).setUint32(8,tiff.length);png.set(new TextEncoder().encode('eXIf'),12);png.set(tiff,16);assert.deepEqual(imageExif(png),fields);
const webp=new Uint8Array(20+tiff.length+(tiff.length%2));webp.set(new TextEncoder().encode('RIFF'));webp.set(new TextEncoder().encode('WEBPEXIF'),8);new DataView(webp.buffer).setUint32(4,webp.length-8,true);new DataView(webp.buffer).setUint32(16,tiff.length,true);webp.set(tiff,20);assert.deepEqual(imageExif(webp),fields);
assert.deepEqual(imageExif(jpeg.slice(0,30)),[]);
const bad=jpeg.slice();bad.set([255,255,255,127],16);assert.deepEqual(imageExif(bad),[]);
for(const rotation of [0,90,180,270]){
  const width=80,height=40,angle=rotation*Math.PI/180,dx=-20,dy=-10,quarter=rotation%180!==0;
  const rect={left:20,top:30,width:quarter?height:width,height:quarter?width:height};
  const point={x:rect.left+rect.width/2+dx*Math.cos(angle)-dy*Math.sin(angle),y:rect.top+rect.height/2+dx*Math.sin(angle)+dy*Math.cos(angle)};
  const sampled=pixelAt(point,rect,{width,height},{width:800,height:400},rotation)!;
  assert.ok(Math.abs(sampled.x-200)<=1&&Math.abs(sampled.y-100)<=1);
}
assert.equal(pixelAt({x:-5,y:-5},{left:0,top:0,width:10,height:10},{width:10,height:10},{width:10,height:10},0),undefined);
assert.deepEqual(sampledColor([255,0,128,255]),{hex:'#FF0080',rgb:'RGB(255, 0, 128)',alpha:255});
assert.equal(sampledColor([1,2,3,128]).hex,'#01020380');
console.log('PASS bounded EXIF, malformed offsets, orientation, rotated pixel coordinates and RGBA');
