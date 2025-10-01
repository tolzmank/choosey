import React, { useEffect } from 'react';

function SuccessPage() {
  useEffect(() => {
    const handleRedirect = () => {
      const redirectPath = localStorage.getItem('postSignupRedirect') || "/my_stories";
      localStorage.removeItem('postSignupRedirect');
      window.location.href = redirectPath;
    };
    const timer = setTimeout(handleRedirect, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="signup-container">
      <h2>Subscription successful! Welcome to Choosey Unlimited.</h2>
    </div>
  );
}

export default SuccessPage;