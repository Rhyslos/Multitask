// imports
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

import { useAuth } from '../hooks/useAuth';
import { editorExtensions } from '../components/notation/EditorExtensions';
import Navbar from '../components/Navbar';
import NotationSubbar from '../components/subbar/NotationSubbar';

// page component
export default function Notation() {
    // hooks
    const { workspaceID } = useParams();
    const { user } = useAuth();
    
    // state variables
    const [status, setStatus] = useState('connecting…');

    // provider setup
    const { ydoc, provider } = useMemo(() => {
        const doc = new Y.Doc();
        const wsProvider = new WebsocketProvider(
            'ws://localhost:8080',
            workspaceID,
            doc
        );
        return { ydoc: doc, provider: wsProvider };
    }, [workspaceID]);

    // lifecycle hooks
    useEffect(() => {
        provider.on('status', event => {
            setStatus(event.status); 
        });

        return () => {
            provider.destroy();
            ydoc.destroy();
        };
    }, [provider, ydoc]);

    // editor initialization
    const editor = useEditor({
        extensions: [
            ...editorExtensions,
            Collaboration.configure({
                document: ydoc,
            }),
            CollaborationCaret.configure({
                provider: provider,
                user: {
                    name: user?.email || 'Anonymous',
                    color: '#c8502a'
                }
            })
        ],
    });

    // ui rendering
    return (
        <div className="notation-root">
            <Navbar />
            <NotationSubbar editor={editor} saved={status === 'connected'} />

            <div className="notation-body">
                <EditorContent editor={editor} className="notation-editor" />
            </div>
        </div>
    );
}