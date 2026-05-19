// imports
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import 'flag-icons/css/flag-icons.min.css';
import { COUNTRIES, formatPhoneNumber } from '../components/international/constants';

const API = 'http://localhost:8080/api';

const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 32;

// input helper functions
function InternalCountrySelect({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    const selectedCountry = COUNTRIES.find(c => c.iso === value) || COUNTRIES.find(c => c.iso === 'us');

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
                                    onChange(c.iso);
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

// component functions
function PrivacySelector({ value, onChange }) {
    return (
        <select
            value={value || 'public'}
            onChange={e => onChange(e.target.value)}
            style={{
                marginLeft: 'auto',
                fontSize: '0.75rem',
                padding: '2px 4px',
                borderRadius: '4px',
                background: 'transparent',
                color: 'var(--muted)',
                border: '1px solid var(--border)'
            }}
        >
            <option value="public">Public</option>
            <option value="associates">Associates Only</option>
            <option value="private">Private</option>
        </select>
    );
}

// page component
export default function UserProfile() {
    const { user, updateUser } = useAuth();

    // state initialization functions
    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [firstName, setFirstName] = useState(user?.firstName || '');
    const [lastName, setLastName] = useState(user?.lastName || '');
    const [email, setEmail] = useState(user?.email || '');
    const [countryIso, setCountryIso] = useState(user?.countryIso || 'us');
    const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');

    const [privacySettings, setPrivacySettings] = useState(() => {
        try {
            return user?.privacySettings ? JSON.parse(user.privacySettings) : {};
        } catch {
            return {};
        }
    });

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [profileLoading, setProfileLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
    const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

    const [displayNameError, setDisplayNameError] = useState('');

    // effect handler functions
    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || '');
            setFirstName(user.firstName || '');
            setLastName(user.lastName || '');
            setEmail(user.email || '');
            setCountryIso(user.countryIso || 'us');
            setPhoneNumber(user.phoneNumber || '');
            try {
                if (user.privacySettings) {
                    setPrivacySettings(typeof user.privacySettings === 'string'
                        ? JSON.parse(user.privacySettings)
                        : user.privacySettings);
                }
            } catch {
                setPrivacySettings({});
            }
        }
    }, [user]);

    // data mapping functions
    const selectedCountry = COUNTRIES.find(c => c.iso === countryIso.toLowerCase()) || COUNTRIES.find(c => c.iso === 'us');

    // event handler functions
    function handleCountryChange(iso) {
        if (iso !== countryIso) {
            setCountryIso(iso);
            setPhoneNumber('');
        }
    }

    function handlePrivacyChange(field, value) {
        setPrivacySettings(prev => ({ ...prev, [field]: value }));
    }

    function handleDisplayNameChange(e) {
        setDisplayName(e.target.value);
        if (displayNameError) setDisplayNameError('');
    }

    function validateDisplayName(value) {
        const trimmed = value.trim();
        if (!trimmed) return 'Display name is required.';
        if (trimmed.length < DISPLAY_NAME_MIN) return `Display name must be at least ${DISPLAY_NAME_MIN} characters.`;
        if (trimmed.length > DISPLAY_NAME_MAX) return `Display name must be at most ${DISPLAY_NAME_MAX} characters.`;
        return '';
    }

    // api submission functions
    async function handleProfileUpdate(e) {
        e.preventDefault();

        const nameError = validateDisplayName(displayName);
        if (nameError) {
            setDisplayNameError(nameError);
            setProfileMessage({ type: 'error', text: nameError });
            return;
        }

        setProfileLoading(true);
        setProfileMessage({ type: '', text: '' });

        try {
            const res = await fetch(`${API}/users/${user.id}/profile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    displayName: displayName.trim(),
                    firstName,
                    lastName,
                    email,
                    countryIso,
                    phoneNumber,
                    privacySettings: JSON.stringify(privacySettings)
                }),
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
        setPasswordMessage({ type: '', text: '' });

        if (newPassword !== confirmPassword) {
            return setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
        }

        setPasswordLoading(true);

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
            setConfirmPassword('');
            setPasswordMessage({ type: 'success', text: 'Password updated successfully.' });
        } catch (err) {
            setPasswordMessage({ type: 'error', text: err.message });
        } finally {
            setPasswordLoading(false);
        }
    }

    // render helper functions
    const EyeIcon = ({ isVisible }) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
            {isVisible ? (
                <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </>
            ) : (
                <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                </>
            )}
        </svg>
    );

    return (
        <>
            <div className="profile-root">
                <div className="profile-header">
                    <h1 className="profile-title">Profile Settings</h1>
                    <p className="profile-subtitle">Manage your personal information and security.</p>
                </div>

                <div className="profile-content">
                    <div className="profile-section">
                        <h2 className="profile-section-title">Personal Information</h2>
                        <form className="profile-form" onSubmit={handleProfileUpdate} noValidate>

                            <div className="profile-field">
                                <label htmlFor="displayName">
                                    Display Name (Username) <span className="profile-required">*</span>
                                </label>
                                <input
                                    id="displayName"
                                    type="text"
                                    value={displayName}
                                    onChange={handleDisplayNameChange}
                                    onBlur={() => {
                                        const err = validateDisplayName(displayName);
                                        if (err) setDisplayNameError(err);
                                    }}
                                    placeholder="e.g., CoolCollaborator99"
                                    minLength={DISPLAY_NAME_MIN}
                                    maxLength={DISPLAY_NAME_MAX}
                                    required
                                    aria-invalid={!!displayNameError}
                                    aria-describedby="displayName-help displayName-error"
                                />
                                <span
                                    id="displayName-help"
                                    style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '4px' }}
                                >
                                    Shown to collaborators on shared boards and live cursors. Required.
                                </span>
                                {displayNameError && (
                                    <span
                                        id="displayName-error"
                                        className="profile-message profile-message--error"
                                        style={{ marginTop: '4px' }}
                                    >
                                        {displayNameError}
                                    </span>
                                )}
                            </div>

                            <div className="profile-field" style={{ marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <label style={{ margin: 0 }}>Real Name</label>
                                    <PrivacySelector value={privacySettings.realName} onChange={v => handlePrivacyChange('realName', v)} />
                                </div>
                            </div>

                            <div className="profile-row" style={{ marginTop: 0 }}>
                                <div className="profile-field">
                                    <input
                                        id="firstName"
                                        type="text"
                                        value={firstName}
                                        onChange={e => setFirstName(e.target.value)}
                                        placeholder="First Name"
                                        autoComplete="given-name"
                                    />
                                </div>
                                <div className="profile-field">
                                    <input
                                        id="lastName"
                                        type="text"
                                        value={lastName}
                                        onChange={e => setLastName(e.target.value)}
                                        placeholder="Last Name"
                                        autoComplete="family-name"
                                    />
                                </div>
                            </div>

                            <div className="profile-field">
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <label htmlFor="email" style={{ margin: 0 }}>
                                        Email <span className="profile-required">*</span>
                                    </label>
                                    <PrivacySelector value={privacySettings.email} onChange={v => handlePrivacyChange('email', v)} />
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div className="profile-field profile-phone-field">
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <label>Phone Number</label>
                                    <PrivacySelector value={privacySettings.phoneNumber} onChange={v => handlePrivacyChange('phoneNumber', v)} />
                                </div>
                                <div className="profile-phone-group">
                                    <InternalCountrySelect value={countryIso} onChange={handleCountryChange} />
                                    <input
                                        type="tel"
                                        value={phoneNumber}
                                        onChange={e => {
                                            const digits = e.target.value.replace(/\D/g, '').slice(0, selectedCountry.digits);
                                            setPhoneNumber(formatPhoneNumber(digits, selectedCountry.format));
                                        }}
                                        placeholder={selectedCountry.format.replace(/X/g, '0')}
                                        autoComplete="tel-national"
                                    />
                                </div>
                            </div>

                            <div className="profile-field">
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <label>Location (Country)</label>
                                    <PrivacySelector value={privacySettings.countryIso} onChange={v => handlePrivacyChange('countryIso', v)} />
                                </div>
                                <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Your flag is determined by your phone number selection.</span>
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
                        <form className="profile-form" onSubmit={handlePasswordChange} noValidate>
                            <div className="profile-field">
                                <label htmlFor="currentPassword">Current Password <span className="profile-required">*</span></label>
                                <div className="profile-password-wrapper">
                                    <input
                                        id="currentPassword"
                                        type="password"
                                        value={currentPassword}
                                        onChange={e => setCurrentPassword(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete="current-password"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="profile-field">
                                <label htmlFor="newPassword">New Password <span className="profile-required">*</span></label>
                                <div className="profile-password-wrapper">
                                    <input
                                        id="newPassword"
                                        type={showNew ? "text" : "password"}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="profile-password-toggle"
                                        onClick={() => setShowNew(!showNew)}
                                        aria-label={showNew ? "Hide password" : "Show password"}
                                    >
                                        <EyeIcon isVisible={showNew} />
                                    </button>
                                </div>
                            </div>

                            <div className="profile-field">
                                <label htmlFor="confirmPassword">Confirm New Password <span className="profile-required">*</span></label>
                                <div className="profile-password-wrapper">
                                    <input
                                        id="confirmPassword"
                                        type={showConfirm ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="profile-password-toggle"
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        aria-label={showConfirm ? "Hide password" : "Show password"}
                                    >
                                        <EyeIcon isVisible={showConfirm} />
                                    </button>
                                </div>
                            </div>

                            {passwordMessage.text && (
                                <p className={`profile-message profile-message--${passwordMessage.type}`}>
                                    {passwordMessage.text}
                                </p>
                            )}

                            <button
                                type="submit"
                                className="profile-btn"
                                disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                            >
                                {passwordLoading ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}