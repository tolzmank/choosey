// src/App.js
import './App.css';
import React, { useEffect, useState, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navigate } from "react-router-dom";

import Header from './components/Header';
import Menu from './components/Menu';
import LoginPage from './components/LoginPage';
import AccountPage from './components/AccountPage';
import MyStories from './components/MyStories';
import CreateStory from './components/CreateStory';
import ReaderPage from './components/ReaderPage';
import SuccessPage from './components/SuccessPage';
import CancelPage from './components/CancelPage';

import axios from 'axios';
import { auth } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
const apiBaseURL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8080"
    : "http://192.168.4.145:8080";

function App() {
  const [stories, setStories] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [startWithCreateAccount, setStartWithCreateAccount] = useState(false);
  const [loginPrefill, setLoginPrefill] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === null) {
      // Default to dark mode if no theme is saved yet
      return true;
    }
    return savedTheme === 'dark';
  });

  // Auth and fetch User data
  useEffect(() => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const idToken = await user.getIdToken();
        axios.get(`${apiBaseURL}/api/v1/my_stories`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
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
        axios.get(`${apiBaseURL}/api/v1/get_user_profile`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        })
          .then(res => {
            console.log('Profile:', res.data);
            setUserProfile(res.data);
          })
          .catch(err => console.error(err));
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
    });
  }, []);


  // Theme toggle
  useEffect(() => {
    if (darkMode) {
      document.body.classList.remove('light-theme');  // remove light
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.add('light-theme');     // add light
      localStorage.setItem('theme', 'light-theme');
    }
  }, [darkMode]);

  // Check for signup_retry param and pendingSignup in localStorage
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('signup_retry') === 'true') {
      // Try to load pending signup data
      try {
        const saved = localStorage.getItem('pendingSignup');
        if (saved) {
          setLoginPrefill(JSON.parse(saved));
        }
      } catch (e) {
        setLoginPrefill(null);
      }
      setStartWithCreateAccount(true);
      setShowLogin(true);
    }
  }, []);


  return (
    <Router>
      <Header />
      <Menu currentUser={currentUser} userProfile={userProfile} darkMode={darkMode} setDarkMode={setDarkMode} onLoginClick={(createAccount=false) => { setStartWithCreateAccount(createAccount); setShowLogin(true); }} />

      <Routes>
        <Route path="/" element={<Navigate to="/create_story" replace />} />

        <Route path="/create_story" element={<CreateStory currentUser={currentUser} userProfile={userProfile} apiBaseURL={apiBaseURL} onLoginClick={(createAccount=false) => { setStartWithCreateAccount(createAccount); setShowLogin(true); }} />} />
        
        <Route path="/my_stories" element={<MyStories stories={stories} currentUser={currentUser} userProfile={userProfile} setStories={setStories} apiBaseURL={apiBaseURL} onLoginClick={(createAccount=false) => { setStartWithCreateAccount(createAccount); setShowLogin(true); }}/>} />

        <Route path="/account_page" element={<AccountPage currentUser={currentUser} userProfile={userProfile} setUserProfile={setUserProfile} apiBaseURL={apiBaseURL} />}/>
        
        <Route path="/read_story/:id" element={<ReaderPage currentUser={currentUser} userProfile={userProfile} darkMode={darkMode} setDarkMode={setDarkMode} apiBaseURL={apiBaseURL} onLoginClick={(createAccount=false) => { setStartWithCreateAccount(createAccount); setShowLogin(true); }} />} />
        
        <Route path="/success" element={<SuccessPage />} />
        <Route path="/cancel" element={<CancelPage />} />
        
      </Routes>
      {showLogin && (
        <div className="modal-overlay">
          <LoginPage startWithCreateAccount={startWithCreateAccount} onClose={() => setShowLogin(false)} prefill={loginPrefill} />
        </div>
      )}
    </Router>
    
  );
}

export default App;