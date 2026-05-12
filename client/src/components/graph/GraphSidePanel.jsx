// imports
import { X } from 'lucide-react';
import { getElementLabel } from './GraphHelper';

// main component
export default function GraphSidePanel({ steps, elements, currentIndex, onClose }) {
    const elementById = new Map(elements.map(el => [el.id, el]));

    return (
        <aside
            style={{
                width: '300px',
                borderLeft: '1px solid var(--border)',
                background: 'var(--bg, #ffffff)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 20,
            }}
        >
            <header
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <strong style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Execution Order
                </strong>
                <button
                    onClick={onClose}
                    title="Close"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    <X size={16} />
                </button>
            </header>

            <ol
                style={{
                    margin: 0,
                    padding: '8px 0',
                    listStyle: 'none',
                    overflowY: 'auto',
                    flex: 1,
                }}
            >
                {steps.map((step, i) => {
                    const isCurrent = i === currentIndex;
                    const isPast = i < currentIndex;
                    const isPending = i > currentIndex;

                    let label;
                    if (step.kind === 'node') {
                        label = getElementLabel(elementById.get(step.id));
                    } else if (step.kind === 'edge') {
                        label = '↓ connection';
                    } else if (step.kind === 'cycle') {
                        const name = getElementLabel(elementById.get(step.id));
                        label = `↺ cycle back to ${name}`;
                    }

                    return (
                        <li
                            key={i}
                            style={{
                                padding: '8px 16px',
                                fontSize: '13px',
                                color: isPending ? 'var(--muted)' : 'var(--ink)',
                                background: isCurrent ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                                borderLeft: isCurrent
                                    ? '3px solid #f59e0b'
                                    : isPast
                                    ? '3px solid #10b981'
                                    : '3px solid transparent',
                                fontWeight: step.kind === 'node' ? 500 : 400,
                                fontStyle: step.kind === 'edge' || step.kind === 'cycle' ? 'italic' : 'normal',
                                paddingLeft: step.kind === 'edge' ? '32px' : '16px',
                            }}
                        >
                            {label}
                        </li>
                    );
                })}
            </ol>
        </aside>
    );
}