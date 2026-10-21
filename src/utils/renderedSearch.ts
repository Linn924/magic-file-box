export function textMatches(text: string, query: string): Array<{start: number; end: number}> {
  const value = query.trim();
  if (!value) return [];
  const escaped = Array.from(value, char => '\\^$.*+?()[]{}|'.includes(char) ? '\\' + char : char).join('');
  return Array.from(text.matchAll(new RegExp(escaped, 'gi')), match => ({start: match.index!, end: match.index! + match[0].length}));
}

export function clearRenderedSearch(root: HTMLElement, className: string) {
  for (const mark of root.querySelectorAll('mark.' + className)) mark.replaceWith(document.createTextNode(mark.textContent || ''));
  root.normalize();
}

/** Match rendered text across inline runs, keeping each block and its formatting intact. */
export function highlightRenderedText(root: HTMLElement, query: string, options: {className: string; blocks: string; exclude: string}): HTMLElement[][] {
  clearRenderedSearch(root, options.className);
  if (!query.trim()) return [];
  const groups = new Map<Element, {text: string; nodes: Array<{node: Text; start: number}>}>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!parent || parent.closest(options.exclude)) continue;
    const block = parent.closest(options.blocks) || root;
    const group = groups.get(block) || {text: '', nodes: []};
    group.nodes.push({node, start: group.text.length}); group.text += node.data; groups.set(block, group);
  }
  const hits: HTMLElement[][] = [];
  for (const group of groups.values()) {
    const matches = textMatches(group.text, query), fragments = matches.map(() => [] as HTMLElement[]);
    const parts = new Map<Text, Array<{start: number; end: number; hit: number}>>();
    let firstNode = 0;
    for (const [hit, match] of matches.entries()) {
      while (firstNode < group.nodes.length && group.nodes[firstNode].start + group.nodes[firstNode].node.length <= match.start) firstNode++;
      for (let i = firstNode; i < group.nodes.length && group.nodes[i].start < match.end; i++) {
        const item = group.nodes[i], start = Math.max(0, match.start - item.start), end = Math.min(item.node.length, match.end - item.start);
        if (start < end) { const list = parts.get(item.node) || []; list.push({start, end, hit}); parts.set(item.node, list); }
      }
    }
    for (const [node, ranges] of parts) {
      const fragment = document.createDocumentFragment(); let offset = 0;
      for (const range of ranges) {
        fragment.append(node.data.slice(offset, range.start));
        const mark = document.createElement('mark'); mark.className = options.className;
        mark.textContent = node.data.slice(range.start, range.end);
        fragment.append(mark); fragments[range.hit].push(mark); offset = range.end;
      }
      fragment.append(node.data.slice(offset)); node.replaceWith(fragment);
    }
    for (const fragment of fragments) if (fragment.length) hits.push(fragment);
  }
  return hits;
}
