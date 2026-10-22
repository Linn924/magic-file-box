import type { TestContext } from '../../../../tests/context';

const contexts = new WeakMap<TestContext, TestContext>();
/** History may reinstall a workbook through a worker; wait for the actual editor gate. */
export function withSettledHistory(context: TestContext): TestContext {
  const existing = contexts.get(context);
  if (existing) return existing;
  const wrapped: TestContext = { ...context, async click(win, selector, text) {
    await context.click(win, selector, text);
    if (/\.excel-(undo|redo)\b/.test(selector)) {
      await context.check(win, 'background history transaction completed', "!!document.querySelector('.excel-save-copy:not(:disabled)')");
    }
  } };
  contexts.set(context, wrapped); contexts.set(wrapped, wrapped);
  return wrapped;
}
