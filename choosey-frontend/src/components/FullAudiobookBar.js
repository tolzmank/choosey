import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import playIconWhite from "../assets/icons/play_circle_white.svg";
import playIcon from "../assets/icons/play_circle_pink.svg";
import pauseIcon from "../assets/icons/pause_circle_pink.svg";
import replayIcon from "../assets/icons/replay_10_pink.svg";
import forwardIcon from "../assets/icons/forward_10_pink.svg";

const FullAudiobookBar = ({ apiBaseURL, id, userProfile, isFullAudiobookMode, getAuthHeaders, darkMode }) => {
    const [abUrl, setAbUrl] = useState(null);
    const [abProgress, setAbProgress] = useState(0);
    const [abLoading, setAbLoading] = useState(false);
    const audioRef = useRef(null);
    const saveDebounceRef = useRef(0);

    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);

    const fetchAudiobook = async () => {
        if (!isFullAudiobookMode) return;
        try {
        const headers = await getAuthHeaders();
        const res = await axios.get(`${apiBaseURL}/api/v1/get_audiobook/${id}`, { headers });
        if (res.data?.audiobook_url) {
            setAbUrl(res.data.audiobook_url);
            setAbProgress(res.data.audiobook_progress || 0);
        } else {
            setAbUrl(null);
        }
        } catch (e) {
        console.error("❌ Error fetching audiobook:", e);
        setAbUrl(null);
        }
    };

    const generateAudiobook = async () => {
        try {
        setAbLoading(true);
        const headers = await getAuthHeaders();
        await axios.post(
            `${apiBaseURL}/api/v1/generate_audiobook/${id}`,
            {
            voice_id: userProfile?.voice_id,
            voice_speed: userProfile?.voice_speed || 1.0,
            },
            { headers }
        );
        await fetchAudiobook();
        } catch (e) {
        console.error("❌ Error generating audiobook:", e);
        alert("We couldn't generate the audiobook yet. Please try again in a moment.");
        } finally {
        setAbLoading(false);
        }
    };

    const saveProgress = async (seconds) => {
        const now = Date.now();
        if (now - (saveDebounceRef.current || 0) < 5000) return;
        saveDebounceRef.current = now;

        try {
        const headers = await getAuthHeaders();
        const progress = Math.max(0, Math.floor(seconds));
        localStorage.setItem(`abp_${id}`, String(progress));
        await axios.post(
            `${apiBaseURL}/api/v1/update_audiobook_progress`,
            { story_id: Number(id), progress_in_seconds: progress },
            { headers }
        );
        } catch (e) {
        console.warn("⚠️ Failed to persist audiobook progress:", e);
        }
    };

    // load + metadata
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio && abProgress > 0) {
            audio.currentTime = abProgress;
            setProgress(abProgress);
        }

    const handleTime = () => {
        setProgress(audio.currentTime || 0);
        };
        const handleMeta = () => setDuration(audio.duration || 0);

        audio.addEventListener("timeupdate", handleTime);
        audio.addEventListener("loadedmetadata", handleMeta);
        audio.addEventListener("loadeddata", handleMeta);

        // Periodically sync to backend
        const interval = setInterval(() => {
            if (isPlaying && audio.currentTime > 0) {
            saveProgress(audio.currentTime);
            }
        }, 10000); // every 10 seconds

        return () => {
            audio.removeEventListener("timeupdate", handleTime);
            audio.removeEventListener("loadedmetadata", handleMeta);
            audio.removeEventListener("loadeddata", handleMeta);
            clearInterval(interval);
        };
        }, [abUrl, isPlaying]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
        audio.pause();
        } else {
        audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e) => {
        const time = e.target.value;
        audioRef.current.currentTime = time;
        setProgress(time);
    };
    
    const skipForward = () => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = Math.min(audio.currentTime + 10, duration); // skip ahead 10s
        setProgress(audio.currentTime);
    };

    const skipBackward = () => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = Math.max(audio.currentTime - 10, 0); // skip back 10s
        setProgress(audio.currentTime);
    };

    const formatTime = (t) => {
        if (!t || isNaN(t)) return "0:00";
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    useEffect(() => {
        if (isFullAudiobookMode) {
        fetchAudiobook();
        } else {
        setAbUrl(null);
        }
    }, [isFullAudiobookMode, id, userProfile]);

    if (!isFullAudiobookMode) return null;

    return (
        <div
            className="full-audio-bar"
            style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                width: "calc(100% - 40px)",
                margin: "0 auto",
                background: darkMode
                    ? "rgba(28,28,28,0.9)"
                    : "rgba(240,240,240,0.9)",
                color: darkMode ? "#fff" : "#000",
                borderTopLeftRadius: '20px',
                borderTopRightRadius: '20px',
                borderBottomLeftRadius: '0px',
                borderBottomRightRadius: '0px',
                padding: "10px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                backdropFilter: "blur(1px)",
                WebkitBackdropFilter: "blur(1px)",
            }}
        >
            
        {abUrl ? (
            <>
                <audio ref={audioRef} src={abUrl} preload="metadata" />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1, gap: "16px"}}>
                    {/* Skip Backward */}
                    <button onClick={skipBackward} style={{background: "transparent", border: "none", cursor: "pointer", padding: 0, opacity: 1, transition: "opacity 0.2s ease"}} onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.7)} onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}>
                        <img src={replayIcon} alt="<" style={{height: 28}}/>
                    </button>

                    {/* Play / Pause button */}
                    <button onClick={togglePlay} style={{background: "transparent", border: "none", cursor: "pointer", padding: 0, opacity: 1, transition: "opacity 0.2s ease"}} onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.7)} onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}>
                        <img src={isPlaying ? pauseIcon : playIcon} alt="Play" style={{height: 60}}/>
                    </button>

                    {/* Skip Forward */}
                    <button onClick={skipForward} style={{background: "transparent", border: "none", cursor: "pointer", padding: 0, opacity: 1, transition: "opacity 0.2s ease"}} onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.7)} onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}>
                        <img src={forwardIcon} alt=">" style={{height: 28}}/>
                    </button>

                    {/* Progress bar */}
                    <input type="range"
                        min="0"
                        max={duration || 0}
                        value={progress}
                        onChange={handleSeek}
                        style={{
                        flex: 1,
                        accentColor: "#FF4F81"
                        }}
                    />

                    {/* Timestamp */}
                    <div style={{ fontSize: "0.9rem", minWidth: 60, textAlign: "right" }}>
                        {formatTime(progress)} / {formatTime(duration)}
                    </div>
                </div>
             </>




        ) : (
          <button className="button" disabled={abLoading} onClick={generateAudiobook} style={{
                width: 260,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",          // space between icon and text
                paddingBottom: '4px', 
                paddingTop: '4px'
            }}>
            
            {abLoading ? (
                <>
                    <div className="loading-spinner small_white"></div>
                    Generating...
                </>
                ) : (
                    <>
                    <img src={playIconWhite} style={{height: '30px', verticalAlign: "middle"}}/>
                    Generate Full Audiobook
                    </>
                    )}
          </button>
        )}
      </div>
  );
};

export default FullAudiobookBar;