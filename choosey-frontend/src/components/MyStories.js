import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import RetryPaymentButton from './RetryPaymentButton';
import StoryInfoModal from './StoryInfoModal';

function MyStories({stories, currentUser, userProfile, setStories, apiBaseURL, onLoginClick, setCurrentStoryId, setCurrentStoryTitle}) {

    // Sorting state
    const [sortKey, setSortKey] = React.useState('last_modified');
    const [sortOrder, setSortOrder] = React.useState('desc');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [storyToDelete, setStoryToDelete] = useState(null);

    const [showInfoModal, setShowInfoModal] = useState(false);
    const [selectedStory, setSelectedStory] = useState(null);
    const location = useLocation();

    useEffect(() => {
        if (!currentUser) {
            const anonId = localStorage.getItem("anon_id");
            if (anonId) {
                fetchAnonStories(apiBaseURL, anonId, setStories);
            }
        } else if (currentUser) {
            currentUser.getIdToken().then((idToken) => {
            axios.get(`${apiBaseURL}/api/v1/my_stories`, {
                headers: { Authorization: `Bearer ${idToken}` },
            }).then(res => {
                const parsedStories = res.data.map(storySet => ({
                ...storySet,
                story: typeof storySet.story === 'string'
                ? JSON.parse(storySet.story)
                : storySet.story,
                }));
            setStories(parsedStories);
          })
          .catch(err => console.error(err));

            });
        }
    }, [currentUser, apiBaseURL, location.key]);


    const sortedStories = [...(stories || [])].sort((a, b) => {
        let aVal = a[sortKey];
        let bVal = b[sortKey];
        if (sortKey === 'title') {
            aVal = aVal?.toLowerCase() || '';
            bVal = bVal?.toLowerCase() || '';
            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        } else {
            // assume date
            const dateA = new Date(aVal);
            const dateB = new Date(bVal);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        }
    });

    // Fetch anon stories by anon_id
    const fetchAnonStories = async (apiBaseURL, anonId, setStories) => {
        try {
            if (!anonId) {
                console.warn("No anon_id available in localStorage.");
                return;
            }

            const res = await axios.get(`${apiBaseURL}/api/v1/anon_stories`, {
                params: { anon_id: anonId },
            });

            if (res.data) {
                setStories(res.data);
            } else {
                console.warn("No stories found for anon_id.");
                setStories([]);
            }
        } catch (err) {
            console.error("❌ Error fetching anon stories:", err);
            setStories([]);
        }
        };

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortOrder('asc');
        }
    };

    const handleDeleteStory = (storyId) => {
        if (currentUser) {
            currentUser.getIdToken().then((idToken) => {
                axios.delete(`${apiBaseURL}/api/v1/delete_story/${storyId}`, {
                    headers: { Authorization: `Bearer ${idToken}` },
                })
                .then(() => {
                    console.log(`Story ${storyId} deleted`);
                    setStories((prev) => prev.filter((s) => s.id !== storyId));
                })
                .catch(err => console.error(err));
            });
        } else {
            const anonId = localStorage.getItem('anon_id');
            if (!anonId) {
                console.error('No anon_id in localStorage; cannot delete anon story.');
                return;
            }
            axios.delete(`${apiBaseURL}/api/v1/delete_anon_story/${storyId}`, {
                params: { anon_id: anonId }
            })
            .then(() => {
                console.log(`Anon story ${storyId} deleted`);
                setStories((prev) => prev.filter((s) => s.id !== storyId));
            })
        }
        setCurrentStoryId('');
        setCurrentStoryTitle('');
    };

    const renderStories = () => {
        if (currentUser && !userProfile) {
            return (
                <tr>
                    <td colSpan="4" style={{textAlign: 'center'}}>
                        <div id="loading-overlay">
                            <div className="loading-spinner"></div>
                            <p>Loading your stories...</p>
                        </div>
                    </td>
                </tr>
            );
        }
        if (currentUser) {
            if (userProfile?.sub_status === 'unlimited') {
                return (
                    <>
                    {sortedStories && sortedStories.length > 0 ? (
                        sortedStories.map((story_set) => (
                            //row
                            <tr key={story_set.id}>
                                <td style={{ padding: '0px', width: '15px' }}>
                                    <button className='button-menu'
                                        onClick={() => { setSelectedStory(story_set); setShowInfoModal(true); }}
                                        title="Info"
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginTop: '4px'}}>
                                        <img src="/icons/book1.svg" alt="i" style={{height: '25px'}} />
                                    </button>
                                </td>
                                <td style={{paddingLeft: '5px'}}>
                                    <Link to={`/read_story/${story_set.id}`} state={{ storySet: story_set }}>
                                        {story_set.title}
                                    </Link>
                                </td>
                                <td style={{paddingRight: '0px', paddingLeft: '0px'}}>
                                    {new Date(story_set.last_modified).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                    })}
                                </td>
                                <td style={{paddingRight: '15px', paddingLeft: '15px'}}>
                                    <button
                                        className="delete-button"
                                        title="Delete Story"
                                        onClick={() => {
                                            setStoryToDelete(story_set.id);
                                            setShowDeleteConfirm(true);
                                        }}
                                    >
                                        <img src="/icons/delete.svg" alt="Delete" className="delete-icon" />
                                    </button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        // fallback
                        <tr>
                            <td>No stories yet</td>
                        </tr>
                    )}
                    </>
                )
            } else {
                return(
                    <>
                    <tr>
                        <td colSpan='3'>
                            <h3><img src="/images/fuzzy_handcuffs.png" alt="Fuzzy Handcuffs" style={{ marginTop: '-10px', height: '40px'}} /> Your stories are all tied up and waiting...</h3>
                        </td>
                    </tr>
                    {sortedStories && sortedStories.length > 0 ? (
                        sortedStories.map((story_set) => (
                            //row
                            <tr key={story_set.id}>
                                <td style={{ padding: '0px', width: '15px' }}>
                                    <button className='button-menu'
                                        onClick={() => { setSelectedStory(story_set); setShowInfoModal(true); }}
                                        title="Info"
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginTop: '4px'}}>
                                        <img src="/icons/book1.svg" alt="i" style={{height: '25px'}} />
                                    </button>
                                </td>
                                <td>
                                    {story_set.title}
                                </td>
                                <td style={{paddingRight: '0px', paddingLeft: '0px'}}>
                                    {new Date(story_set.last_modified).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                    })}
                                </td>
                                <td style={{paddingRight: '15px', paddingLeft: '15px'}}>
                                    <button
                                        className="delete-button"
                                        title="Delete Story"
                                        onClick={() => {
                                            setStoryToDelete(story_set.id);
                                            setShowDeleteConfirm(true);
                                        }}
                                    >
                                        <img src="/icons/delete.svg" alt="Delete" className="delete-icon" />
                                    </button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        // fallback
                        <tr>
                            <td>No stories yet</td>
                        </tr>
                    )}
                        <tr>
                            <td colSpan='3'>
                                <div className='premium-banner'>
                                <h3 style={{color: '#999', marginTop: '0px'}}><img src="/images/handcuff_key.png" alt="Handcuff Key" style={{ marginTop: '-10px', height: '20px'}} /> Unlock them now... just leave the money on the dresser <img src="/images/flirty_smiley.png" alt="Flirty Smiley" style={{ height: '20px'}} /></h3>
                                
                                <RetryPaymentButton apiBaseURL={apiBaseURL} />
                                </div>
                            </td>
                        </tr>
                    </>
                )
            }   
        } else {
            // Check for anon_id user
            const anonId = localStorage.getItem('anon_id');
            if (anonId) {
                return (
                    <>
                    <tr>
                        <td colSpan='3'>
                            <h3><img src="/images/fuzzy_handcuffs.png" alt="Fuzzy Handcuffs" style={{ marginTop: '-10px', height: '40px'}} /> anon Your stories are all tied up and waiting...</h3>
                        </td>
                    </tr>
                    {sortedStories && sortedStories.length > 0 ? (
                        sortedStories.map((story_set) => (
                            //row
                            <tr key={story_set.id}>
                                <td style={{ padding: '0px', width: '15px' }}>
                                    <button className='button-menu'
                                        onClick={() => { setSelectedStory(story_set); setShowInfoModal(true); }}
                                        title="Info"
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginTop: '4px'}}>
                                        <img src="/icons/book1.svg" alt="i" style={{height: '25px'}} />
                                    </button>
                                </td>
                                <td>
                                    {story_set.title}
                                </td>
                                <td style={{paddingRight: '0px', paddingLeft: '0px'}}>
                                    {new Date(story_set.last_modified).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                    })}
                                </td>
                                <td style={{paddingRight: '15px', paddingLeft: '15px'}}>
                                    <button
                                        className="delete-button"
                                        title="Delete Story"
                                        onClick={() => {
                                            setStoryToDelete(story_set.id);
                                            setShowDeleteConfirm(true);
                                        }}
                                    >
                                        <img src="/icons/delete.svg" alt="Delete" className="delete-icon" />
                                    </button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        // fallback - Anon stories message
                        <tr>
                            <td>No stories yet</td>
                        </tr>
                    )}
                        <tr>
                            <td colSpan='3'>
                                <div className='premium-banner'>
                                    <h3 style={{color: '#999', marginTop: '0px'}}><img src="/images/handcuff_key.png" alt="Handcuff Key" style={{ marginTop: '-10px', height: '20px'}} /> Unlock them now... <img src="/images/flirty_smiley.png" alt="Flirty Smiley" style={{ height: '20px'}} /></h3>
                                    <button  className="button" onClick={() => onLoginClick(true)}>Go Unlimited</button>
                                </div>
                            </td>
                        </tr>
                    </>
                )
            } else {
                return (
                    <tr>
                        <td>No stories yet</td>
                    </tr>
                )
            }
        }
    }

    return (
        <>
            <table style={{marginBottom: 150}}>
                <thead>
                    <tr>
                        <th className='no-sort' style={{paddingRight: '0px', paddingLeft: '7px', paddingTop: '0px'}}>
                            <img src="/icons/info_white.svg" alt="i" style={{height: '20px', marginTop: '5px'}} />
                        </th>
                        <th onClick={() => handleSort('title')} style={{cursor:'pointer', paddingLeft: '5px'}}>
                            Title {sortKey==='title' ? (sortOrder==='asc'?'▲':'▼') : ''}
                        </th>
                        <th onClick={() => handleSort('last_modified')} style={{cursor:'pointer'}}>
                            Last Modified {sortKey==='last_modified' ? (sortOrder==='asc'?'▲':'▼') : ''}
                        </th>
                        <th className="no-sort"></th>
                    </tr>
                </thead>
                <tbody>
                    {renderStories()}
                </tbody>



                {showInfoModal && (
                    <StoryInfoModal
                        storySet={selectedStory}
                        onClose={() => setShowInfoModal(false)}
                    />
                )}
            </table>
            {showDeleteConfirm && (
                <div className="modal-overlay">
                    <div className="modal-content">
                    <h4>Delete Story?</h4>
                    <p>This will permanently remove this story from your account. Are you sure?</p>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
                        <button 
                        className="button-gray" 
                        onClick={() => setShowDeleteConfirm(false)}
                        >
                        Cancel
                        </button>
                        <button 
                        className="button" 
                        onClick={() => {
                            setShowDeleteConfirm(false);
                            handleDeleteStory(storyToDelete);
                        }}
                        >
                        Yes, Delete
                        </button>
                    </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default MyStories;