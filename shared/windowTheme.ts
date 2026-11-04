import type {Settings} from './settings';

export function windowTheme(theme:Settings['theme'],systemDark:boolean){
  const dark=theme==='dark'||theme==='system'&&systemDark;
  return {name:dark?'dark':'light',background:dark?'#1b1f27':'#f3f5f8'};
}
