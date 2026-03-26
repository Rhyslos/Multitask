export default function HistorySection({ editor }) {
    return (
        <div className="subbar-section">
            <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>⮪</button>
            <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>⮫</button>
        </div>
    );
}