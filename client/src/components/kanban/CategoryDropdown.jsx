import { useState, useEffect, useRef } from 'react';


// Component
export default function CategoryDropdown({ categories, selected, onSelect, onClose }) {
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) onClose();
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const filtered = categories.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="cat-dropdown" ref={ref}>
            <input
                className="cat-dropdown-search"
                placeholder="Search category…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
            />
            <div className="cat-dropdown-list">
                {filtered.map(c => (
                    <button
                        key={c.id}
                        className={`cat-dropdown-item ${selected === c.name ? 'active' : ''}`}
                        onClick={() => onSelect(c)}
                    >
                        <span className="cat-dropdown-dot" style={{ background: c.color }} />
                        {c.name}
                    </button>
                ))}
                {filtered.length === 0 && (
                    <p className="cat-dropdown-empty">No categories found</p>
                )}
            </div>
        </div>
    );
}