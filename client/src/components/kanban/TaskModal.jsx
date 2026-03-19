import { useState } from 'react';


// Component
export default function TaskModal({ task, categories, onSave, onClose }) {
    const [title, setTitle] = useState(task.title);
    const [description, setDescription] = useState(task.description || '');
    const [isCompleted, setIsCompleted] = useState(task.isCompleted);

    function handleSave() {
        onSave({ title, description, isCompleted });
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal kanban-modal" onClick={e => e.stopPropagation()}>
                <input
                    className="kanban-modal-title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Task title"
                />

                <textarea
                    className="kanban-modal-desc"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Add a description…"
                />

                <label className="kanban-modal-check">
                    <input
                        type="checkbox"
                        checked={isCompleted}
                        onChange={e => setIsCompleted(e.target.checked)}
                    />
                    Mark as completed
                </label>

                <div className="modal-actions">
                    <button className="modal-cancel" onClick={onClose}>Cancel</button>
                    <button className="modal-submit" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
}