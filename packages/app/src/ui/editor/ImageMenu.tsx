import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { t } from '../../i18n';

/** Shows up when an image in the text is clicked: alt text and removal. */
export function ImageMenu({ editor }: { editor: Editor }) {
  const { alt, pos } = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      alt: e.isActive('image') ? ((e.getAttributes('image').alt as string | null) ?? '') : '',
      pos: e.state.selection.from,
    }),
  });

  const [value, setValue] = useState(alt);

  // Another image was selected: start from its text.
  useEffect(() => setValue(alt), [alt, pos]);

  const save = () => {
    if (value.trim() !== alt) {
      editor.chain().updateAttributes('image', { alt: value.trim() }).run();
    }
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageMenu"
      className="scms-bubble scms-bubble--image"
      appendTo={() => editor.view.dom.closest('.scms') ?? document.body}
      options={{ placement: 'bottom', offset: 8 }}
      shouldShow={({ editor: e }) => e.isEditable && e.isActive('image')}
    >
      <label className="scms-bubble__field">
        <span>{t('image_alt_label')}</span>
        <input
          className="scms-input"
          value={value}
          placeholder={t('image_alt')}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
              editor.commands.focus();
            }
          }}
        />
      </label>
      <button
        type="button"
        className="scms-tool scms-icon-danger"
        title={t('remove_image')}
        aria-label={t('remove_image')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().deleteSelection().run()}
      >
        <Trash2 size={16} />
      </button>
    </BubbleMenu>
  );
}
