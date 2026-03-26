export default function ColorPicker({ colors, onSelect, style = {} }) {
    return (
        <div className="tiptap-color-picker" style={style}>
            {colors.map(c => (
                <button
                    key={c}
                    className="tiptap-color-swatch"
                    style={{
                        backgroundColor: c,
                        border: c === '#FFFFFF' ? '1px solid var(--border)' : 'none',
                    }}
                    onClick={() => onSelect(c)}
                />
            ))}
        </div>
    );
}