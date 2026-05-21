import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link2, Link2Off, Undo, Redo, Palette, Check, ChevronDown
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const COLOR_SWATCHES = [
  { c: '#0f172a', name: 'Tinta' },
  { c: '#475569', name: 'Pizarra' },
  { c: '#94a3b8', name: 'Gris' },
  { c: '#ef4444', name: 'Rojo' },
  { c: '#f97316', name: 'Naranja' },
  { c: '#eab308', name: 'Amarillo' },
  { c: '#22c55e', name: 'Verde' },
  { c: '#10b981', name: 'Esmeralda' },
  { c: '#06b6d4', name: 'Cian' },
  { c: '#3b82f6', name: 'Azul' },
  { c: '#6366f1', name: 'Índigo' },
  { c: '#8b5cf6', name: 'Violeta' },
  { c: '#ec4899', name: 'Rosa' },
  { c: '#f43f5e', name: 'Fucsia' },
  { c: '#7c3aed', name: 'Violeta oscuro' }
];

const FONT_FAMILIES = [
  { label: 'Sans', value: '' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"JetBrains Mono", monospace' }
];

const HEADING_OPTS = [
  { value: '',  label: 'Párrafo',  size: 'text-[13px]' },
  { value: '1', label: 'Título 1', size: 'text-lg font-black' },
  { value: '2', label: 'Título 2', size: 'text-base font-black' },
  { value: '3', label: 'Título 3', size: 'text-sm font-black' }
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Escribe aquí…',
  minHeight = 96,
  compact = false
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: 'rte-link' } }),
      TextStyle,
      Color,
      FontFamily.configure({ types: ['textStyle'] }),
      TextAlign.configure({ types: ['heading', 'paragraph'] })
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'rte-content focus:outline-none',
        style: `min-height:${minHeight}px;`,
        'data-placeholder': placeholder
      }
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange?.(html === '<p></p>' ? '' : html);
    }
  });

  // Sync external value changes (e.g. when switching templates).
  const lastValueRef = useRef(value);
  useEffect(() => {
    if (!editor) return;
    if (value === lastValueRef.current) return;
    lastValueRef.current = value;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  if (!editor) return <div className="rte-wrap rte-skeleton" style={{ minHeight }} />;

  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL del enlace', prev);
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="rte-wrap">
      <div className="rte-toolbar">
        {!compact && <HeadingDropdown editor={editor} />}

        <Group>
          <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label="Negrita" hotkey="Ctrl+B"><Bold className="w-4 h-4" /></Btn>
          <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="Cursiva" hotkey="Ctrl+I"><Italic className="w-4 h-4" /></Btn>
          <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} label="Subrayado" hotkey="Ctrl+U"><UnderlineIcon className="w-4 h-4" /></Btn>
          <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} label="Tachado"><Strikethrough className="w-4 h-4" /></Btn>
        </Group>

        <Group>
          <ColorPicker editor={editor} />
          {!compact && <FontPicker editor={editor} />}
        </Group>

        {!compact && (
          <>
            <Group>
              <Btn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} label="Título 1"><Heading1 className="w-4 h-4" /></Btn>
              <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Título 2"><Heading2 className="w-4 h-4" /></Btn>
              <Btn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="Título 3"><Heading3 className="w-4 h-4" /></Btn>
            </Group>

            <Group>
              <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Lista"><List className="w-4 h-4" /></Btn>
              <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Lista numerada"><ListOrdered className="w-4 h-4" /></Btn>
            </Group>

            <Group>
              <Btn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} label="Izquierda"><AlignLeft className="w-4 h-4" /></Btn>
              <Btn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} label="Centro"><AlignCenter className="w-4 h-4" /></Btn>
              <Btn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} label="Derecha"><AlignRight className="w-4 h-4" /></Btn>
              <Btn active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} label="Justificar"><AlignJustify className="w-4 h-4" /></Btn>
            </Group>
          </>
        )}

        <Group>
          <Btn active={editor.isActive('link')} onClick={setLink} label="Enlace"><Link2 className="w-4 h-4" /></Btn>
          {editor.isActive('link') && (
            <Btn onClick={() => editor.chain().focus().unsetLink().run()} label="Quitar enlace"><Link2Off className="w-4 h-4" /></Btn>
          )}
        </Group>

        <div className="flex-1 min-w-2" />

        <Group>
          <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} label="Deshacer" hotkey="Ctrl+Z"><Undo className="w-4 h-4" /></Btn>
          <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} label="Rehacer" hotkey="Ctrl+Y"><Redo className="w-4 h-4" /></Btn>
        </Group>
      </div>

      <EditorContent editor={editor} className="rte-surface" />
    </div>
  );
}

function Group({ children }) {
  return <div className="rte-group">{children}</div>;
}

function Btn({ active, disabled, onClick, label, hotkey, children }) {
  const title = hotkey ? `${label} (${hotkey})` : label;
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`rte-btn ${active ? 'rte-btn-active' : ''}`}
    >
      {children}
    </button>
  );
}

function HeadingDropdown({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false));

  const level = editor.getAttributes('heading').level;
  const current = HEADING_OPTS.find(o => String(level || '') === o.value) || HEADING_OPTS[0];

  const pick = (v) => {
    setOpen(false);
    if (v) editor.chain().focus().toggleHeading({ level: Number(v) }).run();
    else editor.chain().focus().setParagraph().run();
  };

  return (
    <div className="relative rte-group" ref={ref}>
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(o => !o)}
        className="rte-btn px-2.5 w-auto min-w-[100px] justify-between gap-1.5 text-[11px] font-bold uppercase tracking-wider"
        title="Estilo de párrafo"
      >
        <span className="text-ink-700">{current.label}</span>
        <ChevronDown className="w-3 h-3 text-ink-400" />
      </button>
      {open && (
        <div className="rte-popover" style={{ width: 200 }}>
          {HEADING_OPTS.map(o => (
            <button
              key={o.value}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(o.value)}
              className={`rte-popover-row ${current.value === o.value ? 'rte-popover-row-active' : ''}`}
            >
              <span className={o.size}>{o.label}</span>
              {current.value === o.value && <Check className="w-3.5 h-3.5 text-violet-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorPicker({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false));

  const current = editor.getAttributes('textStyle').color || '#0f172a';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(o => !o)}
        className="rte-btn flex-col gap-0"
        title="Color de texto"
      >
        <Palette className="w-4 h-4" />
        <span className="w-4 h-[3px] rounded-sm" style={{ backgroundColor: current }} />
      </button>
      {open && (
        <div className="rte-popover p-3" style={{ width: 220 }}>
          <div className="text-[10px] font-black uppercase tracking-widest text-ink-400 mb-2 px-1">Color de texto</div>
          <div className="grid grid-cols-5 gap-1.5">
            {COLOR_SWATCHES.map(s => (
              <button
                key={s.c}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { editor.chain().focus().setColor(s.c).run(); setOpen(false); }}
                className="relative w-8 h-8 rounded-lg ring-1 ring-ink-200 hover:ring-2 hover:ring-violet-400 hover:scale-110 transition"
                style={{ backgroundColor: s.c }}
                title={s.name}
                aria-label={s.name}
              >
                {current.toLowerCase() === s.c.toLowerCase() && (
                  <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" />
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { editor.chain().focus().unsetColor().run(); setOpen(false); }}
            className="mt-2 w-full text-[11px] font-bold text-ink-600 hover:text-ink-900 hover:bg-ink-50 rounded-lg px-2 py-1.5 transition"
          >
            Quitar color
          </button>
        </div>
      )}
    </div>
  );
}

function FontPicker({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false));

  const current = editor.getAttributes('textStyle').fontFamily || '';
  const curr = FONT_FAMILIES.find(f => f.value === current) || FONT_FAMILIES[0];

  const pick = (v) => {
    setOpen(false);
    if (v) editor.chain().focus().setFontFamily(v).run();
    else editor.chain().focus().unsetFontFamily().run();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(o => !o)}
        className="rte-btn px-2.5 w-auto min-w-[68px] justify-between gap-1.5 text-[11px] font-bold"
        title="Fuente"
        style={{ fontFamily: curr.value || undefined }}
      >
        <span>{curr.label}</span>
        <ChevronDown className="w-3 h-3 text-ink-400" />
      </button>
      {open && (
        <div className="rte-popover" style={{ width: 160 }}>
          {FONT_FAMILIES.map(f => (
            <button
              key={f.label}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(f.value)}
              style={{ fontFamily: f.value || undefined }}
              className={`rte-popover-row ${curr.value === f.value ? 'rte-popover-row-active' : ''}`}
            >
              <span className="text-sm">{f.label}</span>
              {curr.value === f.value && <Check className="w-3.5 h-3.5 text-violet-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}
