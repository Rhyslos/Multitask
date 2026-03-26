import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { useNotes } from '../hooks/useNotes';
import Navbar from '../components/Navbar';
import NotationSubbar from '../components/subbar/NotationSubbar';

// Page
export default function Notation() {
    const { workspaceID } = useParams();
    const { content, saved, loading, handleUpdate } = useNotes(workspaceID);

    const editor = useEditor({
        extensions: [
            StarterKit,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
        ],
        content: content && Object.keys(content).length > 0 ? content : '<p></p>',
        onUpdate: ({ editor }) => {
            handleUpdate(editor.getJSON());
        },
    }, [loading]);

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
        </div>
    );
}