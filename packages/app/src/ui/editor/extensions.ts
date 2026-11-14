import { Node } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Youtube from '@tiptap/extension-youtube';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

import { t } from '../../i18n';
import type { MediaLibrary } from '../../media/library';

/**
 * HTML the editor cannot edit (from older posts, for example). It shows up as a closed block and
 * goes back to the file exactly as it was.
 */
const RawHtml = Node.create({
  name: 'rawHtml',
  group: 'block',
  atom: true,
  addAttributes() {
    return { html: { default: '', parseHTML: (el) => el.getAttribute('data-raw-html') ?? '' } };
  },
  parseHTML() {
    return [{ tag: 'div[data-raw-html]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-raw-html': HTMLAttributes.html }];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      const label = document.createElement('div');
      const code = document.createElement('pre');

      dom.className = 'scms-raw-html';
      label.textContent = t('raw_html');
      code.textContent = decodeURIComponent(node.attrs.html as string);
      dom.append(label, code);

      return { dom };
    };
  },
});

/** Image that shows the pending or repository version but saves the public path. */
const createImage = (media: MediaLibrary) =>
  Image.extend({
    addNodeView() {
      return ({ node }) => {
        const img = document.createElement('img');

        img.alt = node.attrs.alt ?? '';
        void media.resolve(node.attrs.src as string).then((url) => {
          img.src = url;
        });

        return { dom: img };
      };
    },
  }).configure({ inline: false, allowBase64: false });

export function createExtensions(media: MediaLibrary) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    createImage(media),
    Youtube.configure({ nocookie: true, width: 640, height: 360 }),
    TableKit.configure({ table: { resizable: false } }),
    CharacterCount,
    Placeholder.configure({ placeholder: () => t('write_here') }),
    RawHtml,
  ];
}

