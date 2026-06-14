// imports
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

import { useAuth } from '../hooks/useAuth';
import { editorExtensions } from '../components/notation/EditorExtensions';
import NotationSubbar from '../components/subbar/NotationSubbar';
import NotationSidebar from '../components/notation/NotationSidebar';

// page component
export default function Notation() {
    const { workspaceID } = useParams();
    const { user } = useAuth();

    const [activePageID, setActivePageID] = useState(null);
    const [status, setStatus] = useState('connecting…');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const { ydoc, provider, idb } = useMemo(() => {
        if (!activePageID || !user?.id || !user?.email) {
            return { ydoc: null, provider: null, idb: null };
        }

        const doc = new Y.Doc();

        const idbPersistence = new IndexeddbPersistence(
            `notation:${activePageID}`,
            doc
        );

        const wsProvider = new WebsocketProvider(
            'ws://localhost:8080',
            `notation/${activePageID}`,
            doc,
            {
                params: {
                    userId: user.id,
                    email: user.email,
                },
            }
        );

        return { ydoc: doc, provider: wsProvider, idb: idbPersistence };
    }, [activePageID, user?.id, user?.email]);

    useEffect(() => {
        if (!provider) return;

        const onStatus = event => setStatus(event.status);
        provider.on('status', onStatus);

        return () => {
            provider.off('status', onStatus);
            provider.destroy();
            idb?.destroy();
            ydoc.destroy();
        };
    }, [provider, ydoc, idb]);

    const editor = useEditor({
        extensions: [
            ...editorExtensions,
            ...(ydoc && provider ? [
                Collaboration.configure({ document: ydoc }),
                CollaborationCaret.configure({
                    provider,
                    user: {
                        name: user?.displayName || user?.email || 'Anonymous',
                        color: user?.cursorColor || '#c8502a'
                    },
                    render(user) {
                        const cursor = document.createElement('span');
                        cursor.classList.add('collab-cursor');
                        cursor.style.borderColor = user.color;

                        const label = document.createElement('span');
                        label.classList.add('collab-cursor__label');
                        label.style.background = user.color;
                        label.textContent = user.name;

                        cursor.appendChild(label);
                        return cursor;
                    },
                })
            ] : [])
        ],
    }, [activePageID]);

    return (
        <div className="notation-root">
            <NotationSubbar editor={editor} saved={status === 'connected'} />

            <div className="notation-body">
                <button
                    className={`notation-sidebar-toggle ${sidebarOpen ? 'open' : ''}`}
                    onClick={() => setSidebarOpen(prev => !prev)}
                >
                    ‹
                </button>

                {sidebarOpen && (
                    <NotationSidebar
                        workspaceID={workspaceID}
                        activePageID={activePageID}
                        onPageSelect={setActivePageID}
                    />
                )}

                <div className="notation-editor-area">
                    {!activePageID ? (
                        <p className="notation-loading">Select a page to get started</p>
                    ) : (
                        <EditorContent editor={editor} className="notation-editor" />
                    )}
                </div>
            </div>
        </div>
    );
}
