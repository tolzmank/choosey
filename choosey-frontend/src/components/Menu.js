// src/components/Menu.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function Menu({
    currentUser, 
    userProfile, 
    darkMode, 
    setDarkMode, 
    onLoginClick, 
    showAudioBar, setShowAudioBar, 
    isPlaying, setIsPlaying, 
    audioRef,
    currentStoryId,
    currentStoryTitle,
    abUrl
}) {
    if (currentUser && userProfile) {

        return (
            <div className="menu-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0'}}>
                <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/create_story" title="Start creating a new story">
                    <div className='menu-item'>
                        <img src="/icons/create_new_pink.svg" alt="Account"  className="menu-icon" style={{height: '40px'}} /><br></br>
                        <span style={{color: '#7f7f7f'}}>Create</span>
                    </div>
                </Link>
                <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/my_stories" title="View all stories you've created">
                    <div className='menu-item'>
                        <img src="/icons/book2_pink.svg" alt="Account"  className="menu-icon" style={{height: '40px'}} /><br></br>
                        <span style={{color: '#7f7f7f'}}>My Stories</span>
                    </div>
                </Link>
                <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/account_page" title="Account Details">
                    <div className='menu-item'>
                        <img src="/icons/account_circle_pink.svg" alt="Account"  className="menu-icon" style={{height: '40px'}} /><br></br>
                        <span style={{color: '#7f7f7f'}}>Account</span>
                    </div>
                </Link>
                <button onClick={() => { setDarkMode(!darkMode); localStorage.setItem("darkMode", !darkMode);}} className="button-menu-gray" style={{marginRight: "5px" }}> 
                    <div className='menu-item'>
                        <img src={darkMode ? "/icons/dark_mode_pink.svg" : "/icons/light_mode_pink.svg"} alt="Toggle Theme" className="menu-icon" style={{height: '40px'}} /><br></br>
                        <span style={{color: '#7f7f7f'}}>Theme</span>
                    </div>
                </button>


            {!showAudioBar && (
                <div className="mini-audio-controls">
                    <div className="button-menu-gray" style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "62px" }}>

                    {/* Play / Pause Circle */}
                    <button
                        onClick={() => {
                            if (abUrl) {
                                if (audioRef?.current) {
                                    if (isPlaying) {
                                        audioRef.current.pause();
                                        setIsPlaying(false);
                                    } else {
                                        audioRef.current.play();
                                        setIsPlaying(true);
                                    }
                                }
                            } else {
                                setShowAudioBar(true);
                            }
                        }}

                        className="menu-icon"
                        title={isPlaying ? "Pause" : "Play"}
                        style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        }}
                    >
                        <img
                            src={isPlaying ? "/icons/pause_circle_pink.svg" : "/icons/play_circle_pink.svg"}
                            alt={isPlaying ? "Pause" : "Play"}
                            style={{ height: 40 }}
                        />
                    </button>

                    {/* Show full audio player button */}
                    <button
                        onClick={() => setShowAudioBar(true)}
                        className="show-audio-btn"
                        title="Show Audio Player"
                        style={{
                        background: "#484848",
                        border: "none",
                        borderRadius: '5px',
                        cursor: "pointer",
                        padding: 0,
                        marginTop: '25px',
                        marginBottom: "-15px",
                        opacity: 0.8,
                        transition: "opacity 0.2s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.5)}
                    >
                        <div className='marquee-container'>
                            <span className='marquee-text' style={{color: '#e8e8e8ff', fontSize: '1em'}}>{currentStoryTitle}</span>
                        </div>
                        
                    </button>
                    </div>
                </div>
            )}


    </div>

        )
    }
    // No currentUser
    return (
        <div className="menu-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0'}}>
            <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/create_story" title="Start creating a new story">
                <div className='menu-item'>
                    <img src="/icons/create_new_pink.svg" alt="Account"  className="menu-icon" style={{height: '100%', height: '40px'}} /><br></br>
                    <span style={{color: '#7f7f7f'}}>Create</span>
                </div>
            </Link>
            <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/my_stories" title="View all stories you've created">
                <div className='menu-item'>
                    <img src="/icons/book2_pink.svg" alt="Account"  className="menu-icon" style={{height: '100%', height: '40px'}} /><br></br>
                    <span style={{color: '#7f7f7f'}}>My Stories</span>
                </div>
            </Link>
            <Link className="button-menu-gray" style={{marginRight: '15px'}} onClick={onLoginClick} title="Log in or create your account">
                <div className='menu-item'>
                    <img src="/icons/account_circle_pink.svg" alt="Account"  className="menu-icon" style={{height: '100%', height: '40px'}} /><br></br>
                    <span style={{color: '#7f7f7f'}}>Account</span>
                </div>
            </Link>

            <button onClick={() => { setDarkMode(!darkMode); localStorage.setItem("darkMode", !darkMode); }} className="button-menu-gray" style={{marginRight: "5px" }}> 
                <div className='menu-item'>
                    <img src={darkMode ? "/icons/dark_mode_pink.svg" : "/icons/light_mode_pink.svg"} alt="Toggle Theme" className="menu-icon" style={{height: '100%', height: 40}} /><br></br>
                    <span style={{color: '#7f7f7f'}}>Theme</span>
                </div>
            </button>
        </div>
    );
}

export default Menu;