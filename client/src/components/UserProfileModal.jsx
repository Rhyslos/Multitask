import React from 'react';
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

// component functions
export default function UserProfileModal({ member, onClose }) {
    if (!member) return null;

    // parsing data
    const country = member.countryIso ? COUNTRIES.find(c => c.iso === member.countryIso.toLowerCase()) : null;
    let skills = [];
    try {
        skills = member.skillset ? JSON.parse(member.skillset) : [];
        skills = skills.filter(s => s.trim() !== ''); // Remove empty skill inputs
    } catch {
        skills = [];
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '360px', padding: '32px 24px' }}>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-16px', marginRight: '-8px' }}>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'inherit' }}>✕</button>
                </div>
                
                {/* Header Section */}
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

                    <h2 style={{ margin: '0 0 4px 0', fontSize: '1.4rem' }}>
                        {member.displayName || member.firstName ? `${member.firstName || ''} ${member.lastName || ''}`.trim() : 'Unknown User'}
                    </h2>
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

                {/* Details Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {country && (
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted, #888)', letterSpacing: '0.05em', marginBottom: '4px' }}>Location</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                                <span className={`fi fi-${country.iso}`} style={{ borderRadius: '2px' }}></span>
                                {country.name}
                            </div>
                        </div>
                    )}

                    {member.phoneNumber && (
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted, #888)', letterSpacing: '0.05em', marginBottom: '4px' }}>Phone</span>
                            <div style={{ fontSize: '0.95rem' }}>
                                {member.phoneNumber}
                            </div>
                        </div>
                    )}

                    {member.gender && (
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted, #888)', letterSpacing: '0.05em', marginBottom: '4px' }}>Gender</span>
                            <div style={{ fontSize: '0.95rem', textTransform: 'capitalize' }}>
                                {member.gender}
                            </div>
                        </div>
                    )}

                    {skills.length > 0 && (
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted, #888)', letterSpacing: '0.05em', marginBottom: '8px' }}>Skillset</span>
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
                </div>

            </div>
        </div>
    );
}