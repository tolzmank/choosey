// src/components/Menu.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function Menu({currentUser, userProfile, darkMode, setDarkMode, onLoginClick}) {
    if (currentUser && userProfile) {
        if (userProfile?.sub_status === 'unlimited') {
            return (
                <div className="menu-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0'}}>
                    <p>currentUser Unlimited</p>
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
                    <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/account_page" title="Account Details">
                        <div className='menu-item'>
                            <img src="/icons/account_circle_pink.svg" alt="Account"  className="menu-icon" style={{height: '100%', height: '40px'}} /><br></br>
                            <span style={{color: '#7f7f7f'}}>Account</span>
                        </div>
                    </Link>
                    <button onClick={() => { setDarkMode(!darkMode); localStorage.setItem("darkMode", !darkMode);}} className="button-menu-gray" style={{marginRight: "5px" }}> 
                        <div className='menu-item'>
                            <img src={darkMode ? "/icons/dark_mode_pink.svg" : "/icons/light_mode_pink.svg"} alt="Toggle Theme" className="menu-icon" style={{height: '100%', height: 40}} /><br></br>
                            <span style={{color: '#7f7f7f'}}>Theme</span>
                        </div>
                    </button>
                </div>
            )
        } else {
            return (
                <div className="menu-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0'}}>
                    <p>currentUser not paid</p>
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
                    <Link className="button-menu-gray" style={{marginRight: '5px'}} to="/account_page" title="Account Details">
                        <div className='menu-item'>
                            <img src="/icons/account_circle_pink.svg" alt="Account"  className="menu-icon" style={{height: '100%', height: '40px'}} /><br></br>
                            <span style={{color: '#7f7f7f'}}>Account</span>
                        </div>
                    </Link>
                    <button onClick={() => { setDarkMode(!darkMode); localStorage.setItem("darkMode", !darkMode);}} className="button-menu-gray" style={{marginRight: "5px" }}> 
                        <div className='menu-item'>
                            <img src={darkMode ? "/icons/dark_mode_pink.svg" : "/icons/light_mode_pink.svg"} alt="Toggle Theme" className="menu-icon" style={{height: '100%', height: 40}} /><br></br>
                            <span style={{color: '#7f7f7f'}}>Theme</span>
                        </div>
                    </button>

                </div>
            )
        }
    }


    return (
        <div className="menu-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0'}}>
            <p>No currentUser</p>
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
                    <span style={{color: '#7f7f7f'}}>Login / Create Account</span>
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