// page component
import { useNavigate } from 'react-router-dom';

export default function TermsOfService() {
    const navigate = useNavigate();

    return (
        <div className="profile-root" style={{ maxWidth: '800px' }}>
            <button onClick={() => navigate(-1)} className="profile-btn" style={{ marginBottom: '24px' }}>
                ← Back
            </button>
            
            <div className="profile-header">
                <h1 className="profile-title">Terms of Service</h1>
                <p className="profile-subtitle">These terms are currently being drafted.</p>
            </div>

            <div className="profile-content">
                <div className="profile-section">
                    <p>Please check back later for our full Terms of Service.</p>
                </div>
            </div>
        </div>
    );
}