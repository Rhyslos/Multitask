import { useState } from 'react';

// component
export default function Settings({ initialSettings, onSave, onCancel }) {
    // state variables
    const [defaultTaskColor, setDefaultTaskColor] = useState(initialSettings?.defaultTaskColor || '#ffffff');
    const [autoDelete, setAutoDelete] = useState(initialSettings?.autoDelete || false);
    const [customColors, setCustomColors] = useState(initialSettings?.customColors || []);
    const [newColorName, setNewColorName] = useState('');
    const [newColorHex, setNewColorHex] = useState('#000000');

    // event handlers
    function handleAddColor() {
        if (!newColorName.trim()) return;
        setCustomColors([...customColors, { label: newColorName, color: newColorHex }]);
        setNewColorName('');
        setNewColorHex('#000000');
    }

    function handleRemoveColor(index) {
        const next = [...customColors];
        next.splice(index, 1);
        setCustomColors(next);
    }

    function handleSave() {
        onSave({
            defaultTaskColor,
            autoDelete,
            customColors
        });
    }

    return (
        <div className="settings-page" style={{ padding: '24px', maxWidth: '600px', margin: '0 auto', color: 'var(--ink)' }}>
            <h2>Settings</h2>

            <div className="settings-group" style={{ margin: '24px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                        type="checkbox" 
                        checked={autoDelete}
                        onChange={e => setAutoDelete(e.target.checked)} 
                    />
                    Auto-delete empty lists when all tasks are dragged out
                </label>
            </div>

            <div className="settings-group" style={{ margin: '24px 0' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>Default Task Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                        type="color" 
                        value={defaultTaskColor}
                        onChange={e => setDefaultTaskColor(e.target.value)}
                        style={{ height: '38px', width: '60px', border: 'none', background: 'none' }}
                    />
                    <span>{defaultTaskColor}</span>
                </div>
            </div>

            <div className="settings-group" style={{ margin: '24px 0' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>Custom Colors</label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {customColors.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ background: c.color, width: '20px', height: '20px', borderRadius: '4px' }} />
                            <span style={{ flex: 1 }}>{c.label} ({c.color})</span>
                            <button onClick={() => handleRemoveColor(i)} style={{ cursor: 'pointer' }}>Delete</button>
                        </div>
                    ))}
                    {customColors.length === 0 && (
                        <span style={{ color: 'var(--muted, #888)' }}>No custom colors added yet.</span>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                        type="color" 
                        value={newColorHex}
                        onChange={e => setNewColorHex(e.target.value)}
                        style={{ height: '38px', width: '60px', border: 'none', background: 'none' }}
                    />
                    <input 
                        type="text" 
                        placeholder="Color name (e.g. Lime)" 
                        value={newColorName}
                        onChange={e => setNewColorName(e.target.value)}
                        style={{ flex: 1, padding: '8px' }}
                    />
                    <button onClick={handleAddColor} style={{ padding: '8px 16px' }}>Add Color</button>
                </div>
            </div>

            <hr style={{ margin: '24px 0', borderColor: 'var(--border, #ddd)' }} />

            <div className="settings-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={onCancel} style={{ padding: '8px 16px' }}>Cancel</button>
                <button onClick={handleSave} style={{ padding: '8px 16px', background: 'var(--accent, #007bff)', color: '#fff', border: 'none', borderRadius: '4px' }}>Save Settings</button>
            </div>
        </div>
    );
}