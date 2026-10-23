export function pixelAt(client:{x:number;y:number},rect:{left:number;top:number;width:number;height:number},display:{width:number;height:number},pixels:{width:number;height:number},rotation:number){
  if(display.width<=0||display.height<=0||pixels.width<=0||pixels.height<=0)return;
  const angle=rotation*Math.PI/180,dx=client.x-rect.left-rect.width/2,dy=client.y-rect.top-rect.height/2;
  const u=(Math.cos(angle)*dx+Math.sin(angle)*dy)/display.width+.5,v=(-Math.sin(angle)*dx+Math.cos(angle)*dy)/display.height+.5;
  if(u<0||u>=1||v<0||v>=1)return;
  return {x:Math.min(pixels.width-1,Math.floor(u*pixels.width)),y:Math.min(pixels.height-1,Math.floor(v*pixels.height))};
}
export function sampledColor(rgba:ArrayLike<number>){
  const values=Array.from(rgba).slice(0,4),hex='#'+values.slice(0,values[3]===255?3:4).map(value=>value.toString(16).padStart(2,'0')).join('').toUpperCase();
  return {hex,rgb:`RGB(${values[0]}, ${values[1]}, ${values[2]})`,alpha:values[3]};
}
