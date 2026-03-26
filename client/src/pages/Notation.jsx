import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { useNotes } from '../hooks/useNotes';
import { editorExtensions } from '../components/notation/EditorExtensions';
import Navbar from '../components/Navbar';
import NotationSubbar from '../components/subbar/NotationSubbar';

export default function Notation() {
    const { workspaceID } = useParams();
    const { content, saved, loading, handleUpdate } = useNotes(workspaceID);

    const editor = useEditor({
        extensions: editorExtensions,
        content: '<p></p>',
        onUpdate: ({ editor }) => {
            handleUpdate(editor.getJSON());
        },
    });

    useEffect(() => {
        if (!editor || !content || loading) return;
        if (editor.isEmpty) {
            editor.commands.setContent(content);
        }
    }, [editor, content, loading]);

    return (
        <div className="notation-root">
            <Navbar />
            <NotationSubbar editor={editor} saved={saved} />

            <div className="notation-body">
                {loading ? (
                    <div className="notation-loading">Loading…</div>
                ) : (
                    <EditorContent editor={editor} className="notation-editor" />
                )}
            </div>

            {!loading && editor && (
                <div className="notation-character-count">
                    {editor.storage.characterCount.characters()} characters
                </div>
            )}
        </div>
    );
}