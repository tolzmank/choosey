// src/components/LoginPage.js
import React, { useState, useEffect } from 'react';
import { auth, googleProvider } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

function LoginPage({onClose, apiBaseURL, startWithCreateAccount = false, prefill = null}) {
    const [showCreateAccount, setShowCreateAccount] = useState(startWithCreateAccount);
    // Initialize state from prefill if provided
    const [email, setEmail] = useState(prefill && prefill.email ? prefill.email : '');
    const [password, setPassword] = useState(prefill && prefill.password ? prefill.password : '');
    const [confirmPassword, setConfirmPassword] = useState(prefill && prefill.password ? prefill.password : '');
    const [name, setName] = useState(prefill && prefill.name ? prefill.name : '');
    const [birthdate, setBirthdate] = useState(prefill && prefill.birthdate ? prefill.birthdate : '');
    const [error, setError] = useState('');
    const [birthdateError, setBirthdateError] = useState('');
    const [displayMsg, setDisplayMsg] = useState('');
    const [loading, setLoading] = useState(false);

    // If prefill changes, update fields (for modal re-opening)
    useEffect(() => {
      if (prefill) {
        if (prefill.email) setEmail(prefill.email);
        if (prefill.password) { setPassword(prefill.password); setConfirmPassword(prefill.password); }
        if (prefill.name) setName(prefill.name);
        if (prefill.birthdate) setBirthdate(prefill.birthdate);
      }
    }, [prefill]);

    const handleSignIn = async () => {
      setDisplayMsg('');
      try {
        const prevPath = localStorage.getItem("postLoginRedirect") || window.location.pathname + window.location.search;
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        const idToken = await userCred.user.getIdToken();

        // Migrate anon stories here
        try {
          const anonId = localStorage.getItem("anon_id");
          if (anonId) {
            await fetch(`${apiBaseURL}/api/v1/migrate_anon`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
              },
              body: JSON.stringify({ anon_id: anonId })
            });
            localStorage.removeItem("anon_id");
          }
        } catch (e) {
          console.error("Anon migration failed", e);
        }

        // Clear redirect key and go back
        localStorage.removeItem("postLoginRedirect");
        window.location.href = prevPath || "/my_stories";
      } catch (err) {
        setError(err.message);
      }
    };

    async function handleForgotPassword(email) {
      if (!email) {
        setDisplayMsg("Please enter your email address first.");
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        setDisplayMsg("Password reset email sent. Check your inbox.");
      } catch (err) {
        console.error("Error sending reset email:", err);
        setDisplayMsg(err.message);
      }
    }

    const handleSignUp = async () => {
      localStorage.setItem("postSignupRedirect", window.location.href);
      setBirthdateError('');
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (!birthdate) {
        setError('Please enter your birthdate');
        setBirthdateError('Please enter your birthdate');
        return;
      }

      // Age check
      const birth = new Date(birthdate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      if (age < 18) {
        setError('You must be at least 18 years old to sign up');
        setBirthdateError('You must be at least 18 years old to sign up');
        return;
      }

      try {
        // 1. Create Firebase user immediately
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const idToken = await userCred.user.getIdToken();

        // 2. Save profile in Datastore
        await fetch(`${apiBaseURL}/api/v1/update_account`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({ name, birthdate, email })
        });

        // Migrate any anonymous stories after updating account
        try {
          const anonId = localStorage.getItem("anon_id");
          if (anonId) {
            await fetch(`${apiBaseURL}/api/v1/migrate_anon`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
              },
              body: JSON.stringify({ anon_id: anonId })
            });
            localStorage.removeItem("anon_id");
          }
        } catch (e) {
          console.error("Anon migration failed", e);
        }

        // Launch Stripe Checkout
        await handleGoUnlimited();
      } catch (err) {
        setError(err.message);
      }
    };

    const handleGoogleSignIn = async () => {
      localStorage.setItem("postLoginRedirect", window.location.href);
      localStorage.setItem("postSignupRedirect", window.location.href);
      try {
        const userCred = await signInWithPopup(auth, googleProvider);
        const idToken = await userCred.user.getIdToken();

        // Save basic profile in datastore
        await fetch(`${apiBaseURL}/api/v1/update_account`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({
            name: userCred.user.displayName || "",
            email: userCred.user.email || ""
          })
        });

        // Migrate anon stories
        const anonId = localStorage.getItem("anon_id");
        if (anonId) {
          await fetch(`${apiBaseURL}/api/v1/migrate_anon`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({ anon_id: anonId })
          });
          localStorage.removeItem("anon_id");
        }

        const profileRes = await fetch(`${apiBaseURL}/api/v1/get_user_profile`, {
          method: "GET",
          headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`
            }
        });
        const profileData = await profileRes.json();
        if (profileData.sub_status !== 'unlimited') {
          // New user or unpaid user signed in - redirect to payment
          await handleGoUnlimited();

        } else {
          // Existing paid user - Redirect back to where user was or to account page
          const prevPath = localStorage.getItem("postLoginRedirect") || "/my_stories";
          localStorage.removeItem("postLoginRedirect");
          window.location.href = prevPath;
        }
      } catch (err) {
        setError(err.message);
      }
    };

    // Inline birthdate validation for instant feedback
    const handleBirthdateChange = (e) => {
      const value = e.target.value;
      setBirthdate(value);
      setBirthdateError('');
      if (value) {
        const birth = new Date(value);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
          age--;
        }
        if (age < 18) {
          setBirthdateError('You must be at least 18 years old to sign up');
        }
      }
    };

    const handleGoUnlimited = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBaseURL}/api/v1/create_checkout_session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            success_url: window.location.origin + "/success",
            cancel_url: window.location.origin + "/cancel",
            uid: auth.currentUser.uid
          })
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url; // Stripe Checkout
          setLoading(false);
        } else {
          setError(data.error || "Failed to start checkout session");
          setLoading(false);
        }
      } catch (err) {
        setError("Error starting checkout: " + err.message);
        setLoading(false);
      }
    };


    return (
      <>
                    {loading && (
                <div className="modal-loading-overlay">
                  <div className="loading-spinner"></div>
                  <p>Connecting to Stripe Payment...</p>
                </div>
              )}
        <div className="signup-container">

          <h2><button className="button-menu-gray" onClick={() => setShowCreateAccount(true)} style={{ marginTop: '10px', fontWeight: showCreateAccount? 'bold':'normal', color: showCreateAccount? '#999':'#FF4F81'}}>Create Account</button> | <button className="button-menu-gray"  style={{ marginTop: '20px', fontWeight: !showCreateAccount? 'bold':'normal', color: !showCreateAccount? '#999':'#FF4F81' }} onClick={() => setShowCreateAccount(false)}>Login</button></h2>
          
          <button className="button-menu-gray" style={{ paddingTop: '3px', paddingBottom: '15px', borderRadius: '30px', position: 'absolute', top: '10px', right: '10px'}} onClick={onClose}>
            <img src="/icons/close_gray.svg" alt="Close"  className="menu-icon" style={{ height: '30px'}} />
          </button>

          {showCreateAccount ? (
            <>

                <h3 style={{marginBottom: '0px'}}>
                  Want more? Of course you do... 
                  <img src="/images/flirty_smiley.png" alt="Flirty Smiley" style={{ height: '20px'}} />
                </h3>
                <ul>
                  <li>Save and continue all your stories anytime</li>
                  <li>Enter your own custom story options</li>
                  <li>Immersive full audiobook narration</li>
                </ul>

                <h3 style={{marginBottom: '0px', marginTop: '10px'}}>Join Choosey Unlimited</h3>
                <p style={{marginTop: '0px'}}><strong>Only $4.99/month</strong></p>

              <label style={{ marginTop: '10px' }}>Name</label>
              <input className="bubble-input" style={{ marginTop: '10px' }} type="text" value={name} placeholder="Name" onChange={(e) => setName(e.target.value)} />

              <label style={{ marginTop: '20px' }}>Birthdate</label>
              <input
                className="bubble-input"
                style={{ marginTop: '10px' }}
                type="date"
                value={birthdate}
                onChange={handleBirthdateChange}
              />
              {birthdateError && (
                <p style={{ color: 'gray', marginTop: '5px', marginBottom: '0px' }}>{birthdateError}</p>
              )}

              <label style={{ marginTop: '20px' }}>Email</label>
              <input className="bubble-input" style={{ marginTop: '10px' }} type="email" value={email} placeholder="Email" onChange={(e) => setEmail(e.target.value)} />

              <label style={{ marginTop: '20px' }}>Password</label>
              <input className="bubble-input" style={{ marginTop: '10px' }} type="password" value={password} placeholder="Password" onChange={(e) => setPassword(e.target.value)} />

              <label style={{ marginTop: '20px' }}>Confirm Password</label>
              <input className="bubble-input" style={{ marginTop: '10px' }} type="password" value={confirmPassword} placeholder="Confirm Password" onChange={(e) => setConfirmPassword(e.target.value)} />

              <button className="button" style={{ marginTop: '30px' }} onClick={handleSignUp}>Create Account</button>
              {error && <p style={{ color: 'gray' }}>{error}</p>}
              <button className="button-menu-gray" onClick={handleGoogleSignIn} style={{ marginTop: '10px' }}>Sign up with Google</button>
            </>
          ) : (
            <>
              <label style={{ marginTop: '10px' }}>Email</label>
              <input className="bubble-input"  style={{ marginTop: '10px' }}type="email" value={email} placeholder="Email" onChange={(e) => setEmail(e.target.value)} />

              <label style={{ marginTop: '10px' }}>Password</label>
              <input className="bubble-input"  style={{ marginTop: '10px' }}type="password" value={password} placeholder="Password" onChange={(e) => setPassword(e.target.value)} />

              <button className="button" onClick={handleSignIn} style={{ marginTop: '20px' }}>Login</button>
              {error && <p style={{ color: 'gray' }}>{error}</p>}
              <button className="button-menu-gray" onClick={handleGoogleSignIn} style={{ marginTop: '10px' }}>Sign in with Google</button>


              <button 
                className="button-menu-gray" 
                style={{ color: '#919191' }}
                onClick={() => handleForgotPassword(email)}>
                Forgot your password?
              </button>
              {displayMsg && (
                <span style={{color: '#8e5656ff', maxWidth: '400px'}}>{displayMsg}</span>
              )}

            </>
          )}

          <button className="button-gray" style={{ marginTop: '20px' }} onClick={onClose}>Cancel</button>

        </div>
        </>
    );
}

export default LoginPage;