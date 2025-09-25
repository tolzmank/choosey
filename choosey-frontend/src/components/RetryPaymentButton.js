import React from 'react';
import axios from 'axios';
import { auth } from '../firebase';

function RetryPaymentButton({ apiBaseURL }) {
  const handleRetryPayment = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        alert("You must be logged in to retry payment.");
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
        window.location.href = res.data.url; // redirect to Stripe Checkout
      }
    } catch (err) {
      console.error("Error retrying payment:", err);
      alert("Could not start payment. Please try again.");
    }
  };

  return (
    <button className="button" style={{ marginBottom: '30px', marginTop: '0px' }} onClick={handleRetryPayment}>
      Go to Payment
    </button>
  );
}

export default RetryPaymentButton;