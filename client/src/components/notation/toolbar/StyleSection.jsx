import { FONTS } from './constants';

function getActiveStyle(editor) {
    if (editor.isActive('heading', { level: 1 })) return 'h1';
    if (editor.isActive('heading', { level: 2 })) return 'h2';
    if (editor.isActive('heading', { level: 3 })) return 'h3';
    return 'p';
}

function handleStyleChange(e, editor) {
    const val = e.target.value;
    if (val === 'p')  editor.chain().focus().setParagraph().run();
    if (val === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
    if (val === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
    if (val === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
}

export default function StyleSection({ editor }) {
    const rawFont = (editor.getAttributes('textStyle').fontFamily || '')
        .replace(/^['"]|['"]$/g, '')
        .trim();

    const currentFont = FONTS.find(f =>
        f.value.split(',')[0].trim().toLowerCase() === rawFont.toLowerCase()
    )?.value ?? FONTS[0].value;

    let rawWeight = editor.getAttributes('textStyle').fontWeight || '400';
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