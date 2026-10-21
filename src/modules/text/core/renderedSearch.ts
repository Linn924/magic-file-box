import {highlightRenderedText} from '@/utils/renderedSearch';

/** Markdown keeps its existing exclusions and first-fragment navigation contract. */
export function highlightRendered(root: HTMLElement, query: string) {
  return highlightRenderedText(root, query, {
    className: 'md-render-hit',
    blocks: 'p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote',
    exclude: 'button,.md-image-error,.md-diagram,.md-diagram-source:not(.md-source-visible),.katex,.md-task,script,style',
  }).map(hit => hit[0]);
}
