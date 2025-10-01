// src/components/AgeCheckModal.js
import React from "react";

function AgeCheckModal({ onConfirm, onCancel, showProfileMessage }) {
  if (!onConfirm && !onCancel) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" >
        <h4>Are you 18 years of age or older?</h4>
        <div style={{ marginTop: "20px" }}>
          <button className="button-gray" style={{ color: "#aaa", marginRight: '15px' }} onClick={onCancel}>
            No
          </button>
          <button className="button" onClick={onConfirm}>
            Yes
          </button>
        </div>
        {showProfileMessage && (
          <div style={{ marginTop: "15px" }}>
            <p style={{ fontSize: "0.9em" }}>
              To get rid of this message in the future, please update your account info with your birthdate.
            </p>
            <button className="button" style={{ display: "inline-block" }} onClick={() => { window.location.href = "/account_page"; }}>
              Go to Account Page
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgeCheckModal;