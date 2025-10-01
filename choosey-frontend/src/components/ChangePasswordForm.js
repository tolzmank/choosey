import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { auth } from '../firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';


function ChangePasswordForm({ currentUser }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');

    const handleChangePassword = async (e) => {
        if (newPassword !== confirmNewPassword) {
            setError('Passwords do not match');
        return;
        }
        try {
            // Reauthenticate
            const credential = EmailAuthProvider.credential(
                currentUser.email,
                currentPassword
            );
            await reauthenticateWithCredential(currentUser, credential);

            // Update password
            await updatePassword(currentUser, newPassword);
            setMsg("Password updated successfully!");
            setError('');
        } catch (err) {
            console.error(err);
            if (err.message === 'Firebase: Error (auth/invalid-credential).') {
                setError("Incorrect current password.")
            } else {
                setError(err.message || "Failed to update password");
            }
        }
    };

    return (
        <>
            <label>Current Password</label>
            <input
                className="bubble-input"
                style={{marginTop: '10px', marginBottom: '20px', marginLeft: '10px'}}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
            />

            <label>New Password</label>
            <input
                className="bubble-input"
                style={{marginTop: '10px', marginBottom: '20px', marginLeft: '10px'}}
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
            />

            <label>Confirm New Password</label>
            <input
                className="bubble-input"
                style={{marginTop: '10px', marginBottom: '20px', marginLeft: '10px'}}
                type="password"
                placeholder="Confirm New Password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
            />

            <button className="button" style={{marginTop: '10px', marginBottom: '20px'}} type="submit" onClick={handleChangePassword}>Update Password</button>
            {error && <p style={{ color: 'gray' }}>{error}</p>}
            {msg && <p style={{ color: 'gray' }}>{msg}</p>}
        </>


    );
}

export default ChangePasswordForm;