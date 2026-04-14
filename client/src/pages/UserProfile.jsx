import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import Navbar from '../components/Navbar';
import 'flag-icons/css/flag-icons.min.css';
import { COUNTRIES, GENDER_OPTIONS } from '../components/international/constants';

const API = 'http://localhost:8080/api';

// Custom searchable country dropdown component
function CountrySelect({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    const selectedCountry = COUNTRIES.find(c => c.code === value) || COUNTRIES[0];
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

// Main Page Component
export default function UserProfile() {
    const { user, updateUser } = useAuth();

    // State declarations
    const [firstName, setFirstName] = useState(user?.firstName || '');
    const [lastName, setLastName] = useState(user?.lastName || '');
    const [email, setEmail] = useState(user?.email || '');
    const [countryCode, setCountryCode] = useState(user?.countryCode || '+1');
    const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
    const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');
    const [gender, setGender] = useState(user?.gender || '');
    
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    
    const [profileLoading, setProfileLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
    const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

    // Derived values
    const displayName = (firstName.trim() || lastName.trim()) 
        ? `${firstName} ${lastName}`.trim() 
        : email;

    // Form handlers
    async function handleProfileUpdate(e) {
        e.preventDefault();
        setProfileLoading(true);
        setProfileMessage({ type: '', text: '' });
        
        try {
            const res = await fetch(`${API}/users/${user.id}/profile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName, email, countryCode, phoneNumber, jobTitle, gender }),
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error);
            
            updateUser(data.user);
            setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
        } catch (err) {
            setProfileMessage({ type: 'error', text: err.message });
        } finally {
            setProfileLoading(false);
        }
    }

    async function handlePasswordChange(e) {
        e.preventDefault();
        setPasswordLoading(true);
        setPasswordMessage({ type: '', text: '' });
        
        try {
            const res = await fetch(`${API}/users/${user.id}/password`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error);
            
            setCurrentPassword('');
            setNewPassword('');
            setPasswordMessage({ type: 'success', text: 'Password updated successfully.' });
        } catch (err) {
            setPasswordMessage({ type: 'error', text: err.message });
        } finally {
            setPasswordLoading(false);
        }
    }

    return (
        <>
            <Navbar />
            <div className="profile-root">
                <div className="profile-header">
                    <h1 className="profile-title">Profile Settings</h1>
                    <p className="profile-subtitle">Manage your personal information and security.</p>
                </div>

                <div className="profile-content">
                    <div className="profile-section">
                        <h2 className="profile-section-title">Personal Information</h2>
                        <p className="profile-display-name">
                            Displaying as: <strong>{displayName}</strong>
                        </p>
                        
                        <form className="profile-form" onSubmit={handleProfileUpdate}>
                            <div className="profile-row">
                                <div className="profile-field">
                                    <label htmlFor="firstName">First Name</label>
                                    <input
                                        id="firstName"
                                        type="text"
                                        value={firstName}
                                        onChange={e => setFirstName(e.target.value)}
                                        placeholder="Jane"
                                    />
                                </div>
                                <div className="profile-field">
                                    <label htmlFor="lastName">Last Name</label>
                                    <input
                                        id="lastName"
                                        type="text"
                                        value={lastName}
                                        onChange={e => setLastName(e.target.value)}
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>

                            <div className="profile-field">
                                <label htmlFor="email">Email <span className="profile-required">*</span></label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="profile-row">
                                <div className="profile-field profile-phone-field">
                                    <label>Phone Number</label>
                                    <div className="profile-phone-group">
                                        <CountrySelect value={countryCode} onChange={setCountryCode} />
                                        <input
                                            type="tel"
                                            value={phoneNumber}
                                            onChange={e => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                                            placeholder="12 34 56 78"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="profile-row">
                                <div className="profile-field">
                                    <label htmlFor="jobTitle">Job Title</label>
                                    <input
                                        id="jobTitle"
                                        type="text"
                                        value={jobTitle}
                                        onChange={e => setJobTitle(e.target.value)}
                                        placeholder="Software Engineer"
                                    />
                                </div>
                                <div className="profile-field">
                                    <label htmlFor="gender">Gender (Optional)</label>
                                    <select 
                                        id="gender" 
                                        value={gender} 
                                        onChange={e => setGender(e.target.value)}
                                        className="profile-select"
                                    >
                                        <option value="" disabled>Select...</option>
                                        {GENDER_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {profileMessage.text && (
                                <p className={`profile-message profile-message--${profileMessage.type}`}>
                                    {profileMessage.text}
                                </p>
                            )}

                            <button type="submit" className="profile-btn" disabled={profileLoading}>
                                {profileLoading ? 'Saving...' : 'Save Profile'}
                            </button>
                        </form>
                    </div>

                    <div className="profile-section">
                        <h2 className="profile-section-title">Security</h2>
                        <form className="profile-form" onSubmit={handlePasswordChange}>
                            <div className="profile-field">
                                <label htmlFor="currentPassword">Current Password <span className="profile-required">*</span></label>
                                <input
                                    id="currentPassword"
                                    type="password"
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            <div className="profile-field">
                                <label htmlFor="newPassword">New Password <span className="profile-required">*</span></label>
                                <input
                                    id="newPassword"
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            {passwordMessage.text && (
                                <p className={`profile-message profile-message--${passwordMessage.type}`}>
                                    {passwordMessage.text}
                                </p>
                            )}

                            <button type="submit" className="profile-btn" disabled={passwordLoading || !currentPassword || !newPassword}>
                                {passwordLoading ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}