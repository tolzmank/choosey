// src/components/AccountPage.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import RetryPaymentButton from './RetryPaymentButton';
import ChangeEmailForm from './ChangeEmailForm';
import ChangePasswordForm from './ChangePasswordForm';


function AccountPage({currentUser, userProfile, setUserProfile, apiBaseURL}) {
    const [name, setName] = useState('');
    const [birthdate, setBirthdate] = useState('');
    const [accountMessage, setAccountMessage] = useState('');

    const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
    const [showLoginInfoModal, setShowLoginInfoModal] = useState(false);
    const [mode, setMode] = useState('email');
    const [errMsg, setErrMsg] = useState('');

    const handleManageBilling = async () => {
        setErrMsg('');
        try {
            const idToken = await currentUser.getIdToken();
            const res = await axios.post(
            `${apiBaseURL}/api/v1/create_customer_portal_session`,
            {'api_base_url': window.location.origin},
            { headers: { Authorization: `Bearer ${idToken}` } }
            );
            window.location.href = res.data.url;
        } catch (err) {
            console.error("Error creating portal session", err);
            setErrMsg("Could not open billing portal. Please try again later.");
        }
        };

    useEffect(() => {
        if (userProfile) {
            setName(userProfile.name || '');
            setBirthdate(userProfile.birthdate || '');
        }
    }, [userProfile]);

    const setTurnOffs = (value) => {
        setUserProfile(prev => ({
            ...prev,
            turn_offs: value
        }));
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrMsg('');
        if (!currentUser) {
            setErrMsg("You must be logged in.");
            return;
        }

        try {
            const idToken = await currentUser.getIdToken();
            await axios.put(
                `${apiBaseURL}/api/v1/update_account`,
                {
                    name, 
                    birthdate, 
                    voice_id: userProfile.voice_id || '176a55b1-4468-4736-8878-db82729667c1', 
                    voice_speed: userProfile.voice_speed || 1.0,
                    turn_offs: userProfile.turn_offs || ""
                },
                { headers: { Authorization: `Bearer ${idToken}` } }
            );


            // Re-fetch the updated profile
            const res = await axios.get(
                `${apiBaseURL}/api/v1/get_user_profile`,
                { headers: { Authorization: `Bearer ${idToken}` } }
            );
            setUserProfile(res.data);
            console.log('Profile re-fetched:', res.data);
            setAccountMessage('Account information updated successfully.')

            } catch (err) {
            console.error('Error updating profile:', err);
            setAccountMessage('Could not update account information. Please try again later.')
            }
    };

    const handleDeleteAccount = async () => {
        try {
            const idToken = await currentUser.getIdToken();
            await axios.delete(
            `${apiBaseURL}/api/v1/delete_account`,
            { headers: { Authorization: `Bearer ${idToken}` } }
            );
            // Sign out locally
            await signOut(auth);
            setAccountMessage('Account deleted.')

            window.location.href = '/';
        } catch (err) {
            console.error(err);
            setAccountMessage('Could not delete account. Please try again later.')
        }
    };

    const handleLogout = async () => {
        setErrMsg('');
        try {
            await signOut(auth);
                localStorage.removeItem("postLoginRedirect");
                localStorage.removeItem('postSignupRedirect');
                window.location.href = '/';
            } catch (err) {
                console.error(err);
                setErrMsg('Logout failed.');
        }
    };

    useEffect(() => {
        if (localStorage.getItem('openLoginInfoModal') === 'true') {
            setShowLoginInfoModal(true);
            localStorage.removeItem('openLoginInfoModal');
        }
    }, []);

    if (!currentUser) {
        return <p>Please log in to view your account.</p>;
    }

    return (
        <div className="box-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px 0' }}>
            { userProfile?.sub_status !== 'unlimited' && (
                <div className='premium-banner'>
                    <>
                    <p style={{marginTop: '0px'}}>Please complete payment to unlock Choosey Unlimited features.</p>
                    <ul>
                        <li>Save and continue all your stories anytime</li>
                        <li>Enter your own custom story options</li>
                        <li>Immersive full audiobook narration</li>
                        <li>Just $4.99 / month</li>
                    </ul>
                    <RetryPaymentButton apiBaseURL={apiBaseURL} />
                    </>
                </div>
            )}
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <label htmlFor="name">Name</label>
                <input className="bubble-input" style={{ marginTop: '5px', marginBottom: '20px' }} type="text" id="name" placeholder="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} />

                <label htmlFor="birthdate">Birthdate</label>
                <input className="bubble-input" style={{ width: '100px', marginTop: '5px', marginBottom: '20px' }} type="date" id="birthdate" name="birthdate" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />

                <label htmlFor="user_email">Email</label>
                <input className="bubble-input" style={{ marginTop: '5px', marginBottom: '20px' }} type="text" id="user_email" name="user_email" value={currentUser.email} readOnly />

                <label htmlFor="turn_offs">Turn Offs (Optional)</label>
                <textarea
                    className="bubble-input"
                    style={{ height: '100px', marginTop: '5px', marginBottom: '5px' }}
                    id="turnOffs"
                    maxLength={200} // Cap at 200 characters
                    placeholder="If you want, briefly describe anything you DO NOT want to see in your stories."
                    value={userProfile?.turn_offs || ""}
                    onChange={(e) => setTurnOffs(e.target.value)}
                />
                <small style={{marginBottom: '20px'}}>{200 - (userProfile?.turn_offs?.length || 0)} characters left</small>

                <label htmlFor="voice">Narration Voice</label>
                    <select id="voice" className="bubble-input" style={{ marginTop: '5px', marginBottom: '20px' }} value={userProfile?.voice_id || "176a55b1-4468-4736-8878-db82729667c1"} onChange={(e) => setUserProfile({...userProfile, voice_id: e.target.value})}>
                        <option value="176a55b1-4468-4736-8878-db82729667c1">(Default) British Male</option>
                        <option value="15f594d3-0683-4585-b799-ce12e939a0e2">Rough Intellectual Man</option>
                        <option value="a7ecc00a-6fc0-4546-8126-e12cfd8de3bf">British Female</option>
                        <option value="5bb7de05-c8fe-426a-8fcc-ba4fc4ce9f9c">Fun Female</option>
                        <option value="6b530c02-5a80-4e60-bb68-f2c171c5029f">Expressive Girl</option>
                        <option value="c11052f5-96df-4c0e-9bba-07e0ad19c4b3">Dramatic Male</option>
                        <option value="ebba4902-69de-4e01-9846-d8feba5a1a3f">Flirty Female</option>
                        <option value="f898a92e-685f-43fa-985b-a46920f0650b">Mysterious Woman</option>
                        <option value="8c7d03bd-20d4-40e9-aca1-0469af8ae450">Inspiring Man</option>
                        <option value="445d65ed-a87f-4140-9820-daf6d4f0a200">Booming Narrator Male</option>
                    </select>

                <label htmlFor="voice_speed">Narration Speed</label>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: '5px', marginBottom: '20px' }}>
                    <input
                        type="range"
                        id="voice_speed"
                        min="0.25"
                        max="2.0"
                        step="0.25"
                        value={userProfile?.voice_speed || 1.0}
                        style={{ flex: 1, marginRight: '15px', accentColor: '#FF4F81' }}
                        onChange={e => setUserProfile({ ...userProfile, voice_speed: parseFloat(e.target.value) })}
                    />
                    <span style={{ minWidth: 40, textAlign: 'right', color: '#888' }}>
                        {Number(userProfile?.voice_speed || 1.0).toFixed(2)}x
                    </span>
                </div>

                <button type="submit" className="button" style={{ marginTop: '10px' }}>
                    Save Settings
                </button>
                {accountMessage && <p style={{ color: 'gray' }}>{accountMessage}</p>}
            </form>
            <button className="button-gray" style={{ marginTop: '10px' }} onClick={() => setShowLoginInfoModal(true)}>
                Change Login Info
            </button>

            { userProfile?.sub_status === 'unlimited' && (
                <button className="button-gray" style={{ marginTop: '10px' }} onClick={handleManageBilling}>
                    Manage Subscription
                </button>
            )}

            <button className="button-gray" style={{ marginTop: '10px' }} onClick={handleLogout} title="Logout">
                Logout
            </button>
            {errMsg && (
                <span style={{color: '#8e5656ff', maxWidth: '400px', marginBottom: '15px'}}>{errMsg}</span>
            )}

            <button type="button" className="button-gray" style={{ marginTop: '30px' }} onClick={() => setShowDeleteAccountConfirm(true)}>
                Delete Account
            </button>
    {showDeleteAccountConfirm && (
        <div className="modal-overlay">
            <div className="modal-content" style={{ backgroundColor: '#2f2f2f' }}>
            <h4>Are you sure?</h4>
            <p>
                Deleting your account will:
                <ul>
                    <li>Cancel your subscription</li>
                    <li>Permanently delete all your stories</li>
                    <li>Remove your profile</li>
                </ul>
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
                <button className="button" onClick={() => setShowDeleteAccountConfirm(false)}>
                Cancel
                </button>
                <button className="button-gray" onClick={handleDeleteAccount}>
                Yes, Delete My Account
                </button>
            </div>
            </div>
        </div>
        )}

    {showLoginInfoModal && (
        <div className="modal-overlay">
            <div className="signup-container" style={{ position: "relative" }}>
                <div style={{paddingBottom: '20px'}}>
                    <h2><button className="button-menu-gray" onClick={() => setMode('email')} style={{ fontWeight: mode === 'email' ? 'bold':'normal', color: mode === 'email' ? '#999':'#FF4F81'}}>Change Email</button> | <button className="button-menu-gray"  style={{ fontWeight: mode === 'password'? 'bold':'normal', color: mode === 'password'? '#999':'#FF4F81' }} onClick={() => setMode('password')}>Change Password</button></h2>
                </div>

                <button className="button-menu-gray" style={{ paddingTop: '3px', paddingBottom: '15px', borderRadius: '30px', position: 'absolute', top: '10px', right: '10px'}} onClick={() => setShowLoginInfoModal(false)}>
                    <img src="/icons/close_gray.svg" alt="Close"  className="menu-icon" style={{ height: '30px'}} />
                </button>

                {mode === 'email' ? (
                    <ChangeEmailForm currentUser={currentUser} apiBaseURL={apiBaseURL} />
                ) : (
                    <ChangePasswordForm currentUser={currentUser} />
                )}
            </div>
        </div>
        )}
        </div>
)}


export default AccountPage;