// src/components/Header.js
import React from 'react';

function Header() {
  return (
    <div className="head-container" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <img src="/images/lady_choosey.png" alt="Lady Choosey" style={{ height: '100%', maxHeight: '150px', borderTopLeftRadius: '20px', borderBottomLeftRadius: '20px' }} />
      <div>
        <h1 style={{fontSize: '4em'}}>Choosey</h1>
        <h2>Whatever you want...</h2>
      </div>
    </div>
  );
}

export default Header;