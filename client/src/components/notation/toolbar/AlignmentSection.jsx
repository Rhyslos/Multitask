export default function AlignmentSection({ editor }) {
    return (
        <div className="subbar-section">
            <button onClick={() => editor.chain().focus().setTextAlign('left').run()}   className={editor.isActive({ textAlign: 'left' })   ? 'active' : ''}>Left</button>
            <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={editor.isActive({ textAlign: 'center' }) ? 'active' : ''}>Center</button>
            <button onClick={() => editor.chain().focus().setTextAlign('right').run()}  className={editor.isActive({ textAlign: 'right' })  ? 'active' : ''}>Right</button>
        </div>
    );
}