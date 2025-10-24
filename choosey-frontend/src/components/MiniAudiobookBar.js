import React, { useRef, useState } from "react";

const MiniAudiobookBar = ({ setShowAudioBar }) => {
  const startYRef = useRef(null);
  const currentYRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleTouchStart = (e) => {
    startYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    currentYRef.current = e.touches[0].clientY;
    const deltaY = currentYRef.current - startYRef.current;

    // Only respond to upward drags
    if (deltaY < 0) {
      e.currentTarget.style.transform = `translateY(${Math.max(deltaY, -150)}px)`;
      e.currentTarget.style.opacity = `${Math.max(0.4, 1 + deltaY / 200)}`;
    }
  };

  const handleTouchEnd = (e) => {
    setIsDragging(false);
    const deltaY = (currentYRef.current || 0) - (startYRef.current || 0);

    e.currentTarget.style.transform = "";
    e.currentTarget.style.opacity = "";

    // If swipe is large enough upward → show full player
    if (deltaY < -80) {
      setShowAudioBar(true);
    }
  };

  return (
    <div
      className="mini-audio-bar"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "fixed",
        bottom: "0",
        left: "0",
        right: "0",
        height: "60px",
        background: "rgba(28,28,28,0.9)",
        borderTop: "1px solid rgba(255,255,255,0.15)",
        borderTopLeftRadius: "20px",
        borderTopRightRadius: "20px",
        transition: "transform 0.25s ease, opacity 0.25s ease",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        touchAction: "none", // prevent scrolling interference
      }}
    >
      <img
        src="/icons/drag_bar.svg"
        alt="Expand Audio Player"
        style={{ width: "40px", marginTop: "-5px" }}
      />
      {/* optional: show current track title, progress, etc. */}
    </div>
  );
};

export default MiniAudiobookBar;