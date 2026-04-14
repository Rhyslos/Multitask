import { useState, useRef, useEffect } from 'react';
import 'flag-icons/css/flag-icons.min.css';
import { COUNTRIES } from './constants';

export default function CountrySelect({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    const selectedCountry = COUNTRIES.find(c => c.code === value) || COUNTRIES.find(c => c.iso === 'us');
    const filtered = COUNTRIES.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase()) || 
        c.code.includes(search)
    );

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="country-select-wrapper" ref={wrapperRef}>
            <div 
                className={`country-select-trigger ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={`fi fi-${selectedCountry.iso} country-select-flag`}></span>
                <span className="country-select-code">{selectedCountry.code}</span>
                <span className="country-select-arrow">▼</span>
            </div>

            {isOpen && (
                <div className="country-select-menu">
                    <input 
                        type="text" 
                        className="country-select-search" 
                        placeholder="Search country..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        autoFocus
                    />
                    <div className="country-select-list">
                        {filtered.map(c => (
                            <div 
                                key={c.name} 
                                className="country-select-item"
                                onClick={() => {
                                    onChange(c.code);
                                    setIsOpen(false);
                                    setSearch('');
                                }}
                            >
                                <span>
                                    <span className={`fi fi-${c.iso}`} style={{ marginRight: '8px' }}></span> 
                                    {c.name}
                                </span>
                                <span className="country-select-item-code">{c.code}</span>
                            </div>
                        ))}
                        {filtered.length === 0 && (
                            <div className="country-select-empty">No countries found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}