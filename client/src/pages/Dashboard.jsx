import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWorkspaces } from '../hooks/useWorkspaces';
import Navbar from '../components/Navbar';
import Subbar from '../components/Subbar';
import WorkspaceGrid from '../components/WorkspaceGrid';
import CreateWorkspaceModal from '../components/CreateWorkspaceModal';


// Page
export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { workspaces, categories, loading, createWorkspace, deleteWorkspace, createCategory } = useWorkspaces(user?.id);

    const [modalOpen, setModalOpen] = useState(false);
    const [filterCategory, setFilterCategory] = useState(null);
    const [filterText, setFilterText] = useState('');

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
            <Navbar />
            <Subbar />
            <main className="dashboard-main">
                <WorkspaceGrid
                    workspaces={filtered}
                    categories={categories}
                    loading={loading}
                    filterCategory={filterCategory}
                    filterText={filterText}
                    onFilterCategory={setFilterCategory}
                    onFilterText={setFilterText}
                    onOpen={handleOpen}
                    onDelete={deleteWorkspace}
                    onCreateNew={() => setModalOpen(true)}
                />
            </main>
            {modalOpen && (
                <CreateWorkspaceModal
                    categories={categories}
                    onConfirm={handleCreate}
                    onClose={() => setModalOpen(false)}
                    onCreateCategory={createCategory}
                />
            )}
        </div>
    );
}