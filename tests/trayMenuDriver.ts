import {Tray,type Menu} from 'electron';
let menu:Menu|undefined;
const original=Tray.prototype.setContextMenu;
/** Observe the actual native menu while preserving Electron's implementation. */
Tray.prototype.setContextMenu=function(value:Menu|null){menu=value??undefined;return original.call(this,value);};
export const trayMenu=()=>menu;
