import {nextTick} from 'vue';

let finishing=false;
export async function finishStartup(){
  const layer=document.getElementById('startup-status');
  if(!layer||finishing)return;
  finishing=true;
  await nextTick();
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  layer.setAttribute('aria-hidden','true');
  layer.setAttribute('inert','');
  const animation=layer.animate([{opacity:1},{opacity:0}],{
    duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:160,
    fill:'forwards',
  });
  try{await animation.finished;}finally{layer.remove();}
}
