import {evictInactivePreviews} from '../../../../tests/previewPressure';
import assert from 'node:assert/strict';
import type { Suite } from "../../../../tests/context";
import { existsSync, writeFileSync } from "node:fs";
const suite: Suite = async (c) => {
  for (const ext of ["jpeg", "webp", "gif", "bmp"]) {
    if (existsSync(c.fixture("image." + ext))) continue;
    let bytes: Buffer;
    if (ext === "jpeg" || ext === "webp")
      bytes = Buffer.from(
        await c.evaluate<string>(
          c.home,
          `(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;return canvas.toDataURL('image/${ext}').split(',')[1]})()`,
        ),
        "base64",
      );
    else if (ext === "gif")
      bytes = Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      );
    else {
      bytes = Buffer.alloc(58);
      bytes.write("BM");
      bytes.writeUInt32LE(58, 2);
      bytes.writeUInt32LE(54, 10);
      bytes.writeUInt32LE(40, 14);
      bytes.writeInt32LE(1, 18);
      bytes.writeInt32LE(1, 22);
      bytes.writeUInt16LE(1, 26);
      bytes.writeUInt16LE(24, 28);
      bytes[54] = 255;
    }
    writeFileSync(c.fixture("image." + ext), bytes);
  }
  for (const name of [
    "image.png",
    "vector.svg",
    "image.jpeg",
    "image.webp",
    "image.gif",
    "image.bmp",
  ]) {
    const win = await c.open(name);
    await c.check(
      win,
      "image decoded " + name,
      "document.querySelector('.image img').naturalWidth>0",
    );
    const width = (await c.evaluate(
      win,
      "document.querySelector('.image img').getBoundingClientRect().width",
    )) as number;
    await c.wheel(win, ".image img", -120);
    await c.check(
      win,
      "image wheel does not zoom",
      "document.querySelector('.zoom-control input').value==='100'",
    );
    await c.check(
      win,
      "image zoom keeps fit baseline",
      `Math.abs(document.querySelector('.image img').getBoundingClientRect().width/${width}-1)<0.03`,
    );
    c.close(win);
  }
  const jpeg=Buffer.from(await c.evaluate<string>(c.home,"(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,40,40);x.fillStyle='blue';x.fillRect(40,0,40,40);return c.toDataURL('image/jpeg',1).split(',')[1]})()"),'base64');
  // Fixed little-endian EXIF APP1; Chromium should apply it exactly once.
  const exif=Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');
  for(const orientation of [1,2,3,4,5,6,7,8]){
    const segment=Buffer.from(exif);segment.writeUInt16LE(orientation,28);
    const name='audit-oriented-'+orientation+'.jpg';if(!existsSync(c.fixture(name)))writeFileSync(c.fixture(name),Buffer.concat([jpeg.subarray(0,2),segment,jpeg.subarray(2)]));
    const oriented=await c.open(name);const swapped=orientation>=5;
    assert.equal(await c.evaluate(oriented,`(()=>{const i=document.querySelector('.image img'),r=i.getBoundingClientRect();return i.naturalWidth===${swapped?40:80}&&i.naturalHeight===${swapped?80:40}&&Math.abs(r.width/r.height-${swapped?.5:2})<.02})()`),true,'EXIF orientation must be applied exactly once: '+orientation);
    const red=await c.evaluate<boolean>(oriented,"(()=>{const i=document.querySelector('.image img'),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);const p=x.getImageData(c.width/4,c.height/4,1,1).data;return p[0]>p[2]})()");assert.equal(red,[true,false,false,true,true,true,false,false][orientation-1],'EXIF mirrored/rotated pixels '+orientation);
    c.pass('EXIF '+orientation+' dimensions and pixel direction');c.close(oriented);
  }
  const wideBytes=Buffer.from(await c.evaluate<string>(c.home,"(()=>{const c=document.createElement('canvas');c.width=2000;c.height=400;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,2000,400);return c.toDataURL('image/png').split(',')[1]})()"),'base64');if(!existsSync(c.fixture('audit-wide.png')))writeFileSync(c.fixture('audit-wide.png'),wideBytes);
  const wide=await c.open('audit-wide.png');wide.unmaximize();wide.setSize(1000,750);await c.pause(200);await c.click(wide,'.image-rotate');await c.pause(180);
  await c.check(wide,'rotated image fit uses rotated bounds',"(()=>{const i=document.querySelector('.image img').getBoundingClientRect(),r=document.querySelector('.image').getBoundingClientRect();return i.width<=r.width-40&&i.height<=r.height-40})()");
  await c.click(wide,'.image-original');await c.check(wide,'oversized original image starts at reachable scroll origin',"(()=>{const root=document.querySelector('.image'),f=document.querySelector('.image-frame').getBoundingClientRect();return root.scrollTop===0&&f.top>=root.getBoundingClientRect().top&&root.scrollHeight>root.clientHeight})()");await c.snapshot(wide,'image-rotated-original');
  await c.evaluate(wide,'window.localPreview.setFullscreen(true)');await c.check(wide,'original-pixel image still fits during immersive reading',"document.querySelector('.image-frame').getBoundingClientRect().height<=document.querySelector('.image').clientHeight-40");
  await c.evaluate(wide,'window.localPreview.setFullscreen(false)');await c.pause(200);await c.check(wide,'leaving immersive mode restores original-pixel choice',"document.querySelector('.image-original').getAttribute('aria-pressed')==='true'&&document.querySelector('.image-frame').getBoundingClientRect().height>document.querySelector('.image').clientHeight");
  await c.evaluate(wide,"(()=>{const f=document.querySelector('[aria-label=页面适配]');f.value='page';f.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.pause(150);assert.equal(await c.evaluate(wide,"document.querySelector('.image-frame').getBoundingClientRect().height<=document.querySelector('.image').clientHeight-40"),true,'software fit mode must override previous original-pixel selection');c.close(wide);
  const tabs=(await c.program.openPaths([c.fixture('image.png'),c.fixture('text.txt')],'tabs'))[0];await c.check(tabs,'image tab ready',"!!document.querySelector('.image-rotate')");await c.click(tabs,'.image-rotate');await c.click(tabs,'.image-original');await c.click(tabs,'.tab .tab-name','text.txt');await evictInactivePreviews(c,tabs);await c.click(tabs,'.tab .tab-name','image.png');
  await c.check(tabs,'image rotation and original mode survive pressure eviction',"document.querySelector('.image-rotate').title.includes('90')&&document.querySelector('.image-original').getAttribute('aria-pressed')==='true'");
  await c.evaluate(tabs,"(()=>{const z=document.querySelector('.zoom-control input');z.value='137';z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");await c.check(tabs,'original pixel label follows software zoom',"document.querySelector('.image-fit-label').textContent.includes('137%')");c.close(tabs);
  const png = await c.open("image.png");
  await c.check(
    png,
    "image print button present",
    "!!document.querySelector('.file-print-button')",
  );
  await c.click(png, ".image-rotate");
  await c.check(
    png,
    "image rotates 90",
    "document.querySelector('.image-rotate').title.includes('90')&&document.querySelector('.image img').style.transform.includes('rotate(90deg)')",
  );
  await c.click(png, ".image-original");
  await c.check(
    png,
    "image original pixel mode",
    "!!document.querySelector('.image-original[aria-pressed=\"true\"]')",
  );
  c.close(png);
  c.program.updateSettings({ theme: "dark" });
  const dark = await c.open("vector.svg");
  await c.check(
    dark,
    "dark image background has no bright grid",
    "getComputedStyle(document.querySelector('.image')).backgroundImage==='none'&&getComputedStyle(document.querySelector('.image')).backgroundColor==='rgb(37, 42, 50)'",
  );
  await c.snapshot(dark, "image-dark");
  c.close(dark);
};
export default suite;
