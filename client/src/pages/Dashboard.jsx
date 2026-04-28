import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useAnimatedRemoval } from '../hooks/useAnimatedRemoval';
import DefaultSubbar from '../components/subbar/DefaultSubbar';
import CategoryFilter from '../components/CategoryFilter';
import CreateWorkspaceModal from '../components/workspace/CreateWorkspaceModal';
import WorkspaceSettingsModal from '../components/workspace/WorkspaceSettingsModal';
import AnimatedRemoval from '../components/AnimatedRemoval';


// Page
export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { workspaces, categories, loading, createWorkspace, deleteWorkspace, createCategory } = useWorkspaces(user?.id);

    const [modalOpen, setModalOpen] = useState(false);
    const [settingsWorkspace, setSettingsWorkspace] = useState(null);
    const [filterCategory, setFilterCategory] = useState(null);
    const [filterText, setFilterText] = useState('');

    const { triggerRemoval, isRemoving } = useAnimatedRemoval(deleteWorkspace);

    const filtered = workspaces.filter(w => {
        const matchesCategory = !filterCategory || w.categoryID === filterCategory;
        const matchesText = !filterText || w.name.toLowerCase().includes(filterText.toLowerCase());
        return matchesCategory && matchesText;
    });

    function handleOpen(workspaceID) {
        navigate(`/workspace/${workspaceID}/kanban`);
    }

    async function handleCreate(name, categoryID) {
        await createWorkspace(name, categoryID);
        setModalOpen(false);
    }

    return (
        <div className="dashboard-root">
            <DefaultSubbar />
            <main className="dashboard-main">
                <div className="grid-root">
                    <div className="grid-filters">
                        <CategoryFilter
                            categories={categories}
                            selected={filterCategory}
                            searchText={filterText}
                            onSelect={setFilterCategory}
                            onSearch={setFilterText}
                        />
                    </div>

                    <div className="grid">
                        <button className="workspace-ghost" onClick={() => setModalOpen(true)}>
                            <span className="workspace-ghost-icon">+</span>
                            <span className="workspace-ghost-label">New workspace</span>
                        </button>

                        {filtered.map(ws => (
                            <AnimatedRemoval key={ws.id} removing={isRemoving(ws.id)}>
                                <div
                                    className="workspace-card"
                                    onClick={() => handleOpen(ws.id)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        {ws.categoryName ? (
                                            <span
                                                className="workspace-card-tag"
                                                style={{ background: ws.categoryColor + '22', color: ws.categoryColor, margin: 0 }}
                                            >
                                                {ws.categoryName}
                                            </span>
                                        ) : <span />}

                                        <div style={{ display: 'flex', gap: '4px', zIndex: 2 }}>
                                            <button
                                                className="workspace-card-settings"
                                                onClick={e => { e.stopPropagation(); setSettingsWorkspace(ws); }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'inherit', fontSize: '1.2rem', lineHeight: 1 }}
                                                title="Workspace Settings"
                                            >
                                                ⋮
                                            </button>
                                            <button
                                                className="workspace-card-delete"
                                                onClick={e => { e.stopPropagation(); triggerRemoval(ws.id); }}
                                                style={{ position: 'relative', top: 'auto', right: 'auto' }}
                                                title="Delete Workspace"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    <p className="workspace-card-name">{ws.name}</p>
                                    <p className="workspace-card-date">
                                        {new Date(ws.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </AnimatedRemoval>
                        ))}
                    </div>
                </div>
            </main>

            {modalOpen && (
                <CreateWorkspaceModal
                    categories={categories}
                    onConfirm={handleCreate}
                    onClose={() => setModalOpen(false)}
                    onCreateCategory={createCategory}
                />
            )}

            {settingsWorkspace && (
                <WorkspaceSettingsModal
                    workspace={settingsWorkspace}
                    onClose={() => setSettingsWorkspace(null)}
                />
            )}
        </div>
    );
}