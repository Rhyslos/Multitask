import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { COUNTRIES } from '../components/international/constants'; 
import 'flag-icons/css/flag-icons.min.css';

// helper functions
function getAvatarLetter(member) {
    if (member.displayName) return member.displayName.charAt(0).toUpperCase();
    if (member.firstName) return member.firstName.charAt(0).toUpperCase();
    if (member.email) return member.email.charAt(0).toUpperCase();
    return '?';
}

function getAvatarColor(member) {
    if (!member.isOnline) return '#4A4A4A'; 
    let hash = 0;
    const str = member.email || member.id || 'default';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

function canViewField(privacySetting, isSelf, isAssociate) {
    if (isSelf) return true;
    if (privacySetting === 'private') return false;
    if (privacySetting === 'associates') return isAssociate;
    return true; 
}

function PrivacyBadge({ setting, isSelf }) {
    if (!isSelf) return null;
    if (setting === 'public' || !setting) return null;

    return (
        <span style={{
            marginLeft: '8px',
            fontSize: '0.65rem',
            padding: '2px 6px',
            borderRadius: '10px',
            background: setting === 'private' ? 'rgba(235, 87, 87, 0.1)' : 'rgba(242, 201, 76, 0.1)',
            color: setting === 'private' ? '#eb5757' : '#f2c94c',
            border: `1px solid ${setting === 'private' ? 'rgba(235, 87, 87, 0.3)' : 'rgba(242, 201, 76, 0.3)'}`,
            fontWeight: 'bold',
            textTransform: 'uppercase'
        }}>
            {setting}
        </span>
    );
}

// component functions
export default function UserProfileModal({ member, onClose }) {
    const { user } = useAuth();

    if (!member) return null;

    // parsing data
    const isSelf = user?.id === member.id;
    const isAssociate = true; // Assuming being in the same workspace makes them an associate
    
    let privacy = {};
    try {
        privacy = member.privacySettings ? JSON.parse(member.privacySettings) : {};
    } catch {
        privacy = {};
    }

    const showRealName = canViewField(privacy.realName, isSelf, isAssociate);
    const showCountry = canViewField(privacy.countryIso, isSelf, isAssociate);
    const showPhone = canViewField(privacy.phoneNumber, isSelf, isAssociate);
    const showGender = canViewField(privacy.gender, isSelf, isAssociate);
    const showSkillset = canViewField(privacy.skillset, isSelf, isAssociate);

    const hasRealName = !!(member.firstName || member.lastName);
    const realNameString = `${member.firstName || ''} ${member.lastName || ''}`.trim();
    
    // Priority: Display Name -> Allowed Real Name -> Email Prefix
    const primaryTitle = member.displayName || (showRealName && hasRealName ? realNameString : member.email.split('@')[0]);

    const country = member.countryIso ? COUNTRIES.find(c => c.iso === member.countryIso.toLowerCase()) : null;
    let skills = [];
    try {
        skills = member.skillset ? JSON.parse(member.skillset) : [];
        skills = skills.filter(s => s.trim() !== '');
    } catch {
        skills = [];
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '360px', padding: '32px 24px' }}>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-16px', marginRight: '-8px' }}>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'inherit' }}>✕</button>
                </div>
                
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div 
                        style={{
                            width: '80px', height: '80px', borderRadius: '50%',
                            backgroundColor: getAvatarColor(member),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: member.isOnline ? '#FFFFFF' : '#999999',
                            fontWeight: 'bold', fontSize: '32px',
                            margin: '0 auto 16px auto',
                            border: member.isOnline ? '3px solid var(--ink, #222)' : '3px solid transparent',
                            opacity: member.isOnline ? 1 : 0.6,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}
                    >
                        {getAvatarLetter(member)}
                    </div>

                    {/* Main Title (Display Name or Fallback) */}
                    <h2 style={{ margin: '0 0 4px 0', fontSize: '1.4rem' }}>
                        {primaryTitle}
                    </h2>
                    
                    {/* Conditionally render real name as a subtitle if they have a display name taking the top spot */}
                    {member.displayName && hasRealName && showRealName && (
                        <p style={{ margin: '0 0 4px 0', color: 'var(--ink)', fontSize: '0.95rem', fontWeight: 500, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            {realNameString} <PrivacyBadge setting={privacy.realName} isSelf={isSelf} />
                        </p>
                    )}

                    {/* If they don't have a display name, the real name is the main title, so we show the privacy badge right below it */}
                    {!member.displayName && hasRealName && showRealName && isSelf && privacy.realName && privacy.realName !== 'public' && (
                         <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                             <PrivacyBadge setting={privacy.realName} isSelf={isSelf} />
                         </div>
                    )}

                    <p style={{ margin: '0 0 16px 0', color: 'var(--muted, #888)', fontSize: '0.95rem' }}>
                        {member.email}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                        <span style={{ 
                            padding: '4px 10px', background: 'rgba(255, 255, 255, 0.1)', 
                            border: '1px solid var(--border-color, #333)', borderRadius: '12px', 
                            fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em'
                        }}>
                            {member.role}
                        </span>
                        <span style={{ 
                            padding: '4px 10px', 
                            background: member.isOnline ? 'rgba(122, 182, 72, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
                            color: member.isOnline ? '#7ab648' : 'var(--muted, #888)', 
                            border: member.isOnline ? '1px solid rgba(122, 182, 72, 0.3)' : '1px solid transparent',
                            borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' 
                        }}>
                            {member.isOnline ? 'Online' : 'Offline'}
                        </span>
                    </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color, #333)', margin: '0 0 24px 0' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {country && showCountry && (
                        <div>
                            <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted, #888)', letterSpacing: '0.05em', marginBottom: '4px' }}>
                                Location <PrivacyBadge setting={privacy.countryIso} isSelf={isSelf} />
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                                <span className={`fi fi-${country.iso}`} style={{ borderRadius: '2px' }}></span>
                                {country.name}
                            </div>
                        </div>
                    )}

                    {member.phoneNumber && showPhone && (
                        <div>
                            <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted, #888)', letterSpacing: '0.05em', marginBottom: '4px' }}>
                                Phone <PrivacyBadge setting={privacy.phoneNumber} isSelf={isSelf} />
                            </span>
                            <div style={{ fontSize: '0.95rem' }}>
                                {member.phoneNumber}
                            </div>
                        </div>
                    )}

                    {member.gender && showGender && (
                        <div>
                            <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted, #888)', letterSpacing: '0.05em', marginBottom: '4px' }}>
                                Gender <PrivacyBadge setting={privacy.gender} isSelf={isSelf} />
                            </span>
                            <div style={{ fontSize: '0.95rem', textTransform: 'capitalize' }}>
                                {member.gender}
                            </div>
                        </div>
                    )}

                    {skills.length > 0 && showSkillset && (
                        <div>
                            <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted, #888)', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                Skillset <PrivacyBadge setting={privacy.skillset} isSelf={isSelf} />
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {skills.map((skill, index) => (
                                    <span key={index} style={{
                                        padding: '4px 10px',
                                        background: 'var(--accent-lt, rgba(255,255,255,0.05))',
                                        color: 'var(--accent, #e0e0e0)',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        border: '1px solid var(--border-color, #333)'
                                    }}>
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Show a placeholder if everything is hidden */}
                    {(!showCountry && !showPhone && !showGender && !showSkillset) && !isSelf && (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic', padding: '16px 0' }}>
                            This user's details are private.
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}