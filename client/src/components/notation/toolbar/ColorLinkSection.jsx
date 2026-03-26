import { useState, useCallback } from 'react';
import { TEXT_COLORS, HIGHLIGHT_COLORS } from './constants';
import ColorPicker from './ColorPicker';

export default function ColorLinkSection({ editor }) {
    const [activePicker, setActivePicker] = useState(null);

    const setLink = useCallback(() => {
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('Enter URL', previousUrl);
        if (url === null) return;
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);

    return (
        <div className="subbar-section" style={{ position: 'relative' }}>
            <button onClick={setLink} className={editor.isActive('link') ? 'active' : ''}>🔗 Link</button>

            <button
                className={`tiptap-color-btn ${editor.isActive('highlight') ? 'active' : ''}`}
                onClick={() => setActivePicker(activePicker === 'highlight' ? null : 'highlight')}
            >
                <span style={{ fontSize: '13px' }}>Highlight</span>
                <div className="tiptap-color-bar" style={{ backgroundColor: editor.getAttributes('highlight').color || 'transparent' }} />
            </button>

            {activePicker === 'highlight' && (
                <ColorPicker
                    colors={HIGHLIGHT_COLORS}
                    onSelect={c => {
                        if (c === '#FFFFFF') editor.chain().focus().unsetHighlight().run();
                        else editor.chain().focus().toggleHighlight({ color: c }).run();
                        setActivePicker(null);
                    }}
                />
            )}

            <button
                className="tiptap-color-btn"
                onClick={() => setActivePicker(activePicker === 'text' ? null : 'text')}
            >
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>A</span>
                <div className="tiptap-color-bar" style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000000' }} />
            </button>

            {activePicker === 'text' && (
                <ColorPicker
                    colors={TEXT_COLORS}
                    onSelect={c => {
                        editor.chain().focus().setColor(c).run();
                        setActivePicker(null);
                    }}
                    style={{ right: 0, left: 'auto' }}
                />
            )}
        </div>
    );
}