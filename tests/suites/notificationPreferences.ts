import assert from 'node:assert/strict';
import {app} from 'electron';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {BrowserWindow} from 'electron';
import type {Suite} from '../context';
import {SettingsStore} from '../../electron/settings';
import {updateTest} from '../updateDriver';

const suite:Suite=async c=>{
  const original=c.program.settings.get(),windows:BrowserWindow[]=[];
  const selector='.preview-notice';
  const visible="!!document.querySelector('.preview-notice')";
  const settingsFile=path.join(app.getPath('userData'),'preferences.json');
  async function idle(win:BrowserWindow){
    win.show();win.focus();win.webContents.sendInputEvent({type:'mouseMove',x:5,y:5});
    await c.evaluate(win,"document.activeElement?.blur()");
    await c.check(win,'notification window is visible without hover or focus',"document.visibilityState==='visible'&&![...document.querySelectorAll('.preview-notice,.update-notice')].some(el=>el.matches(':hover,:focus-within'))");
  }
  async function open(){const win=await c.open('invalid.json');windows.push(win);await c.check(win,'preview notification is shown',visible);await idle(win);return win;}
  async function setViaUi(win:BrowserWindow,value:'always'|'5s'){
    if(!await c.evaluate(win,"!!document.querySelector('.settings-panel')"))await c.click(win,'.settings-button');
    await c.check(win,'message-notification setting is in appearance',"document.querySelector('#notification-duration')?.closest('.settings-group').id==='settings-appearance'");
    await c.evaluate(win,`(()=>{const select=document.querySelector('#notification-duration');select.value='${value}';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await c.check(win,'notification setting updates in the UI',`document.querySelector('#notification-duration').value==='${value}'`);
    assert.equal(c.program.settings.get().notificationDuration,value);
    assert.equal(new SettingsStore(settingsFile).get().notificationDuration,value);
    await c.click(win,'[aria-label=关闭设置]');
  }
  try{
    c.program.updateSettings({notificationDuration:'always'});
    await c.click(c.home,'.settings-button');
    await c.check(c.home,'default notification mode is always visible',"document.querySelector('#notification-duration')?.value==='always'");
    assert.deepEqual(await c.evaluate(c.home,"[...document.querySelector('#notification-duration').options].map(option=>[option.value,option.textContent])"),[['always','一直显示'],['5s','5 秒后自动关闭']]);
    await c.click(c.home,'[aria-label=关闭设置]');
    const persistent=await open();await c.pause(5500);
    await c.check(persistent,'always-visible notification stays after five idle seconds',visible);
    await c.click(persistent,'.preview-notice-dismiss');await c.check(persistent,'manual close works in always-visible mode','!document.querySelector(".preview-notice")');c.close(persistent);

    await setViaUi(c.home,'5s');
    const manual=await open();await c.pause(4100);await c.check(manual,'auto notification is not closed before five seconds',visible);
    await c.click(manual,'.preview-notice-dismiss');await c.check(manual,'manual close also works before auto timeout','!document.querySelector(".preview-notice")');c.close(manual);
    const automatic=await open();await c.pause(1400);
    await c.check(automatic,'old closed-card timer cannot dismiss a new file session',visible);
    await c.check(automatic,'idle preview notification closes automatically','!document.querySelector(".preview-notice")');
    await c.check(automatic,'auto dismissal keeps the actual document available',"document.querySelector('.preview-body').dataset.loadPhase==='ready'&&document.querySelector('.text-code').textContent.includes('{bad')");c.close(automatic);

    const update=await open();await c.click(update,'.preview-notice-dismiss');
    const downloads=updateTest.downloads,installs=updateTest.installs;
    await c.evaluate(update,'window.localPreview.updateAction("check")');update.webContents.send('updates:notice');
    await c.check(update,'update notification uses the same auto-close policy',"!!document.querySelector('.update-notice')");
    await idle(update);await c.pause(4100);await c.check(update,'update notice remains during its five-second interval',"!!document.querySelector('.update-notice')");
    await c.check(update,'idle update notification auto-closes',"!document.querySelector('.update-notice')");
    assert.equal((await c.evaluate<{phase:string}>(update,'window.localPreview.getUpdateState()')).phase,'available');
    assert.equal(updateTest.downloads,downloads);assert.equal(updateTest.installs,installs);
    update.webContents.send('updates:notice');await c.check(update,'a new update notification can still be closed manually',"!!document.querySelector('.update-notice .update-dismiss')");
    await c.click(update,'.update-dismiss');await c.check(update,'manual close works in auto update mode',"!document.querySelector('.update-notice')");c.close(update);

    const live=await open(),other=await c.open('text.txt');windows.push(other);
    await idle(live);await c.pause(2000);c.program.updateSettings({notificationDuration:'always'});
    await c.pause(5500);await c.check(live,'switching to always-visible cancels an existing timeout',visible);
    await c.click(other,'.settings-button');await c.check(other,'another already-open window receives the preference live',"document.querySelector('#notification-duration')?.value==='always'");
    await setViaUi(other,'5s');await idle(live);
    await c.check(live,'another window can enable timeout for an existing notification',"!document.querySelector('.preview-notice')");
    assert.equal(JSON.parse(readFileSync(settingsFile,'utf8')).notificationDuration,'5s');c.close(live);c.close(other);

    const interaction=await open();
    const point=await c.evaluate<{x:number;y:number}>(interaction,"(()=>{const r=document.querySelector('.preview-notice').getBoundingClientRect();return {x:r.left+10,y:r.top+10}})()");
    interaction.webContents.sendInputEvent({type:'mouseMove',x:Math.round(point.x),y:Math.round(point.y)});
    await c.evaluate(interaction,"document.querySelector('.preview-notice-dismiss').focus()");
    await c.pause(5500);await c.check(interaction,'hover and keyboard focus pause automatic closing',visible);
    interaction.webContents.sendInputEvent({type:'mouseMove',x:5,y:5});await c.pause(1100);
    await c.check(interaction,'keyboard focus alone keeps the notification open',visible);
    await c.evaluate(interaction,"document.querySelector('.preview-body').focus({preventScroll:true})");
    await c.check(interaction,'idle timeout resumes after leaving the notification',"!document.querySelector('.preview-notice')");c.close(interaction);

    const hidden=await open();await c.click(hidden,'.settings-button');await c.pause(5500);
    await c.check(hidden,'notification hidden by settings does not expire unseen',"!!document.querySelector('.preview-notice')&&document.querySelector('.notification-stack').getClientRects().length===0");
    await c.click(hidden,'[aria-label=关闭设置]');await idle(hidden);await c.pause(4100);
    await c.check(hidden,'restored notification receives a fresh five-second interval',visible);
    await c.check(hidden,'restored idle notification auto-closes',"!document.querySelector('.preview-notice')");c.close(hidden);
    c.pass('notification preferences: persistence, defaults, manual and five-second modes, update parity, live window sync, interaction pause and hidden-state cleanup verified');
  }finally{
    for(const win of windows)if(!win.isDestroyed())c.close(win);
    await c.evaluate(c.home,"document.querySelector('[aria-label=关闭设置]')?.click()");
    c.program.updateSettings(original);
  }
};
export default suite;
