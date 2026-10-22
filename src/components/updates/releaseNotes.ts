import DOMPurify from 'dompurify';

const blocks = ['p', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre'];

export function releaseNotesText(notes: string) {
  const fragment = DOMPurify.sanitize(notes, {
    ALLOWED_TAGS: [...blocks, 'br'],
    ALLOWED_ATTR: [],
    RETURN_DOM_FRAGMENT: true,
  });
  let text = '';
  const newline = () => {
    text = text.replace(/[\t ]+$/, '');
    if (text && !text.endsWith('\n')) text += '\n';
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
      return;
    }
    const tag = node.nodeName.toLowerCase();
    if (tag === 'br') {
      text += '\n';
      return;
    }
    const block = blocks.includes(tag);
    if (block) newline();
    if (tag === 'li') text += '• ';
    node.childNodes.forEach(visit);
    if (block) newline();
  };
  fragment.childNodes.forEach(visit);
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
