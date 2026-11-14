import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Columns3,
  Highlighter,
  Heading2,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Rows3,
  SquarePlay,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { ImageMenu } from './ImageMenu';
import { useEffect, useRef, type ReactNode } from 'react';

import { htmlToMarkdown, markdownToHtml } from '../../content/markdown';
import { t } from '../../i18n';
import { useCms, useToast } from '../context';
import { createExtensions } from './extensions';
import { InlineForm, Popover } from './Popover';

const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa'];

function Tool({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`scms-tool ${active ? 'scms-tool--active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keeps the text selection when the button is clicked.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Swatches({ colors, onPick, onClear, custom }: { colors: string[]; onPick: (c: string) => void; onClear: () => void; custom?: boolean }) {
  return (
    <div className="scms-swatches">
      {colors.map((color) => (
        <button key={color} type="button" className="scms-swatch" style={{ background: color }} title={color} aria-label={color} onClick={() => onPick(color)} />
      ))}
      <button type="button" className="scms-swatch scms-swatch--none" title={t('no_color')} aria-label={t('no_color')} onClick={onClear} />
      {custom && (
        <label className="scms-swatch-custom" title={t('custom_color')}>
          <span>{t('custom_color')}</span>
          <input type="color" onChange={(e) => onPick(e.target.value)} />
        </label>
      )}
    </div>
  );
}

/** Color, highlight and link: used in the toolbar and in the floating menu. */
function ColorControl({ editor, color }: { editor: Editor; color?: string }) {
  const { config } = useCms();

  return (
    <Popover label={t('text_color')} active={!!color} icon={<Baseline size={16} style={color ? { color } : undefined} />}>
      {(close) => (
        <Swatches
          custom
          colors={config.editor.colors}
          onPick={(c) => (editor.chain().focus().setColor(c).run(), close())}
          onClear={() => (editor.chain().focus().unsetColor().run(), close())}
        />
      )}
    </Popover>
  );
}

function HighlightControl({ editor, active }: { editor: Editor; active: boolean }) {
  return (
    <Popover label={t('highlight')} active={active} icon={<Highlighter size={16} />}>
      {(close) => (
        <Swatches
          colors={HIGHLIGHTS}
          onPick={(color) => (editor.chain().focus().setHighlight({ color }).run(), close())}
          onClear={() => (editor.chain().focus().unsetHighlight().run(), close())}
        />
      )}
    </Popover>
  );
}

function LinkControl({ editor, href }: { editor: Editor; href?: string }) {
  const chain = () => editor.chain().focus().extendMarkRange('link');

  return (
    <Popover label={t('link')} active={!!href} icon={<Link size={16} />}>
      {(close) => (
        <InlineForm
          label={t('link_url')}
          type="url"
          initial={href ?? 'https://'}
          submitLabel={t('ok')}
          onSubmit={(value) => {
            if (value && value !== 'https://') {
              chain().setLink({ href: value }).run();
            } else {
              chain().unsetLink().run();
            }

            close();
          }}
          extra={
            href && (
              <button type="button" className="scms-btn scms-btn--ghost" onClick={() => (chain().unsetLink().run(), close())}>
                {t('remove_link')}
              </button>
            )
          }
        />
      )}
    </Popover>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const { media } = useCms();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 2 })
        ? 'h2'
        : e.isActive('heading', { level: 3 })
          ? 'h3'
          : e.isActive('heading', { level: 4 })
            ? 'h4'
            : e.isActive('codeBlock')
              ? 'code'
              : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      color: e.getAttributes('textStyle').color as string | undefined,
      highlight: e.isActive('highlight'),
      align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.getAttributes('link').href as string | undefined,
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  const setBlock = (value: string) => {
    if (value === 'p') {
      chain().setParagraph().run();
    } else if (value === 'code') {
      chain().toggleCodeBlock().run();
    } else {
      chain().setHeading({ level: Number(value[1]) as 2 | 3 | 4 }).run();
    }
  };

  const insertImage = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      const src = await media.add(file);

      chain().setImage({ src, alt: '' }).run();
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  return (
    <div className="scms-toolbar" role="toolbar" aria-label={t('formatting')}>
      <div className="scms-toolbar__group">
        <Tool label={t('undo')} disabled={!s.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 size={16} />
        </Tool>
        <Tool label={t('redo')} disabled={!s.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 size={16} />
        </Tool>
      </div>
      <div className="scms-toolbar__group">
        <select className="scms-block-select" value={s.block} onChange={(e) => setBlock(e.target.value)} aria-label={t('paragraph_style')}>
          <option value="p">{t('paragraph')}</option>
          <option value="h2">{t('heading', { level: 1 })}</option>
          <option value="h3">{t('heading', { level: 2 })}</option>
          <option value="h4">{t('heading', { level: 3 })}</option>
          <option value="code">{t('code_block')}</option>
        </select>
      </div>
      <div className="scms-toolbar__group">
        <Tool label={`${t('bold')} (Ctrl+B)`} active={s.bold} onClick={() => chain().toggleBold().run()}>
          <Bold size={16} />
        </Tool>
        <Tool label={`${t('italic')} (Ctrl+I)`} active={s.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic size={16} />
        </Tool>
        <Tool label={`${t('underline')} (Ctrl+U)`} active={s.underline} onClick={() => chain().toggleUnderline().run()}>
          <Underline size={16} />
        </Tool>
        <Tool label={t('strike')} active={s.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough size={16} />
        </Tool>
        <ColorControl editor={editor} color={s.color} />
        <HighlightControl editor={editor} active={s.highlight} />
      </div>
      <div className="scms-toolbar__group">
        <Tool label={t('align_left')} active={s.align === 'left'} onClick={() => chain().unsetTextAlign().run()}>
          <AlignLeft size={16} />
        </Tool>
        <Tool label={t('align_center')} active={s.align === 'center'} onClick={() => chain().setTextAlign('center').run()}>
          <AlignCenter size={16} />
        </Tool>
        <Tool label={t('align_right')} active={s.align === 'right'} onClick={() => chain().setTextAlign('right').run()}>
          <AlignRight size={16} />
        </Tool>
        <Tool label={t('align_justify')} active={s.align === 'justify'} onClick={() => chain().setTextAlign('justify').run()}>
          <AlignJustify size={16} />
        </Tool>
      </div>
      <div className="scms-toolbar__group">
        <Tool label={t('bullet_list')} active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List size={16} />
        </Tool>
        <Tool label={t('ordered_list')} active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </Tool>
        <Tool label={t('quote')} active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote size={16} />
        </Tool>
      </div>
      <div className="scms-toolbar__group">
        <LinkControl editor={editor} href={s.link} />
        <Tool label={t('image')} onClick={() => fileInput.current?.click()}>
          <ImagePlus size={16} />
        </Tool>
        <Popover label={t('video')} icon={<SquarePlay size={16} />}>
          {(close) => (
            <InlineForm
              label={t('video_url')}
              type="url"
              submitLabel={t('insert')}
              onSubmit={(src) => {
                if (src) {
                  chain().setYoutubeVideo({ src }).run();
                }

                close();
              }}
            />
          )}
        </Popover>
        <Tool label={t('table')} active={s.table} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table size={16} />
        </Tool>
        <Tool label={t('divider')} onClick={() => chain().setHorizontalRule().run()}>
          <Minus size={16} />
        </Tool>
        <Tool label={t('clear_format')} onClick={() => chain().unsetAllMarks().unsetTextAlign().run()}>
          <RemoveFormatting size={16} />
        </Tool>
      </div>
      {s.table && (
        <div className="scms-toolbar__group">
          <Tool label={t('add_row')} onClick={() => chain().addRowAfter().run()}>
            <Rows3 size={16} />
          </Tool>
          <Tool label={t('add_column')} onClick={() => chain().addColumnAfter().run()}>
            <Columns3 size={16} />
          </Tool>
          <Tool label={t('delete_row')} onClick={() => chain().deleteRow().run()}>
            <Rows3 size={16} className="scms-icon-danger" />
          </Tool>
          <Tool label={t('delete_column')} onClick={() => chain().deleteColumn().run()}>
            <Columns3 size={16} className="scms-icon-danger" />
          </Tool>
          <Tool label={t('delete_table')} onClick={() => chain().deleteTable().run()}>
            <Trash2 size={16} />
          </Tool>
        </div>
      )}
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => (void insertImage(e.target.files?.[0]), (e.target.value = ''))} />
    </div>
  );
}

/** Menu shown over the selected text, with the formatting essentials. */
function SelectionMenu({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      heading: e.isActive('heading', { level: 2 }),
      color: e.getAttributes('textStyle').color as string | undefined,
      highlight: e.isActive('highlight'),
      link: e.getAttributes('link').href as string | undefined,
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="selectionMenu"
      className="scms-bubble"
      appendTo={() => editor.view.dom.closest('.scms') ?? document.body}
      options={{ placement: 'top', offset: 8 }}
      shouldShow={({ editor: e, state, from, to }) =>
        e.isEditable && from !== to && !e.isActive('image') && !e.isActive('youtube') && !e.isActive('rawHtml') && !state.selection.empty && !('node' in state.selection)
      }
    >
      <Tool label={`${t('bold')} (Ctrl+B)`} active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold size={16} />
      </Tool>
      <Tool label={`${t('italic')} (Ctrl+I)`} active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic size={16} />
      </Tool>
      <Tool label={`${t('underline')} (Ctrl+U)`} active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline size={16} />
      </Tool>
      <Tool label={t('strike')} active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough size={16} />
      </Tool>
      <span className="scms-bubble__sep" />
      <ColorControl editor={editor} color={s.color} />
      <HighlightControl editor={editor} active={s.highlight} />
      <LinkControl editor={editor} href={s.link} />
      <span className="scms-bubble__sep" />
      <Tool label={t('heading', { level: 1 })} active={s.heading} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2 size={16} />
      </Tool>
      <Tool label={t('clear_format')} onClick={() => chain().unsetAllMarks().run()}>
        <RemoveFormatting size={16} />
      </Tool>
    </BubbleMenu>
  );
}

function Stats({ editor }: { editor: Editor }) {
  const { words, chars } = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      words: e.storage.characterCount.words() as number,
      chars: e.storage.characterCount.characters() as number,
    }),
  });

  return (
    <div className="scms-editor__stats" aria-live="polite">
      <span>{t('words', { count: words })}</span>
      <span>{t('chars', { count: chars })}</span>
      {words > 0 && <span>{t('reading_time', { count: Math.max(1, Math.round(words / 200)) })}</span>}
    </div>
  );
}

export function RichEditor({ id, value, onChange }: { id: string; value: string; onChange: (markdown: string) => void }) {
  const { media } = useCms();
  const lastEmitted = useRef(value);

  const editor = useEditor({
    extensions: createExtensions(media),
    content: markdownToHtml(value),
    editorProps: { attributes: { id, class: 'scms-prose', 'aria-multiline': 'true', role: 'textbox' } },
    onUpdate: ({ editor: e }) => {
      lastEmitted.current = htmlToMarkdown(e.getHTML());
      onChange(lastEmitted.current);
    },
  });

  // Updates the editor if the value changes from outside (for example, when the post finishes loading).
  useEffect(() => {
    if (editor && value !== lastEmitted.current) {
      lastEmitted.current = value;
      editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return null;
  }

  return (
    <div className="scms-editor">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="scms-editor__content" />
      <SelectionMenu editor={editor} />
      <ImageMenu editor={editor} />
      <Stats editor={editor} />
    </div>
  );
}
