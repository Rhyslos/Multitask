import { useState, useEffect } from 'react';
import { FONTS } from './constants';

// Helper functions
function getTextStyleAttrs(editor) {
    const attrs = editor.getAttributes('textStyle');

    if (editor.state.selection.empty && editor.state.storedMarks) {
        const mark = editor.state.storedMarks.find(m => m.type.name === 'textStyle');
        if (mark) return { ...attrs, ...mark.attrs };
    }

    return attrs;
}

function getActiveStyle(editor) {
    if (editor.isActive('heading', { level: 1 })) return 'h1';
    if (editor.isActive('heading', { level: 2 })) return 'h2';
    if (editor.isActive('heading', { level: 3 })) return 'h3';
    return 'p';
}

// Event handlers
function handleStyleChange(e, editor) {
    const val = e.target.value;
    if (val === 'p')  editor.chain().focus().setParagraph().run();
    if (val === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
    if (val === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
    if (val === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
}

// Main component
export default function StyleSection({ editor }) {
    // State management
    const [, setForceRender] = useState(0);

    // Lifecycle hooks
    useEffect(() => {
        if (!editor) return;

        const handleTransaction = () => {
            setForceRender(prev => prev + 1);
        };

        editor.on('transaction', handleTransaction);

        return () => {
            editor.off('transaction', handleTransaction);
        };
    }, [editor]);

    const activeTextStyle = getTextStyleAttrs(editor);

    const rawFont = (activeTextStyle.fontFamily || '')
        .replace(/^['"]|['"]$/g, '')
        .trim();

    const rawFontBase = rawFont.split(',')[0].trim().toLowerCase();

    const currentFont = FONTS.find(f =>
        f.value.split(',')[0].trim().toLowerCase() === rawFontBase
    )?.value ?? FONTS[0].value;

    let rawWeight = activeTextStyle.fontWeight || '400';
    if (rawWeight === 'bold')   rawWeight = '700';
    if (rawWeight === 'normal') rawWeight = '400';
    const currentWeight = rawWeight.toString();

    return (
        <div className="subbar-section">
            <select className="tiptap-select" value={getActiveStyle(editor)} onChange={e => handleStyleChange(e, editor)}>
                <option value="p">Paragraph</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
            </select>

            <select
                className="tiptap-select"
                value={currentFont}
                onChange={e => editor.chain().focus().setFontFamily(e.target.value).run()}
                style={{ fontFamily: currentFont }}
            >
                {FONTS.map(font => (
                    <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                        {font.label}
                    </option>
                ))}
            </select>

            <select
                className="tiptap-select"
                value={currentWeight}
                onChange={e => editor.chain().focus().setFontWeight(e.target.value).run()}
            >
                <option value="300">Light</option>
                <option value="400">Regular</option>
                <option value="500">Medium</option>
                <option value="600">Semi-Bold</option>
                <option value="700">Bold</option>
                <option value="800">Extra-Bold</option>
                <option value="900">Black</option>
            </select>
        </div>
    );
}