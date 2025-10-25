import React, { useRef, useState } from "react";

const MiniAudiobookBar = ({ 
    setShowAudioBar,
    abUrl,
    audioRef,
    isPlaying, setIsPlaying,
    currentStoryTitle
 }) => {
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

    // Allow drag down of 15 and up of 150
    if (deltaY < 15) {
      e.currentTarget.style.transform = `translateY(${Math.max(deltaY, -150)}px)`;
      //e.currentTarget.style.opacity = `${Math.max(0.4, 1 + deltaY / 200)}`;
    }
  };

  const handleTouchEnd = (e) => {
    if (!isDragging) return;
    setIsDragging(false);

    const deltaY = ((currentYRef.current ?? startYRef.current) - (startYRef.current ?? 0));
    // console.log('')
    // console.log('MINI TOUCH END:')
    // console.log('currentYRef:', currentYRef.current)
    // console.log('startYRef:', startYRef.current)
    // console.log('deltaY:', deltaY)
    e.currentTarget.style.transform = "";
    e.currentTarget.style.opacity = "";

    // If swipe is large enough upward → show full player
    if (deltaY < -80) {
      setShowAudioBar(true);
    }
  };

  return (
    <div className="mini-audio-controls"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
    >
        
        <div className="button-menu-gray" style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "62px", marginRight: '5px' }}>
            <img src="/icons/drag_bar.svg" alt="Expand Audio Player" className="icon-mobile drag-handle" style={{ width: "25px", marginBottom: '5px', marginTop: '-5px' }} />
            {/* Play / Pause Circle */}
            <button
                onClick={() => {
                    if (abUrl) {
                        if (audioRef?.current) {
                            if (isPlaying) {
                                audioRef.current.pause();
                                setIsPlaying(false);
                            } else {
                                audioRef.current.play();
                                setIsPlaying(true);
                            }
                        }
                    } else {
                        setShowAudioBar(true);
                    }
                }}
                className="menu-icon drag-handle"
                title={isPlaying ? "Pause" : "Play"}
                style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                }}
            >
                <img className="drag-handle"
                    src={isPlaying ? "/icons/pause_circle_pink.svg" : "/icons/play_circle_pink.svg"}
                    alt={isPlaying ? "Pause" : "Play"}
                />
            </button>

            {/* Show full audio player button */}
            <button
                onClick={() => setShowAudioBar(true)}
                className="show-audio-btn drag-handle"
                title="Show Audio Player"
                style={{
                background: "#484848",
                border: "none",
                borderRadius: '5px',
                cursor: "pointer",
                padding: 0,
                marginTop: '23px',
                opacity: 0.8,
                transition: "opacity 0.2s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.5)}
            >
                <div className='marquee-container drag-handle'>
                    <span className='marquee-text' style={{color: '#e8e8e8ff'}}>{currentStoryTitle}</span>
                </div>
                
            </button>
        </div>
    </div>

  );
};

export default MiniAudiobookBar;