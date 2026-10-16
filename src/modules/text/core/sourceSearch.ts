import {textMatches} from './highlight';

export interface SourceSearchIndex {
  count: number;
  lines: Array<{line: number; first: number; count: number}>;
}

/** Store counts per matching line; expand offsets only for the selected line. */
export function indexSourceMatches(lines: string[], query: string): SourceSearchIndex {
  const result: SourceSearchIndex = {count: 0, lines: []};
  if (!query.trim()) return result;
  for (let line = 0; line < lines.length; line++) {
    const count = textMatches(lines[line], query).length;
    if (count) result.lines.push({line, first: result.count, count});
    result.count += count;
  }
  return result;
}

export function sourceMatchAt(index: SourceSearchIndex, lines: string[], query: string, selected: number) {
  if (selected < 0 || selected >= index.count) return;
  let low = 0, high = index.lines.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (index.lines[middle].first <= selected) low = middle;
    else high = middle - 1;
  }
  const entry = index.lines[low];
  const range = textMatches(lines[entry.line], query)[selected - entry.first];
  return {...range, line: entry.line};
}
