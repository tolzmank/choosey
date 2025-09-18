import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

function MyStories({stories, currentUser, setStories, apiBaseURL}) {
    console.log('stories:', stories);

    // Sorting state
    const [sortKey, setSortKey] = React.useState('last_modified');
    const [sortOrder, setSortOrder] = React.useState('desc');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [storyToDelete, setStoryToDelete] = useState(null);

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

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortOrder('asc');
        }
    };

    const handleDeleteStory = (storyId) => {
        if (!currentUser) {
            console.error('Not logged in');
            return;
        }
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
    };

    return (
        <table style={{marginBottom: 100}}>
            <thead>
                <tr>
                    <th onClick={() => handleSort('title')} style={{cursor:'pointer'}}>
                        Title {sortKey==='title' ? (sortOrder==='asc'?'▲':'▼') : ''}
                    </th>
                    <th onClick={() => handleSort('last_modified')} style={{cursor:'pointer'}}>
                        Last Modified {sortKey==='last_modified' ? (sortOrder==='asc'?'▲':'▼') : ''}
                    </th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
            {sortedStories && sortedStories.length > 0 ? (
                sortedStories.map((story_set) => (
                    //row
                    <tr key={story_set.id}>
                        <td>
                            <Link to={`/read_story/${story_set.id}`} state={{ storySet: story_set }}>
                                {story_set.title}
                            </Link>
                        </td>
                        <td>
                            {new Date(story_set.last_modified).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                            })}
                        </td>
                        <td>
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
            </tbody>
            {showDeleteConfirm && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ backgroundColor: '#2f2f2f' }}>
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
        </table>
        
    );
}

export default MyStories;