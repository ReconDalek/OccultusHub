import { useEditor, EditorContent } from '@tiptap/react'
import { useState, useCallback } from 'react'
import StarterKit from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { TextStyle, FontSize } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Link } from '@tiptap/extension-link'
import { Image } from '@tiptap/extension-image'
import { TextAlign } from '@tiptap/extension-text-align'
import { Bold } from '@tiptap/extension-bold'
import { Italic } from '@tiptap/extension-italic'

// Output <b>/<i> to match Torn's native HTML format
const TornBold = Bold.extend({
  renderHTML({ HTMLAttributes }) { return ['b', HTMLAttributes, 0] },
  parseHTML() { return [{ tag: 'b' }, { tag: 'strong' }] },
})

const TornItalic = Italic.extend({
  renderHTML({ HTMLAttributes }) { return ['i', HTMLAttributes, 0] },
  parseHTML() { return [{ tag: 'i' }, { tag: 'em' }] },
})

const FONT_SIZES = [
  { label: 'Small', value: '10px' },
  { label: 'Normal', value: '12px' },
  { label: 'Large', value: '16px' },
  { label: 'Huge', value: '20px' },
]

const COLORS = [
  '#f4f4f5', "var(--text-secondary)", '#f76707', '#e03131', '#2f9e44',
  '#1971c2', '#ae3ec9', '#f08c00', '#0c8599', '#ffffff',
]

function ToolbarButton({ onClick, active, title, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: active ? 'rgba(109,40,217,0.4)' : 'rgba(255,255,255,0.05)',
        border: active ? '1px solid rgba(109,40,217,0.6)' : '1px solid rgba(255,255,255,0.1)',
        color: disabled ? '#555' : '#d4d4d8',
        padding: '4px 8px',
        borderRadius: '4px',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '13px',
        lineHeight: 1,
        minWidth: '28px',
      }}
    >
      {children}
    </button>
  )
}

export default function ForumEditor({ content = '', onChange }) {
  const [sourceMode, setSourceMode] = useState(false)
  const [sourceHtml, setSourceHtml] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showImageInput, setShowImageInput] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ bold: false, italic: false, link: false, underline: false }),
      TornBold,
      TornItalic,
      Underline,
      TextStyle,
      FontSize,
      Color,
      Link.configure({ openOnClick: false }),
      Image,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content,
    onUpdate: ({ editor }) => {
      if (!sourceMode) onChange(editor.getHTML())
    },
  })

  const toggleSource = useCallback(() => {
    if (!editor) return
    if (!sourceMode) {
      const html = editor.getHTML()
      setSourceHtml(html)
      setSourceMode(true)
    } else {
      editor.commands.setContent(sourceHtml, false)
      onChange(sourceHtml)
      setSourceMode(false)
    }
  }, [editor, sourceMode, sourceHtml, onChange])

  const applyLink = () => {
    if (!linkUrl) return
    editor.chain().focus().setLink({ href: linkUrl }).run()
    setLinkUrl('')
    setShowLinkInput(false)
  }

  const applyImage = () => {
    if (!imageUrl) return
    editor.chain().focus().setImage({ src: imageUrl }).run()
    setImageUrl('')
    setShowImageInput(false)
  }

  if (!editor) return null

  const btn = (label, action, isActive, title) => (
    <ToolbarButton onClick={action} active={isActive} title={title || label}>{label}</ToolbarButton>
  )

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        padding: '8px',
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), 'Bold')}
        {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), 'Italic')}
        {btn('U', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), 'Underline')}
        {btn('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), 'Strikethrough')}

        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

        {/* Font size select */}
        <select
          title="Font Size"
          onChange={e => {
            if (e.target.value === '') editor.chain().focus().unsetFontSize().run()
            else editor.chain().focus().setFontSize(e.target.value).run()
          }}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#d4d4d8',
            borderRadius: '4px',
            padding: '3px 4px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          <option value="">Size</option>
          {FONT_SIZES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Color picker */}
        <div style={{ position: 'relative' }}>
          <ToolbarButton onClick={() => setShowColorPicker(v => !v)} title="Font Color" active={showColorPicker}>
            A
          </ToolbarButton>
          {showColorPicker && (
            <div style={{
              position: 'absolute',
              top: '110%',
              left: 0,
              zIndex: 100,
              background: 'rgba(12,12,12,0.97)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '8px',
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 24px)',
              gap: '4px',
            }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(false) }}
                  style={{
                    width: '24px', height: '24px', borderRadius: '4px',
                    background: c, border: '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', padding: 0,
                  }}
                  title={c}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

        {btn('≡', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'), 'Bullet List')}
        {btn('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'), 'Numbered List')}
        {btn('❝', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'), 'Blockquote')}

        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

        {btn('←', () => editor.chain().focus().setTextAlign('left').run(), editor.isActive({ textAlign: 'left' }), 'Align Left')}
        {btn('↔', () => editor.chain().focus().setTextAlign('center').run(), editor.isActive({ textAlign: 'center' }), 'Center')}
        {btn('→', () => editor.chain().focus().setTextAlign('right').run(), editor.isActive({ textAlign: 'right' }), 'Align Right')}

        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

        {/* Link */}
        <div style={{ position: 'relative' }}>
          <ToolbarButton onClick={() => setShowLinkInput(v => !v)} active={showLinkInput || editor.isActive('link')} title="Insert Link">
            🔗
          </ToolbarButton>
          {showLinkInput && (
            <div style={{
              position: 'absolute', top: '110%', left: 0, zIndex: 100,
              background: 'rgba(12,12,12,0.97)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '8px', display: 'flex', gap: '6px', minWidth: '260px',
            }}>
              <input
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyLink()}
                placeholder="https://..."
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '4px', color: '#f4f4f5', padding: '4px 8px', fontSize: '12px',
                }}
              />
              <button type="button" onClick={applyLink} style={{ background: '#6d28d9', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>OK</button>
            </div>
          )}
        </div>

        {/* Image */}
        <div style={{ position: 'relative' }}>
          <ToolbarButton onClick={() => setShowImageInput(v => !v)} active={showImageInput} title="Insert Image">
            🖼
          </ToolbarButton>
          {showImageInput && (
            <div style={{
              position: 'absolute', top: '110%', left: 0, zIndex: 100,
              background: 'rgba(12,12,12,0.97)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '8px', display: 'flex', gap: '6px', minWidth: '260px',
            }}>
              <input
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyImage()}
                placeholder="Image URL..."
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '4px', color: '#f4f4f5', padding: '4px 8px', fontSize: '12px',
                }}
              />
              <button type="button" onClick={applyImage} style={{ background: '#6d28d9', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>OK</button>
            </div>
          )}
        </div>

        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

        <ToolbarButton onClick={toggleSource} active={sourceMode} title="Toggle HTML Source">
          {'</>'}
        </ToolbarButton>
      </div>

      {/* Editor area */}
      {sourceMode ? (
        <textarea
          value={sourceHtml}
          onChange={e => setSourceHtml(e.target.value)}
          style={{
            width: '100%',
            minHeight: '300px',
            background: 'rgba(0,0,0,0.2)',
            color: '#a5f3fc',
            border: 'none',
            padding: '16px',
            fontFamily: 'monospace',
            fontSize: '13px',
            resize: 'vertical',
            boxSizing: 'border-box',
            outline: 'none',
          }}
          placeholder="Paste Torn HTML source here..."
        />
      ) : (
        <div
          onClick={() => editor.commands.focus()}
          style={{ background: 'rgba(0,0,0,0.15)', cursor: 'text', minHeight: '300px' }}
        >
          <style>{`
            .tiptap-editor .tiptap {
              outline: none;
              padding: 16px;
              color: #e4e4e7;
              font-size: 14px;
              line-height: 1.7;
              min-height: 300px;
            }
            .tiptap-editor .tiptap p { margin: 0 0 8px 0; }
            .tiptap-editor .tiptap p.is-editor-empty:first-child::before {
              content: attr(data-placeholder);
              color: #52525b;
              pointer-events: none;
              float: left;
              height: 0;
            }
            .tiptap-editor .tiptap blockquote {
              border-left: 3px solid rgba(109,40,217,0.6);
              margin: 8px 0;
              padding: 4px 12px;
              color: #a1a1aa;
            }
            .tiptap-editor .tiptap ul, .tiptap-editor .tiptap ol {
              padding-left: 20px;
              margin: 8px 0;
            }
            .tiptap-editor .tiptap img { max-width: 100%; border-radius: 4px; }
            .tiptap-editor .tiptap a { color: #a78bfa; }
          `}</style>
          <div className="tiptap-editor">
            <EditorContent editor={editor} />
          </div>
        </div>
      )}
    </div>
  )
}
