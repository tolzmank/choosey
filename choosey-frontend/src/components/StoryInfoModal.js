import React from 'react';
import { Link } from 'react-router-dom';

const StoryInfoModal = ({ storySet, onClose }) => {
    if (!storySet) return null;

    // Modal overlay style for scrollable overlay on small screens
    const overlayStyle = {
        overflow: 'auto',
        zIndex: 1000,
    };
    // Modal content scrollable with max height
    const contentStyle = {
        maxWidth: '500px',
        position: 'relative',
        maxHeight: '80vh',
        overflowY: 'auto',
        padding: '0px 20px 20px 20px'
    };

    const capitalize = (str) => {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    };

    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return "0:00";

        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return h > 0
            ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
            : `${m}:${s.toString().padStart(2, "0")}`;
    };

    const wordCount = storySet.story?.reduce((acc, block) => {
        if (block.text) {
            const words = block.text.trim().split(/\s+/);
            return acc + words.length;
        }
        return acc;
    }, 0);
    const pageCount = Math.ceil(wordCount / 250);

    const explicitPepperIcons = (explicitness) => {
        const explicitMap = {
            'mild': 1,
            'medium': 2,
            'hot': 3,
        }
        const explicitMsgMap = {
            'mild': 'Mostly romantic tension and flirty scenes — fade-to-black moments.',
            'medium': 'Includes detailed foreplay and sensual scenes, but not fully explicit.',
            'hot': 'Fully explicit adult content with graphic sexual detail.'
        };
        let explicitLabel = capitalize(explicitness);
        let peppers = explicitMap[explicitness] || 0;
        let explicitMsg = explicitMsgMap[explicitness] || '';
        if (explicitness === 'hot') {
            explicitLabel = 'Explicit'
        };
        
        return (
            <>
            <p style={{ marginLeft: '5px', marginTop: '0px', marginBottom: '0px', marginRight: '3px'}}>{explicitLabel}</p>

            {Array.from({ length: peppers }).map((_, i) => (
                <img key={i} src="/images/pink_pepper_smiley.png" alt="pepper" style={{ height: '20px' }} />
            ))}

            <p style={{ color:'#db859dff', marginLeft: '8px', marginTop: '0px', marginBottom: '0px'}}>{explicitMsg}</p>
            </>
        );
    };

    return (
        <div className="modal-overlay" style={overlayStyle}>
        <div className="modal-content" style={contentStyle}>
            <div className="story-info-header" id="story-info-header">
                <button className="button-menu-gray-always" style={{ 
                    paddingTop: '3px', paddingBottom: '15px', borderRadius: '30px', position: 'absolute', top: '15px', right: '0px'}} onClick={onClose}>
                    <img src="/icons/close_gray.svg" alt="Close"  className="menu-icon" style={{ height: '30px'}} />
                </button>
                
                <Link
                    to={`/read_story/${storySet.id}`}
                    state={{ storySet: storySet }}
                    onClick={onClose}
                    className="button-menu-gray-always"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        textDecoration: 'none',
                        borderRadius: '20px',
                        fontSize: '0.95em',
                        paddingTop: '0px',
                        paddingBottom: '0px',
                        marginTop: '15px',
                        paddingLeft: '10px',
                        paddingRight: '10px'
                }}
                >
                <h3 style={{marginTop: '10px', marginBottom: '10px'}}>{storySet.title}</h3>
                <img src="/icons/forward_gray.svg" alt="" style={{ height: '20px', marginLeft: '5px' }} />
                </Link>
            </div>

            {storySet.audiobook_url ? (
                <div className='info-section'>
                <div style={{ marginBottom: '6px' }}>
                    <strong>Audiobook:</strong> {formatTime(storySet.audiobook_duration)}
                </div>
                <div style={{
                    height: '6px',
                    width: '100%',
                    background: '#eee',
                    borderRadius: '4px',
                    overflow: 'hidden',
                }}>
                <div
                    style={{
                    width: `${Math.round((storySet.audiobook_progress / storySet.audiobook_duration) * 100)}%`,
                    height: '100%',
                    background: '#FF4F81',
                    transition: 'width 0.3s ease'
                    }}
                ></div>
                </div>
                <p style={{ fontSize: '0.9em', marginTop: '4px' }}>
                    {Math.round((storySet.audiobook_progress / storySet.audiobook_duration) * 100)}% complete
                </p>
                </div>
                ) : ('')
            }

            {wordCount && pageCount && (
                <p>
                    <strong>Word Count:</strong> {wordCount.toLocaleString()} 
                    <span style={{ marginLeft: '10px' }}><strong>Pages: ~</strong> {pageCount}</span>
                </p>
            )}
            
            <p><strong>Genre:</strong> {storySet.genre || '-'}</p>
            <p><strong>Relationship Type:</strong> {storySet.relationship_type || '-'}</p>
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                <p style={{margin: 0, marginRight: 3}}><strong>Spice Level:</strong></p>
                {explicitPepperIcons(storySet.spice)}
            </div>
            <p><strong>Persona:</strong> {storySet.persona || '-'}</p>
            <p><strong>Romantic Interest:</strong> {storySet.romantic_interest_personality || '-'}</p>
            <p><strong>Control Mode:</strong> {capitalize(storySet.control) || '-'}</p>
            <p><strong>Length:</strong> {capitalize(storySet.length) || '-'}</p>

            <p><strong>Summary So Far:</strong> {storySet && storySet.story.length > 0 ? storySet.story.at(-1).summary || '-': '-'}</p>
        </div>
        </div>
    );
};

export default StoryInfoModal;