import assert from 'node:assert/strict';
import type {BrowserWindow} from 'electron';
import type {Suite} from '../context';

const suite: Suite = async c => {
  const win = c.home;
  const settings = c.program.settings.get(), bounds = win.getBounds();
  const zoom = win.webContents.getZoomFactor(), maximized = win.isMaximized();
  const groups = ['appearance', 'windows', 'printing', 'updates', 'exclusive'];
  const click = async (target: BrowserWindow, selector: string) => {
    const point = await c.evaluate<{x: number; y: number}>(target, `(() => {
      const element = document.querySelector(${JSON.stringify(selector)}), r = element.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (!r.width || !r.height || !element.contains(document.elementFromPoint(x, y))) throw Error('Control is obscured: ' + ${JSON.stringify(selector)});
      return {x: Math.round(x), y: Math.round(y)};
    })()`);
    const factor = target.webContents.getZoomFactor();
    const position = {x: Math.round(point.x * factor), y: Math.round(point.y * factor)};
    target.webContents.sendInputEvent({type: 'mouseDown', button: 'left', clickCount: 1, ...position});
    target.webContents.sendInputEvent({type: 'mouseUp', button: 'left', clickCount: 1, ...position});
  };
  const aligned = (id: string) => `(() => {
    const body = document.querySelector('.settings-content'), group = document.querySelector('#settings-${id}');
    return Math.abs(group.getBoundingClientRect().top - body.getBoundingClientRect().top - parseFloat(getComputedStyle(body).paddingTop)) < 2
      && document.querySelector('.settings-nav [aria-current="location"]')?.getAttribute('aria-controls') === 'settings-${id}';
  })()`;
  const fixedChrome = `(() => {
    const panel = document.querySelector('.settings-panel'), body = panel.querySelector('.settings-content');
    const p = panel.getBoundingClientRect(), b = body.getBoundingClientRect();
    const header = panel.querySelector(':scope > header').getBoundingClientRect(), footer = panel.querySelector('.settings-footer').getBoundingClientRect();
    return p.top >= 0 && p.bottom <= innerHeight + 1 && p.left >= 0 && p.right <= innerWidth + 1
      && panel.scrollTop === 0 && panel.scrollHeight <= panel.clientHeight + 1
      && body.scrollWidth <= body.clientWidth + 1 && b.top >= header.bottom - 1 && b.bottom <= footer.top + 1
      && [...panel.querySelectorAll('.settings-nav button,[aria-label="关闭设置"]')].every(button => {
        const r = button.getBoundingClientRect(); return r.top >= header.top && r.bottom <= footer.top + 1
          && button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      });
  })()`;
  try {
    win.unmaximize();
    for (const [width, height, factor, theme] of [
      [1100, 740, 1, 'light'], [720, 560, 1, 'dark'],
      [720, 560, 1.25, 'light'], [720, 560, 1.5, 'dark'],
    ] as const) {
      c.program.updateSettings({theme});
      win.webContents.setZoomFactor(factor);
      win.setSize(width, height);
      await c.pause(160);
      await c.click(win, '.settings-button');
      await c.check(win, 'all settings load together', "!!document.querySelector('.appearance-open') && !!document.querySelector('.exclusive-status') && !!document.querySelector('.update-check')");
      assert.deepEqual(await c.evaluate(win, "[...document.querySelectorAll('.settings-nav button')].map(b=>b.getAttribute('aria-controls'))"), groups.map(id => 'settings-' + id));
      assert.deepEqual(await c.evaluate(win, "[...document.querySelectorAll('.settings-content > .settings-group')].map(s=>s.id)"), groups.map(id => 'settings-' + id));
      const fieldGroups = await c.evaluate(win, "Object.fromEntries(['theme','notification-duration','open-home-action','close-action','multi-mode','default-zoom','maximize','print-entry','check-updates','exclusive-key'].map(id=>[id,document.getElementById(id).closest('.settings-group').id]))");
      assert.deepEqual(fieldGroups, {
        theme: 'settings-appearance', 'notification-duration':'settings-appearance', 'open-home-action': 'settings-windows', 'close-action': 'settings-windows',
        'multi-mode': 'settings-windows', 'default-zoom': 'settings-windows', maximize: 'settings-windows',
        'print-entry': 'settings-printing', 'check-updates': 'settings-updates', 'exclusive-key': 'settings-exclusive',
      });
      const name = width + 'x' + height + '-' + factor;
      await c.check(win, 'only settings content scrolls and navigation fits ' + name, fixedChrome);
      const before = await c.evaluate(win, "[document.querySelector('.settings-panel > header'),document.querySelector('.settings-footer')].map(e=>{const r=e.getBoundingClientRect();return [r.top,r.bottom]})");
      for (const id of groups) {
        await click(win, `[aria-controls="settings-${id}"]`);
        await c.check(win, 'group navigation aligns ' + id + ' ' + name, aligned(id));
        await c.check(win, 'header footer and navigation stay reachable ' + id + ' ' + name, fixedChrome);
      }
      assert.deepEqual(await c.evaluate(win, "[document.querySelector('.settings-panel > header'),document.querySelector('.settings-footer')].map(e=>{const r=e.getBoundingClientRect();return [r.top,r.bottom]})"), before);
      await c.snapshot(win, 'settings-exclusive-' + name);

      await c.evaluate(win, `(() => {
        const body = document.querySelector('.settings-content'), section = document.querySelector('#settings-windows');
        body.scrollTop += section.getBoundingClientRect().top - body.getBoundingClientRect().top - parseFloat(getComputedStyle(body).paddingTop) + 35;
      })()`);
      await c.check(win, 'manual content scrolling updates the current group ' + name, "document.querySelector('.settings-nav [aria-current]')?.getAttribute('aria-controls') === 'settings-windows'");
      if (factor === 1) {
        const wheel = await c.evaluate<{x: number; y: number; top: number}>(win, "(() => {const e=document.querySelector('.settings-content'),r=e.getBoundingClientRect();return {x:Math.round(r.right-30),y:Math.round(r.top+r.height/2),top:e.scrollTop}})()");
        win.webContents.sendInputEvent({type: 'mouseWheel', x: wheel.x, y: wheel.y, deltaY: -140, deltaX: 0});
        await c.check(win, 'native wheel scrolls settings content ' + name, `Math.abs(document.querySelector('.settings-content').scrollTop - ${wheel.top}) > 4`);
        await c.check(win, 'native wheel preserves fixed settings chrome ' + name, fixedChrome);
      }
      await click(win, '[aria-controls="settings-appearance"]');
      await c.check(win, 'appearance group returns to the top ' + name, aligned('appearance'));
      await click(win, '.appearance-open');
      await c.check(win, 'nested appearance editor remains usable ' + name, "!!document.querySelector('.code-appearance-dialog .syntax-token') && document.querySelector('.settings-panel').inert");
      await c.evaluate(win, "document.querySelector('.code-appearance-dialog').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
      await c.check(win, 'nested Escape restores parent and entry focus ' + name, "!document.querySelector('.code-appearance-dialog') && !document.querySelector('.settings-panel').inert && document.activeElement.classList.contains('appearance-open')");
      await c.snapshot(win, 'settings-appearance-' + name);
      win.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Escape'});
      win.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Escape'});
      await c.check(win, 'Escape closes settings ' + name, "!document.querySelector('.settings-panel')");
      await c.click(win, '.settings-button');
      await c.check(win, 'reopened settings starts at appearance ' + name, aligned('appearance'));
      await click(win, '[aria-label="关闭设置"]');
    }
    win.webContents.setZoomFactor(zoom);
    const preview = await c.open('text.txt');
    try {
      await c.click(preview, '.settings-button');
      await c.check(preview, 'preview shares grouped settings', "document.querySelectorAll('.settings-nav button').length === 5");
      await click(preview, '[aria-controls="settings-printing"]');
      await c.check(preview, 'preview group navigation aligns', aligned('printing'));
      await c.evaluate(preview, "(() => {const e=document.querySelector('#print-entry');e.value='current';e.dispatchEvent(new Event('change',{bubbles:true}))})()");
      await c.check(preview, 'grouped settings preserve normal saving', "document.querySelector('#print-entry').value === 'current'");
      assert.equal(c.program.settings.get().printEntry, 'current');
      await click(preview, '[aria-label="关闭设置"]');
    } finally { c.close(preview); }
  } finally {
    await c.evaluate(win, "document.querySelector('.appearance-close')?.click();document.querySelector('[aria-label=\"关闭设置\"]')?.click()");
    win.webContents.setZoomFactor(zoom);
    win.setBounds(bounds);
    if (maximized) win.maximize();
    c.program.updateSettings(settings);
  }
};
export default suite;
