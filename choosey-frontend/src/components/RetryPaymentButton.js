import React, { useState, useRef } from 'react';
import axios from 'axios';
import { auth } from '../firebase';

function RetryPaymentButton({ apiBaseURL }) {
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRetryPayment = async () => {
    setErrMsg('');
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 10000);
    try {
      const user = auth.currentUser;
      if (!user) {
        setErrMsg("You must be logged in to retry payment.");
        return;
      }
      const idToken = await user.getIdToken();

      // Save current location so cancel/success knows where to go back
      localStorage.setItem("postSignupRedirect", window.location.pathname);

      const res = await axios.post(
        `${apiBaseURL}/api/v1/create_checkout_session`,
        {
          uid: user.uid,
          success_url: `${window.location.origin}/success`,
          cancel_url: `${window.location.origin}/cancel`
        },
        { headers: { Authorization: `Bearer ${idToken}` } }
      );

      if (res.data.url) {
        clearTimeout(timeout);
        window.location.href = res.data.url; // redirect to Stripe Checkout
      }
    } catch (err) {
      clearTimeout(timeout);
      console.error("Error retrying payment:", err);
      setErrMsg("Could not start payment. Please try again.");

    }
  };

  return (
    <>
      {loading && (
        <div className="modal-loading-overlay" style={{}}>
          <div className="loading-spinner"></div>
          <p>Connecting to Stripe Payment...</p>
        </div>
      )}
      <button className="button" style={{ marginBottom: '30px', marginTop: '0px' }} onClick={handleRetryPayment}>
        Go to Payment
      </button>
      {errMsg && (
        <span style={{color: '#8e5656ff', maxWidth: '300px'}}>{errMsg}</span>
      )}
    </>
  );
}

export default RetryPaymentButton;