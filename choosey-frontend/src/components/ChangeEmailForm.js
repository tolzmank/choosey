import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { auth } from '../firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail, sendEmailVerification, verifyBeforeUpdateEmail, signInWithEmailAndPassword } from 'firebase/auth';

function ChangeEmailForm({ currentUser, apiBaseURL}) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [polling, setPolling] = useState(null);

    const handleChangeEmail = async (e) => {
        const user = auth.currentUser;
        console.log('original user email: ', user.email);
        console.log('  changing email to:', newEmail);

        try {
            // Reauthenticate
            const credential = EmailAuthProvider.credential(
                user.email,
                currentPassword
            );
            const userCred = await reauthenticateWithCredential(user, credential);

            // Update Firebase Auth email
            await verifyBeforeUpdateEmail(userCred.user, newEmail);
            setMsg("Verification email sent to your new email address. Please check your inbox to complete the change. Page will reload once verified.");

            // Start polling to check if user has verified email
            const intervalId = setInterval(async () => {
                try {
                    // Check for auth failure, means the email has changed and Firebase revokes token
                    await auth.currentUser.reload();
                    console.log('waiting for verification...')
                    setMsg('Waiting for verification...')
                } catch (err) {
                    if (err?.code === "auth/user-token-expired") {
                        // Stop polling
                        clearInterval(intervalId);
                        setPolling(null);
                        console.log('new email verification link clicked');
                        console.log('old email token revoked');
                        
                        // Reauthenticate after verification to refresh session
                        await signInWithEmailAndPassword(auth, newEmail, currentPassword);
                        await auth.currentUser.reload();
                        console.log('signed in again with new email', auth.currentUser.email)

                        // Update in Datastore
                        const idToken = await auth.currentUser.getIdToken();
                        console.log('received new token');
                        await axios.put(`${apiBaseURL}/api/v1/update_account`,
                            { email: auth.currentUser.email },
                            { headers: { Authorization: `Bearer ${idToken}` } }
                        );
                        console.log('email updated in datastore to:', auth.currentUser.email);
                        console.log('Checked if logged in with newEmail')
                        if (auth.currentUser.email === newEmail) {
                            localStorage.setItem('emailChangeMsg', "Email updated successfully!");
                            console.log('set localstorage success message')
                            setError("");
                            localStorage.setItem('openLoginInfoModal', 'true');
                            window.location.reload();
                            
                        } else {
                            localStorage.setItem('emailChangeMsg', "Email update failed. Please try again later.");
                            console.log('email update failed')
                        }
                    } else {
                        console.error("Unexpected reload error:", err);
                        clearInterval(intervalId);
                        setPolling(null);
                    }
                
                }
            }, 3000);
            setPolling(intervalId);

        } catch (err) {
            console.error(err);
            if (err.message === 'Firebase: Error (auth/invalid-credential).') {
                setError("Incorrect current password.")
            } else {
                setError(err.message || "Failed to update email.")
            }
        }
    };
    
    useEffect(() => {
        return () => {
            if (polling) clearInterval(polling);
        };
    }, [polling]);

    useEffect(() => {
        const storedMsg = localStorage.getItem('emailChangeMsg');
        if (storedMsg) {
            setMsg(storedMsg);
            localStorage.removeItem('emailChangeMsg');
        }
    }, []);

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

            <label>New Email</label>
            <input
                className="bubble-input"
                style={{marginTop: '10px', marginBottom: '20px', marginLeft: '10px'}}
                type="email"
                placeholder='New Email'
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
            />
            <button className="button" style={{marginTop: '10px', marginBottom: '20px'}} type="submit" onClick={handleChangeEmail}>Update Email</button>
            {error && <p style={{ color: 'gray' }}>{error}</p>}
            {msg && <p style={{ color: 'gray' }}>{msg}</p>}
        </>
  );
}

export default ChangeEmailForm;