// components/notation/NotationSidebar.jsx
import { useState, useRef, useEffect } from 'react';
import { useNotationSidebar } from '../../hooks/useNotationSidebar';
import { createPortal } from 'react-dom'

export default function NotationSidebar({ workspaceID, activePageID, onPageSelect }) {
    const { groups, pages, loading, createGroup, createPage, renameGroup, renamePage, colorGroup } = useNotationSidebar(workspaceID);
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());
    const [showModal, setShowModal] = useState(false);
    const [selectedGroupID, setSelectedGroupID] = useState(null);
    const [step, setStep] = useState('main');
    const [editingGroupID, setEditingGroupID] = useState(null);
    const [editingColorID, setEditingColorID] = useState(null);
    const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
    const nameRefs = useRef({});
    const colorBtnRefs = useRef({});
    const [editingPageID, setEditingPageID] = useState(null);
    const pageTitleRefs = useRef({});

    const uncategorized = pages.filter(p => p.groupID === null);

    function toggleGroup(groupID) {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            next.has(groupID) ? next.delete(groupID) : next.add(groupID);
            return next;
        });
    }

    function startEditingGroup(group) {
        setEditingGroupID(group.id);
        const el = nameRefs.current[group.id];
        if (!el) return;
        requestAnimationFrame(() => {
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
    }

    function handleGroupNameBlur(group) {
        const text = nameRefs.current[group.id]?.textContent.trim();
        if (text && text !== group.name) {
            renameGroup(group.id, text);
        } else if (nameRefs.current[group.id]) {
            nameRefs.current[group.id].textContent = group.name;
        }
        setEditingGroupID(null);
    }

    function handleGroupNameKeyDown(e, group) {
        if (e.key === 'Enter') {
            e.preventDefault();
            nameRefs.current[group.id]?.blur();
        }
        if (e.key === 'Escape') {
            if (nameRefs.current[group.id]) nameRefs.current[group.id].textContent = group.name;
            nameRefs.current[group.id]?.blur();
        }
    }

    function handleColorBtnClick(e, group) {
        e.stopPropagation();
        if (editingColorID === group.id) {
            setEditingColorID(null);
            return;
        }
        const rect = colorBtnRefs.current[group.id].getBoundingClientRect();
        setPickerPos({ top: rect.bottom + 8, left: rect.left });
        setEditingColorID(group.id);
    }

    function startEditingPage(page) {
        setEditingPageID(page.id);
        const el = pageTitleRefs.current[page.id];
        if (!el) return;
        requestAnimationFrame(() => {
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
    }

    function handlePageTitleBlur(page) {
        const text = pageTitleRefs.current[page.id]?.textContent.trim();
        if (text && text !== page.title) {
            renamePage(page.id, text);
        } else if (pageTitleRefs.current[page.id]) {
            pageTitleRefs.current[page.id].textContent = page.title;
        }
        setEditingPageID(null);
    }

    function handlePageTitleKeyDown(e, page) {
        if (e.key === 'Enter') {
            e.preventDefault();
            pageTitleRefs.current[page.id]?.blur();
        }
        if (e.key === 'Escape') {
            if (pageTitleRefs.current[page.id]) pageTitleRefs.current[page.id].textContent = page.title;
            pageTitleRefs.current[page.id]?.blur();
        }
    }

    function handleModalClose() {
        setShowModal(false);
        setStep('main');
        setSelectedGroupID(null);
    }

    async function handleNewPage() {
        const id = await createPage('Untitled', selectedGroupID);
        onPageSelect(id);
        handleModalClose();
    }

    async function handleNewGroup() {
        await createGroup('New group');
        handleModalClose();
    }

    useEffect(() => {
        if (!editingColorID) return;
        function handleClose() { setEditingColorID(null); }
        document.addEventListener('mousedown', handleClose);
        window.addEventListener('scroll', handleClose, true);
        window.addEventListener('resize', handleClose);
        return () => {
            document.removeEventListener('mousedown', handleClose);
            window.removeEventListener('scroll', handleClose, true);
            window.removeEventListener('resize', handleClose);
        };
    }, [editingColorID]);

        const PRESET_COLORS = [
        { color: '#ffb3b3', label: 'Red'     },
        { color: '#ffd0a8', label: 'Orange'  },
        { color: '#fff0a8', label: 'Yellow'  },
        { color: '#b8f0c8', label: 'Green'   },
        { color: '#b3d8ff', label: 'Blue'    },
        { color: '#ffb3d9', label: 'Pink'    },
        { color: '#e8b3ff', label: 'Magenta' },
    ];

    if (loading) return <div className="notation-sidebar" />;

    return (
        <>
            <div className="notation-sidebar">

                {/* uncategorized pages */}
                {uncategorized.map(page => (
                    <div
                        key={page.id}
                        className={`notation-sidebar-page ${page.id === activePageID ? 'active' : ''}`}
                        onClick={() => { if (editingPageID !== page.id) onPageSelect(page.id); }}
                        onDoubleClick={() => startEditingPage(page)}
                    >
                        <span className="notation-sidebar-dot" />
                        <span
                            ref={el => pageTitleRefs.current[page.id] = el}
                            className="notation-sidebar-page-title"
                            contentEditable={editingPageID === page.id}
                            suppressContentEditableWarning
                            onBlur={() => handlePageTitleBlur(page)}
                            onKeyDown={e => handlePageTitleKeyDown(e, page)}
                            onClick={e => { if (editingPageID === page.id) e.stopPropagation(); }}
                        >
                            {page.title}
                        </span>
                    </div>
                ))}

                {/* groups */}
                {groups.map(group => {
                    const groupPages = pages.filter(p => p.groupID === group.id);
                    const isCollapsed = collapsedGroups.has(group.id);

                    return (
                        <div key={group.id} className="notation-sidebar-group">
                            <div
                                className="notation-sidebar-group-header"
                                onClick={() => { if (editingGroupID !== group.id) toggleGroup(group.id); }}
                                onDoubleClick={() => startEditingGroup(group)}
                            >
                                <div
                                    className="notation-sidebar-group-pill"
                                    style={{ background: group.color || 'var(--accent-lt)' }}
                                >
                                    <span className="notation-sidebar-arrow">
                                        {isCollapsed ? '▸' : '▾'}
                                    </span>

                                    <span
                                        ref={el => nameRefs.current[group.id] = el}
                                        className="notation-sidebar-group-name"
                                        contentEditable={editingGroupID === group.id}
                                        suppressContentEditableWarning
                                        onBlur={() => handleGroupNameBlur(group)}
                                        onKeyDown={e => handleGroupNameKeyDown(e, group)}
                                        onClick={e => { if (editingGroupID === group.id) e.stopPropagation(); }}
                                    >
                                        {group.name}
                                    </span>

                                    <button
                                        ref={el => colorBtnRefs.current[group.id] = el}
                                        className="notation-sidebar-group-color-btn"
                                        onClick={e => handleColorBtnClick(e, group)}
                                    >
                                        ●
                                    </button>

                                    <button
                                        className="notation-sidebar-group-add"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            const id = await createPage('Untitled', group.id);
                                            onPageSelect(id);
                                        }}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            {!isCollapsed && (
                                <div className="notation-sidebar-group-pages">
                                    {groupPages.map(page => (
                                        <div
                                            key={page.id}
                                            className={`notation-sidebar-page ${page.id === activePageID ? 'active' : ''}`}
                                            onClick={() => { if (editingPageID !== page.id) onPageSelect(page.id); }}
                                            onDoubleClick={() => startEditingPage(page)}
                                        >
                                            <span className="notation-sidebar-dot" />
                                            <span
                                                ref={el => pageTitleRefs.current[page.id] = el}
                                                className="notation-sidebar-page-title"
                                                contentEditable={editingPageID === page.id}
                                                suppressContentEditableWarning
                                                onBlur={() => handlePageTitleBlur(page)}
                                                onKeyDown={e => handlePageTitleKeyDown(e, page)}
                                                onClick={e => { if (editingPageID === page.id) e.stopPropagation(); }}
                                            >
                                                {page.title}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* ghost add button */}
                <button
                    className="notation-sidebar-add"
                    onClick={() => setShowModal(true)}
                >
                    +
                </button>
            </div>

            {/* modal */}
            {showModal && (
                <div className="notation-modal-overlay" onClick={handleModalClose}>
                    <div className="notation-modal" onClick={e => e.stopPropagation()}>

                        {step === 'main' && (
                            <>
                                <button className="notation-modal-option" onClick={() => setStep('page')}>
                                    <span className="notation-modal-icon">📄</span>
                                    <div>
                                        <p className="notation-modal-label">New page</p>
                                        <p className="notation-modal-sub">Add a notation page</p>
                                    </div>
                                </button>
                                <button className="notation-modal-option" onClick={handleNewGroup}>
                                    <span className="notation-modal-icon">📁</span>
                                    <div>
                                        <p className="notation-modal-label">New group</p>
                                        <p className="notation-modal-sub">Organize pages into a group</p>
                                    </div>
                                </button>
                            </>
                        )}

                        {step === 'page' && (
                            <>
                                <p className="notation-modal-heading">Add to group</p>
                                <button
                                    className={`notation-modal-option ${selectedGroupID === null ? 'selected' : ''}`}
                                    onClick={() => setSelectedGroupID(null)}
                                >
                                    <span className="notation-modal-icon">📄</span>
                                    <div>
                                        <p className="notation-modal-label">Uncategorized</p>
                                        <p className="notation-modal-sub">No group</p>
                                    </div>
                                </button>
                                {groups.map(group => (
                                    <button
                                        key={group.id}
                                        className={`notation-modal-option ${selectedGroupID === group.id ? 'selected' : ''}`}
                                        onClick={() => setSelectedGroupID(group.id)}
                                    >
                                        <span className="notation-modal-icon">📁</span>
                                        <div>
                                            <p className="notation-modal-label">{group.name}</p>
                                        </div>
                                    </button>
                                ))}
                                <button className="notation-modal-confirm" onClick={handleNewPage}>
                                    Create page
                                </button>
                            </>
                        )}

                    </div>
                </div>
            )}
            {editingColorID && createPortal(
                <div
                    className="kanban-tab-color-picker"
                    style={{ top: pickerPos.top, left: pickerPos.left }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    {PRESET_COLORS.map(({ color, label }) => (
                        <button
                            key={color}
                            className="kanban-tab-color-swatch"
                            style={{ background: color }}
                            title={label}
                            onClick={() => {
                                const group = groups.find(g => g.id === editingColorID);
                                if (group) colorGroup(group.id, color);
                                setEditingColorID(null);
                            }}
                        />
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}