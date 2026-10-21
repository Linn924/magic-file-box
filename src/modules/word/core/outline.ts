interface ParagraphStyle {id?: string; name?: string; basedOn?: string; paragraphProps?: {outlineLevel?: number}}
interface DocumentNode {type?: string; styleName?: string; outlineLevel?: number; cssStyle?: Record<string, string>; children?: DocumentNode[]}
interface DocxDocument {documentPart?: {body?: DocumentNode}; stylesPart?: {styles?: ParagraphStyle[]}}

/** Annotate the parsed in-memory document; source bytes and Word bookmarks stay intact. */
export function markDocxHeadings(document: DocxDocument) {
  const styles = new Map((document.stylesPart?.styles || []).filter(style => style.id).map(style => [style.id!, style]));
  function level(node: DocumentNode) {
    if (node.outlineLevel !== undefined) return node.outlineLevel;
    const visited = new Set<string>(); let id = node.styleName;
    while (id && !visited.has(id)) {
      visited.add(id);
      const style = styles.get(id);
      if (style?.paragraphProps?.outlineLevel !== undefined) return style.paragraphProps.outlineLevel;
      const match = /^(?:heading\s*|标题\s*)([1-9])$/i.exec(style?.name || '') || /^heading([1-9])$/i.exec(id);
      if (match) return Number(match[1]) - 1;
      id = style?.basedOn;
    }
    return undefined;
  }
  const pending = document.documentPart?.body ? [document.documentPart.body] : [];
  let index = 0;
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === 'paragraph') {
      const headingLevel = level(node);
      if (headingLevel !== undefined && Number.isInteger(headingLevel) && headingLevel >= 0 && headingLevel < 9) {
        node.cssStyle = {...node.cssStyle, '$data-word-heading-id': 'word-heading-' + index++, '$data-word-heading-level': String(headingLevel + 1), '$role': 'heading', '$aria-level': String(headingLevel + 1)};
      }
    }
    if (node.children) pending.push(...node.children.slice().reverse());
  }
}
