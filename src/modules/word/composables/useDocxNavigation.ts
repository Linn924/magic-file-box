import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref, type ShallowRef} from 'vue';
import type {PreviewProps} from '@/modules/types';
import {clearRenderedSearch, highlightRenderedText} from '@/utils/renderedSearch';

export interface WordHeading {id: string; text: string; level: number}

export function useDocxNavigation(props: PreviewProps, pane: Ref<HTMLElement | undefined>, body: ShallowRef<HTMLElement | undefined>, scroll: Ref<HTMLElement | undefined>, fit: () => void) {
  const showSearch = ref(false), query = ref(''), searchInput = ref<HTMLInputElement>();
  const showOutline = ref(props.file.view?.word?.outline ?? false);
  const headings = ref<WordHeading[]>([]), activeHeading = ref('');
  const count = ref(0), index = ref(-1), searching = ref(false);
  const available = computed(() => props.file.ext === 'docx' && !!body.value);
  const targets = new Map<string, HTMLElement>();
  let hits: HTMLElement[][] = [], timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false, frame = 0, revision = 0, listener: HTMLElement | undefined;
  let navigation: {id: string; top: number} | undefined;

  function reveal(element: HTMLElement, center = false) {
    const root = scroll.value;
    if (!root?.clientHeight || !pane.value?.clientWidth) return;
    const bounds = root.getBoundingClientRect();
    let rect = element.getClientRects()[0] || element.getBoundingClientRect();
    if (rect.left < bounds.left + 12) root.scrollLeft += rect.left - bounds.left - 12;
    else if (rect.right > bounds.right - 12) root.scrollLeft += Math.min(rect.left - bounds.left - 12, rect.right - bounds.right + 12);
    rect = element.getClientRects()[0] || element.getBoundingClientRect();
    let target = bounds.top + (center ? Math.max(24, (root.clientHeight - rect.height) / 2) : 24);
    const popup = pane.value?.closest('.preview-tab')?.querySelector('.word-search-bar')?.closest('.preview-floating-panel')?.getBoundingClientRect();
    if (popup && popup.right > rect.left && popup.left < rect.right && popup.bottom > target && popup.bottom + rect.height + 20 < bounds.bottom) {
      target = center ? popup.bottom + 10 + (bounds.bottom - popup.bottom - 20 - rect.height) / 2 : popup.bottom + 10;
    }
    root.scrollTop += rect.top - target;
  }
  function updateActive() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const root = scroll.value;
      if (!root?.clientHeight || !pane.value?.clientWidth) return;
      if (navigation && Math.abs(root.scrollTop - navigation.top) < 2) { activeHeading.value = navigation.id; return; }
      navigation = undefined;
      const boundary = root.getBoundingClientRect().top + 36;
      let active = headings.value[0]?.id || '';
      for (const heading of headings.value) {
        if ((targets.get(heading.id)?.getBoundingClientRect().top ?? Infinity) > boundary) break;
        active = heading.id;
      }
      activeHeading.value = active;
    });
  }
  function jumpHeading(id: string) {
    const element = targets.get(id);
    if (!element) return;
    reveal(element);
    navigation = {id, top: scroll.value?.scrollTop || 0};
    activeHeading.value = id;
  }
  async function toggleOutline() {
    const root = scroll.value, top = root?.getBoundingClientRect().top || 0;
    const anchor = Array.from(body.value?.querySelectorAll<HTMLElement>('p') || []).find(p => p.getBoundingClientRect().bottom > top);
    const offset = anchor ? anchor.getBoundingClientRect().top - top : 0;
    showOutline.value = !showOutline.value;
    await nextTick();
    if (disposed) return;
    fit();
    if (root && anchor?.isConnected) root.scrollTop += anchor.getBoundingClientRect().top - root.getBoundingClientRect().top - offset;
    updateActive();
  }
  watch(showOutline, value => {
    props.file.view ??= {zoom: props.zoom, scroll: []};
    props.file.view.word = {...props.file.view.word, widths: props.file.view.word?.widths || {}, outline: value};
  }, {flush: 'sync'});

  function findNext(direction = 1) {
    if (!hits.length || searching.value) return;
    index.value = (index.value + direction + hits.length) % hits.length;
    for (const [i, fragments] of hits.entries()) for (const mark of fragments) mark.classList.toggle('word-current-hit', i === index.value);
    reveal(hits[index.value][0], true);
    updateActive();
  }
  function search() {
    const root = body.value;
    if (disposed || !root || props.file.ext !== 'docx') return;
    hits = highlightRenderedText(root, query.value, {
      className: 'word-search-hit', blocks: 'p,td,th,li',
      exclude: 'button,script,style,svg,math,[hidden],[aria-hidden="true"],.column-resize-handle',
    });
    count.value = hits.length; index.value = -1; searching.value = false;
    if (hits.length) findNext();
  }
  watch(query, value => {
    clearTimeout(timer); revision++;
    if (!value.trim()) { hits = []; count.value = 0; index.value = -1; searching.value = false; if (body.value) clearRenderedSearch(body.value, 'word-search-hit'); return; }
    searching.value = true;
    const current = revision;
    timer = setTimeout(() => { if (revision === current && !disposed) search(); }, 100);
  }, {flush: 'sync'});
  watch(showSearch, async open => {
    if (!open) { query.value = ''; return; }
    await nextTick(); if (!disposed) searchInput.value?.focus({preventScroll: true});
  });
  function key(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && available.value && pane.value?.clientWidth) {
      event.preventDefault(); showSearch.value = true; void nextTick(() => searchInput.value?.focus({preventScroll: true}));
    }
  }
  function searchKey(event: KeyboardEvent) { if (!event.isComposing) { event.preventDefault(); findNext(event.shiftKey ? -1 : 1); } }
  watch(body, root => {
    listener?.removeEventListener('scroll', updateActive);
    targets.clear(); headings.value = []; hits = []; count.value = 0; index.value = -1;
    if (!root || props.file.ext !== 'docx' || disposed) return;
    const labels = new Map<string, WordHeading>();
    for (const element of root.querySelectorAll<HTMLElement>('[data-word-heading-id]')) {
      const id = element.dataset.wordHeadingId!, text = element.textContent?.trim() || '';
      if (!text) continue;
      const prior = labels.get(id);
      if (prior) prior.text += ' ' + text;
      else { labels.set(id, {id, text, level: Number(element.dataset.wordHeadingLevel)}); targets.set(id, element); }
    }
    headings.value = [...labels.values()];
    listener = scroll.value; listener?.addEventListener('scroll', updateActive, {passive: true});
    updateActive(); if (query.value.trim()) search();
  }, {flush: 'post'});
  watch(() => props.zoom, () => { void nextTick(updateActive); });
  onMounted(() => window.addEventListener('keydown', key));
  onBeforeUnmount(() => {
    disposed = true; revision++; clearTimeout(timer); cancelAnimationFrame(frame);
    listener?.removeEventListener('scroll', updateActive); window.removeEventListener('keydown', key);
    hits = []; targets.clear();
  });
  return {available, showSearch, query, searchInput, showOutline, headings, activeHeading, count, index, searching, findNext, searchKey, jumpHeading, toggleOutline};
}
