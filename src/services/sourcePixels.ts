let used=0;
/** Per-renderer decoded preview canvas budget; not an application RAM limit. */
export function reserveSourcePixels(requested:number){
  const pixels=Math.min(Math.max(0,Math.floor(requested)),24_000_000-used);
  if(pixels<Math.min(requested,10000)||pixels<1)throw Error('预览画布预算不足，请关闭其他图片预览后重试。');
  used+=pixels;let released=false;
  return {pixels,release(){if(!released){released=true;used-=pixels;}}};
}
