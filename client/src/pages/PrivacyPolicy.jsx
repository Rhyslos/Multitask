// page component
import { useNavigate } from 'react-router-dom';
import { appName } from '../App';

export default function PrivacyPolicy() {
    const navigate = useNavigate();

    return (
        <div className="profile-root" style={{ maxWidth: '800px', lineHeight: '1.6' }}>
            <button onClick={() => navigate(-1)} className="profile-btn" style={{ marginBottom: '24px' }}>
                ← Back
            </button>
            
            <div className="profile-header">
                <h1 className="profile-title">Privacy Policy</h1>
                <p className="profile-subtitle">Last updated: April 14, 2026</p>
            </div>

            <div className="profile-content">
                <div className="profile-section">
                    <p>
                        Welcome to {appName}. We are committed to protecting your personal data and respecting your privacy. 
                        This privacy policy explains how we collect, use, and safeguard your information when you use our service, 
                        in accordance with the General Data Protection Regulation (GDPR).
                    </p>

                    <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>1. Data Controller</h3>
                    <p>
                        {appName} acts as the Data Controller for the personal information you provide to us.
                    </p>

                    <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>2. Data We Collect</h3>
                    <p>We collect the following personal data when you register and use your profile:</p>
                    <ul style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                        <li><strong>Identity Data:</strong> First name, last name, and gender (optional).</li>
                        <li><strong>Contact Data:</strong> Email address and phone number.</li>
                        <li><strong>Professional Data:</strong> Job title.</li>
                        <li><strong>Technical Data:</strong> Encrypted password hashes and timestamps of your account creation and updates.</li>
                        <li><strong>Content Data:</strong> Workspaces, tasks, and notes you create within the platform.</li>
                    </ul>

                    <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>3. Legal Basis for Processing</h3>
                    <p>We process your personal data under the following legal bases:</p>
                    <ul style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                        <li><strong>Contractual Necessity:</strong> To provide you with your account, workspaces, and requested services.</li>
                        <li><strong>Consent:</strong> For optional profile fields (like gender) that you choose to provide.</li>
                        <li><strong>Legitimate Interests:</strong> To improve our platform, ensure security, and prevent fraud.</li>
                    </ul>

                    <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>4. Data Retention</h3>
                    <p>
                        We retain your personal data only for as long as your account is active or as needed to provide you services. 
                        If you delete your account, your personal data will be permanently deleted or anonymized within 30 days, 
                        except where retention is required by law.
                    </p>

                    <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>5. Your GDPR Rights</h3>
                    <p>Under the GDPR, you have the right to:</p>
                    <ul style={{ marginLeft: '24px', marginTop: '8px', marginBottom: '8px' }}>
                        <li><strong>Access:</strong> Request a copy of your personal data.</li>
                        <li><strong>Rectification:</strong> Correct inaccurate or incomplete data via your Profile Settings.</li>
                        <li><strong>Erasure (Right to be Forgotten):</strong> Request the deletion of your account and personal data.</li>
                        <li><strong>Restriction:</strong> Request that we limit the processing of your data.</li>
                        <li><strong>Data Portability:</strong> Receive your data in a structured, commonly used format.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}