// Component
export default function AnimatedRemoval({ removing, duration = 250, children }) {
    return (
        <div
            style={{
                transition: `opacity ${duration}ms ease`,
                opacity: removing ? 0 : 1,
                pointerEvents: removing ? 'none' : 'auto',
            }}
        >
            {children}
        </div>
    );
}