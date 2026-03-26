export default function FormattingSection({ editor }) {
    return (
        <div className="subbar-section">
            <button onClick={() => editor.chain().focus().toggleBold().run()}        className={editor.isActive('bold')        ? 'active' : ''} title="Bold"><b>B</b></button>
            <button onClick={() => editor.chain().focus().toggleItalic().run()}      className={editor.isActive('italic')      ? 'active' : ''} title="Italic"><i>I</i></button>
            <button onClick={() => editor.chain().focus().toggleUnderline().run()}   className={editor.isActive('underline')   ? 'active' : ''} title="Underline"><u>U</u></button>
            <button onClick={() => editor.chain().focus().toggleStrike().run()}      className={editor.isActive('strike')      ? 'active' : ''} title="Strikethrough"><s>S</s></button>
            <button onClick={() => editor.chain().focus().toggleSubscript().run()}   className={editor.isActive('subscript')   ? 'active' : ''} title="Subscript">X₂</button>
            <button onClick={() => editor.chain().focus().toggleSuperscript().run()} className={editor.isActive('superscript') ? 'active' : ''} title="Superscript">X²</button>
        </div>
    );
}