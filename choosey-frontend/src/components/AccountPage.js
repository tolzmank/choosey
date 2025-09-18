// src/components/AccountPage.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

function AccountPage({currentUser, userProfile, setUserProfile, darkMode, setDarkMode, apiBaseURL}) {
    const [name, setName] = useState('');
    const [birthdate, setBirthdate] = useState('');
    const [accountMessage, setAccountMessage] = useState('');

    useEffect(() => {
        if (userProfile) {
            setName(userProfile.name || '');
            setBirthdate(userProfile.birthdate || '');
        }
    }, [userProfile]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert('You must be logged in.');
            return;
        }

        try {
            const idToken = await currentUser.getIdToken();
            await axios.put(
                `${apiBaseURL}/api/v1/update_account`,
                { name, birthdate },
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
        if (!window.confirm('Are you sure you want to delete your Account? This cannot be undone.')) {
            return;
        }
        try {
            const idToken = await currentUser.getIdToken();
            await axios.delete(
            `${apiBaseURL}/api/v1/delete_account`,
            { headers: { Authorization: `Bearer ${idToken}` } }
            );
            // Sign out locally
            await signOut(auth);
            alert('Account deleted.');
            window.location.href = '/';
        } catch (err) {
            console.error(err);
            setAccountMessage('Could not delete account. Please try again later.')
        }
    };

    const handleLogout = async () => {
        try {
        await signOut(auth);
        window.location.href = '/';
        } catch (err) {
        console.error(err);
        alert('Logout failed.');
        }
    };

    if (!currentUser) {
        return <p>Please log in to view your account.</p>;
    }

    return (
        <div className="menu-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px 0' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <label htmlFor="name">Name</label>
                <input className="bubble-input" style={{ marginTop: '5px', marginBottom: '20px' }} type="text" id="name" placeholder="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} />

                <label htmlFor="birthdate">Birthdate</label>
                <input className="bubble-input" style={{ width: '100%', marginTop: '5px', marginBottom: '20px' }} type="date" id="birthdate" name="birthdate" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />

                <label htmlFor="user_email">Email</label>
                <input className="bubble-input" style={{ marginTop: '5px', marginBottom: '20px' }} type="text" id="user_email" name="user_email" value={currentUser.email} readOnly />

                <button type="submit" className="button" style={{ marginTop: '10px' }}>
                Update Account Info
                </button>
                {accountMessage && <p style={{ color: 'gray' }}>{accountMessage}</p>}
            </form>

            <button className="button-gray" style={{ marginTop: '10px' }} onClick={handleLogout} title="Logout">
                Logout
            </button>

            <button type="button" className="button-gray" style={{ marginTop: '30px' }} onClick={handleDeleteAccount}>
                Delete Account
            </button>
        </div>
)}


export default AccountPage;