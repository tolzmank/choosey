import React, { useEffect } from 'react';

function CancelPage() {
  useEffect(() => {
    const redirectPath = localStorage.getItem('postSignupRedirect') || "/create_story";
    window.location.href = redirectPath;
  }, []);

  return <p>Payment unsuccessful. Redirecting back…</p>;
}

export default CancelPage;