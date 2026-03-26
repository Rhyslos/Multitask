export default function ListSection({ editor }) {
    return (
        <div className="subbar-section">
            <button onClick={() => editor.chain().focus().toggleBulletList().run()}  className={editor.isActive('bulletList')  ? 'active' : ''} title="Bullet List">• List</button>
            <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? 'active' : ''} title="Numbered List">1. List</button>
            <button onClick={() => editor.chain().focus().toggleTaskList().run()}    className={editor.isActive('taskList')    ? 'active' : ''} title="Task List">☑ Tasks</button>
        </div>
    );
}