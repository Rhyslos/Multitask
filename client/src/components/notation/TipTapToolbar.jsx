import { useState } from 'react';


// Component
export default function TipTapToolbar({ editor }) {
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showHighlightPicker, setShowHighlightPicker] = useState(false);

    if (!editor) return null;

    const colors = ['#0f0e0d', '#c8502a', '#4a90d9', '#7ab648', '#e6a817', '#9b59b6', '#e84393', '#ffffff'];
    const highlights = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa'];

    return (
        <div className="tiptap-toolbar">

            <div className="tiptap-toolbar-group">
                <select
                    className="tiptap-select"
                    value={editor.isActive('heading', { level: 1 }) ? '1' :
                           editor.isActive('heading', { level: 2 }) ? '2' :
                           editor.isActive('heading', { level: 3 }) ? '3' : '0'}
                    onChange={e => {
                        const val = parseInt(e.target.value);
                        if (val === 0) editor.chain().focus().setParagraph().run();
                        else editor.chain().focus().toggleHeading({ level: val }).run();
                    }}
                >
                    <option value="0">Paragraph</option>
                    <option value="1">Heading 1</option>
                    <option value="2">Heading 2</option>
                    <option value="3">Heading 3</option>
                </select>
            </div>

            <div className="tiptap-toolbar-divider" />

            <div className="tiptap-toolbar-group">
                <button
                    className={`tiptap-btn ${editor.isActive('bold') ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    title="Bold"
                >
                    <strong>B</strong>
                </button>
                <button
                    className={`tiptap-btn ${editor.isActive('italic') ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    title="Italic"
                >
                    <em>I</em>
                </button>
                <button
                    className={`tiptap-btn ${editor.isActive('strike') ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    title="Strikethrough"
                >
                    <s>S</s>
                </button>
            </div>

            <div className="tiptap-toolbar-divider" />

            <div className="tiptap-toolbar-group">
                <button
                    className={`tiptap-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    title="Align left"
                >⬅</button>
                <button
                    className={`tiptap-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    title="Align center"
                >↔</button>
                <button
                    className={`tiptap-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().setTextAlign('right').run()}
                    title="Align right"
                >➡</button>
            </div>

            <div className="tiptap-toolbar-divider" />

            <div className="tiptap-toolbar-group">
                <button
                    className={`tiptap-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    title="Bullet list"
                >• —</button>
                <button
                    className={`tiptap-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    title="Numbered list"
                >1 —</button>
            </div>

            <div className="tiptap-toolbar-divider" />

            <div className="tiptap-toolbar-group" style={{ position: 'relative' }}>
                <button
                    className="tiptap-btn tiptap-color-btn"
                    onClick={() => { setShowColorPicker(o => !o); setShowHighlightPicker(false); }}
                    title="Text color"
                >
                    <span>A</span>
                    <span
                        className="tiptap-color-bar"
                        style={{ background: editor.getAttributes('textStyle').color || '#0f0e0d' }}
                    />
                </button>
                {showColorPicker && (
                    <div className="tiptap-color-picker">
                        {colors.map(c => (
                            <button
                                key={c}
                                className="tiptap-color-swatch"
                                style={{ background: c, border: c === '#ffffff' ? '1px solid var(--border)' : 'none' }}
                                onClick={() => {
                                    editor.chain().focus().setColor(c).run();
                                    setShowColorPicker(false);
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="tiptap-toolbar-group" style={{ position: 'relative' }}>
                <button
                    className="tiptap-btn tiptap-color-btn"
                    onClick={() => { setShowHighlightPicker(o => !o); setShowColorPicker(false); }}
                    title="Highlight"
                >
                    <span>H</span>
                    <span className="tiptap-color-bar" style={{ background: '#fef08a' }} />
                </button>
                {showHighlightPicker && (
                    <div className="tiptap-color-picker">
                        <button
                            className="tiptap-color-swatch"
                            style={{ background: 'transparent', border: '1px solid var(--border)', fontSize: 10, color: 'var(--muted)' }}
                            onClick={() => {
                                editor.chain().focus().unsetHighlight().run();
                                setShowHighlightPicker(false);
                            }}
                        >✕</button>
                        {highlights.map(c => (
                            <button
                                key={c}
                                className="tiptap-color-swatch"
                                style={{ background: c }}
                                onClick={() => {
                                    editor.chain().focus().setHighlight({ color: c }).run();
                                    setShowHighlightPicker(false);
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
}