// src/components/Menu.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MiniAudiobookBar from "../components/MiniAudiobookBar";

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
                        <img src="/icons/create_new_pink.svg" alt="Account"  className="menu-icon" /><br></br>
                        <span style={{color: '#7f7f7f'}}>Create</span>
                    </div>
                </Link>
                <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/my_stories" title="View all stories you've created">
                    <div className='menu-item'>
                        <img src="/icons/book2_pink.svg" alt="Account"  className="menu-icon" /><br></br>
                        <span style={{color: '#7f7f7f'}}>My Stories</span>
                    </div>
                </Link>
                <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/account_page" title="Account Details">
                    <div className='menu-item'>
                        <img src="/icons/account_circle_pink.svg" alt="Account"  className="menu-icon" /><br></br>
                        <span style={{color: '#7f7f7f'}}>Account</span>
                    </div>
                </Link>
                <button onClick={() => { setDarkMode(!darkMode); localStorage.setItem("darkMode", !darkMode);}} className="button-menu-gray" style={{marginRight: "5px" }}> 
                    <div className='menu-item'>
                        <img src={darkMode ? "/icons/dark_mode_pink.svg" : "/icons/light_mode_pink.svg"} alt="Toggle Theme" className="menu-icon" /><br></br>
                        <span style={{color: '#7f7f7f'}}>Theme</span>
                    </div>
                </button>


            {!showAudioBar && (
                <MiniAudiobookBar 
                    setShowAudioBar={setShowAudioBar}
                    abUrl={abUrl}
                    audioRef={audioRef}
                    isPlaying={isPlaying}
                    setIsPlaying={setIsPlaying}
                    currentStoryTitle={currentStoryTitle}
                />
            )}


    </div>

        )
    }
    // No currentUser
    return (
        <div className="menu-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0'}}>
            <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/create_story" title="Start creating a new story">
                <div className='menu-item'>
                    <img src="/icons/create_new_pink.svg" alt="Account"  className="menu-icon" /><br></br>
                    <span style={{color: '#7f7f7f'}}>Create</span>
                </div>
            </Link>
            <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/my_stories" title="View all stories you've created">
                <div className='menu-item'>
                    <img src="/icons/book2_pink.svg" alt="Account"  className="menu-icon" /><br></br>
                    <span style={{color: '#7f7f7f'}}>My Stories</span>
                </div>
            </Link>
            <Link className="button-menu-gray" style={{marginRight: '15px'}} onClick={onLoginClick} title="Log in or create your account">
                <div className='menu-item'>
                    <img src="/icons/account_circle_pink.svg" alt="Account"  className="menu-icon" /><br></br>
                    <span style={{color: '#7f7f7f'}}>Account</span>
                </div>
            </Link>

            <button onClick={() => { setDarkMode(!darkMode); localStorage.setItem("darkMode", !darkMode); }} className="button-menu-gray" style={{marginRight: "5px" }}> 
                <div className='menu-item'>
                    <img src={darkMode ? "/icons/dark_mode_pink.svg" : "/icons/light_mode_pink.svg"} alt="Toggle Theme" className="menu-icon" /><br></br>
                    <span style={{color: '#7f7f7f'}}>Theme</span>
                </div>
            </button>
        </div>
    );
}

export default Menu;