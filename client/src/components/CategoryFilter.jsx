import { useState } from 'react';


// Component
export default function CategoryFilter({ categories, selected, searchText, onSelect, onSearch }) {
    const [open, setOpen] = useState(false);
    const [colorFilter, setColorFilter] = useState('');

    const filtered = categories.filter(c => {
        const matchesText = c.name.toLowerCase().includes(searchText.toLowerCase());
        const matchesColor = !colorFilter || c.color.toLowerCase().includes(colorFilter.toLowerCase());
        return matchesText && matchesColor;
    });

    const selectedCategory = categories.find(c => c.id === selected);

    return (
        <div className="catfilter">
            <div className="catfilter-trigger" onClick={() => setOpen(o => !o)}>
                {selectedCategory ? (
                    <>
                        <span className="catfilter-dot" style={{ background: selectedCategory.color }} />
                        <span>{selectedCategory.name}</span>
                    </>
                ) : (
                    <span>All categories</span>
                )}
                <span className="catfilter-arrow">{open ? '▲' : '▼'}</span>
            </div>

            {open && (
                <div className="catfilter-dropdown">
                    <input
                        className="catfilter-search"
                        placeholder="Search by name…"
                        value={searchText}
                        onChange={e => onSearch(e.target.value)}
                    />
                    <input
                        className="catfilter-search"
                        placeholder="Filter by color…"
                        value={colorFilter}
                        onChange={e => setColorFilter(e.target.value)}
                    />
                    <div className="catfilter-list">
                        <button
                            className={`catfilter-item ${!selected ? 'active' : ''}`}
                            onClick={() => { onSelect(null); setOpen(false); }}
                        >
                            All categories
                        </button>
                        {filtered.map(c => (
                            <button
                                key={c.id}
                                className={`catfilter-item ${selected === c.id ? 'active' : ''}`}
                                onClick={() => { onSelect(c.id); setOpen(false); }}
                            >
                                <span className="catfilter-dot" style={{ background: c.color }} />
                                {c.name}
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="catfilter-empty">No categories found</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}