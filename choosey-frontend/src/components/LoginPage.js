// src/components/LoginPage.js
import React, { useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';

function LoginPage({onClose}) {
    const [showCreateAccount, setShowCreateAccount] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    const [birthdate, setBirthdate] = useState('');
    const [error, setError] = useState('');


    const handleSignIn = async () => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = '/my_stories';
        } catch (err) {
            setError(err.message);
        }
    };

    const handleSignUp = async () => {
        if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
        }
        try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Optionally handle name/birthdate here if you store it elsewhere
        window.location.href = '/create_story';
        } catch (err) {
        setError(err.message);
        }
    };

    const handleGoogleSignIn = async () => {
        try {
        await signInWithPopup(auth, googleProvider);
        window.location.href = '/my_stories';
        } catch (err) {
        setError(err.message);
        }
    };


    return (
        <div className="menu-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
      <h2>{showCreateAccount ? 'Create Account' : 'Login or Create Account'}</h2>

      {showCreateAccount ? (
        <>
          <label style={{ marginTop: '10px' }}>Name</label>
          <input className="bubble-input" style={{ marginTop: '10px' }} type="text" value={name} placeholder="Name" onChange={(e) => setName(e.target.value)} />

          <label style={{ marginTop: '20px' }}>Birthdate</label>
          <input className="bubble-input" style={{ marginTop: '10px' }} type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />

          <label style={{ marginTop: '20px' }}>Email</label>
          <input className="bubble-input" style={{ marginTop: '10px' }} type="email" value={email} placeholder="Email" onChange={(e) => setEmail(e.target.value)} />

          <label style={{ marginTop: '20px' }}>Password</label>
          <input className="bubble-input" style={{ marginTop: '10px' }} type="password" value={password} placeholder="Password" onChange={(e) => setPassword(e.target.value)} />

          <label style={{ marginTop: '20px' }}>Confirm Password</label>
          <input className="bubble-input" style={{ marginTop: '10px' }} type="password" value={confirmPassword} placeholder="Confirm Password" onChange={(e) => setConfirmPassword(e.target.value)} />

          <button className="button" style={{ marginTop: '30px' }} onClick={handleSignUp}>Create Account</button>
          <button className="button-menu"  style={{ marginTop: '20px' }} onClick={() => setShowCreateAccount(false)}>Login</button>
        </>
      ) : (
        <>
          <label style={{ marginTop: '10px' }}>Email</label>
          <input className="bubble-input"  style={{ marginTop: '10px' }}type="email" value={email} placeholder="Email" onChange={(e) => setEmail(e.target.value)} />

          <label style={{ marginTop: '10px' }}>Password</label>
          <input className="bubble-input"  style={{ marginTop: '10px' }}type="password" value={password} placeholder="Password" onChange={(e) => setPassword(e.target.value)} />

          <button className="button" onClick={handleSignIn} style={{ marginTop: '20px' }}>Login</button>
          <button className="button-menu-gray" onClick={handleGoogleSignIn} style={{ marginTop: '10px' }}>Sign in with Google</button>
          <button className="button-menu-gray" onClick={() => setShowCreateAccount(true)} style={{ marginTop: '10px' }}>Create Account</button>
        </>
      )}

      <button className="button-menu-gray" style={{ marginTop: '20px' }} onClick={onClose}>Cancel</button>

      {error && <p style={{ color: 'gray' }}>{error}</p>}
    </div>
    );
}

export default LoginPage;