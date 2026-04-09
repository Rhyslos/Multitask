import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { appName } from '../App';


// Page
export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // form submission
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return setError('Please enter a valid email address (e.g., name@example.com).');
        }

        setLoading(true);
        try {
            await register(email, password); 
            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-root">
            <div className="auth-bg">
                <div className="auth-blob blob-1" />
                <div className="auth-blob blob-2" />
                <div className="auth-blob blob-3" />
            </div>

            <div className="auth-panel">
                <div className="auth-brand">
                    <span className="auth-logo">✦</span>
                    <span className="auth-brand-name">{appName}</span>
                </div>

                <div className="auth-header">
                    <h1 className="auth-title">Get started.</h1>
                    <p className="auth-subtitle">Create your free account.</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                    <div className="auth-field">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            disabled={loading}
                            required
                        />
                    </div>

                    <div className="auth-field">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            autoComplete="new-password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            disabled={loading}
                            required
                        />
                    </div>

                    {error && <p className="auth-error" role="alert">{error}</p>}

                    <button
                        type="submit"
                        className="auth-btn"
                        disabled={loading || !email || !password}
                    >
                        {loading ? 'Creating account…' : 'Create account'}
                    </button>
                </form>

                <div className="auth-footer">
                    <span>Already have an account?</span>
                    <Link to="/login" className="auth-link">Sign in</Link>
                </div>
            </div>
        </div>
    );
}