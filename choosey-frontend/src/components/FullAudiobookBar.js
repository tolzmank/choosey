import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import playIconWhite from "../assets/icons/play_circle_white.svg";
import playIcon from "../assets/icons/play_circle_pink.svg";
import pauseIcon from "../assets/icons/pause_circle_pink.svg";
import replayIcon from "../assets/icons/replay_10_pink.svg";
import forwardIcon from "../assets/icons/forward_10_pink.svg";

const FullAudiobookBar = ({ 
    apiBaseURL, 
    id, 
    userProfile, 
    isFullAudiobookMode, 
    getAuthHeaders, darkMode, 
    showAudioBar, setShowAudioBar, 
    setGlobalIsPlaying, 
    setGlobalAudioRef,
    currentStoryTitle, setCurrentStoryTitle,
    abUrl, setAbUrl

}) => {

    //const [abUrl, setAbUrl] = useState(null);
    const [abProgress, setAbProgress] = useState(0);
    const [abLoading, setAbLoading] = useState(false);

    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const saveDebounceRef = useRef(0);
    const [errMsg, setErrMsg] = useState('');

    const startYRef = useRef(null);
    const currentYRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const touchSpot = useRef(null);

    useEffect(() => {
        if (setGlobalAudioRef) setGlobalAudioRef(audioRef);
    }, [audioRef, setGlobalAudioRef]);

    useEffect(() => {
        if (setGlobalIsPlaying) setGlobalIsPlaying(isPlaying);
    }, [isPlaying, setGlobalIsPlaying]);

    const handleTouchStart = (e) => {
        // Ignore if touch started on a control (button, input, slider)
        const tag = e.target.tagName.toLowerCase();
        const isDragHandle = e.target.classList.contains('drag-handle');
        touchSpot.current = tag;
        if (!isDragHandle && ['button', 'input', 'img'].includes(tag)) return;

        startYRef.current = e.touches[0].clientY;
        setIsDragging(true);
    };

    const handleTouchMove = (e) => {
        if (!isDragging) return;
        //const tag = e.target.tagName.toLowerCase();
        const isDragHandle = e.target.classList.contains('drag-handle');
        if (!isDragHandle && ['button', 'input', 'img'].includes(touchSpot.current)) return;

        currentYRef.current = e.touches[0].clientY;
        const deltaY = currentYRef.current - startYRef.current;
    
        // only drag downwards
        if (deltaY > -20) {
            // Apply a translation so the bar follows your finger
            e.currentTarget.style.transform = `translateY(${Math.min(deltaY, 150)}px)`;
            //e.currentTarget.style.opacity = `${Math.max(0.3, 1 - deltaY / 200)}`;
        }
    };

    const handleTouchEnd = (e) => {
        if (!isDragging) return;
        //const tag = e.target.tagName.toLowerCase();
        const isDragHandle = e.target.classList.contains('drag-handle');
        if (!isDragHandle && ['button', 'input', 'img'].includes(touchSpot.current)) return;

        setIsDragging(false);
        const deltaY = ((currentYRef.current ?? startYRef.current) - (startYRef.current ?? 0));
        // console.log('')
        // console.log('FULL TOUCH END:')
        // console.log('currentYRef:', currentYRef.current)
        // console.log('startYRef:', startYRef.current)
        // console.log('deltaY:', deltaY)
        // Reset styles
        e.currentTarget.style.transform = "";
        e.currentTarget.style.opacity = "";

        // If swipe down enough → hide the bar
        if (deltaY > 80) {
            setShowAudioBar(false);
        }
        touchSpot.current = null;
    };

    const fetchAudiobook = async () => {
        if (!isFullAudiobookMode) return;
        try {
            const headers = await getAuthHeaders();
            const res = await axios.get(`${apiBaseURL}/api/v1/get_audiobook/${id}`, { headers });
            if (res.data?.audiobook_url) {
                setAbUrl(res.data.audiobook_url);
                // Retrieve backend and localStorage progress
                const backendProgress = Number(res.data.audiobook_progress || 0);
                const backendUpdated = new Date(res.data.audiobook_last_modified || 0).getTime();

                const localProgress = Number(localStorage.getItem(`abp_${id}`)) || 0;
                const localUpdated = Number(localStorage.getItem(`abp_${id}_ts`)) || 0;

                let effectiveProgress = localProgress;
                if (backendUpdated > localUpdated) {
                    localStorage.setItem(`abp_${id}`, String(backendProgress));
                    localStorage.setItem(`abp_${id}_ts`, String(backendUpdated));
                    effectiveProgress = backendProgress;
                } else {
                    effectiveProgress = localProgress
                }
                setAbProgress(effectiveProgress);
                setCurrentStoryTitle(res.data.title || '');
            } else {
                setAbUrl(null);
            }
        } catch (e) {
            console.error("❌ Error fetching audiobook:", e);
            setAbUrl(null);
        }
    };

    const generateAudiobook = async () => {
        setErrMsg('');
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
            setErrMsg('Could not generate audiobook narration. Please try again later.');
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
            localStorage.setItem(`abp_${id}_ts`, String(Date.now()));
            await axios.post(
                `${apiBaseURL}/api/v1/update_audiobook_progress`,
                { story_id: Number(id), progress_in_seconds: progress },
                { headers }
            );
        } catch (e) {
            console.warn("⚠️ Failed to persist audiobook progress:", e);
        }
    };

    useEffect(() => {
        const handleBeforeUnload = () => {
            const current = audioRef.current?.currentTime || 0;
            saveProgress(current);
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    // load + metadata
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio && abProgress > 0 && !audio._hasSetInitialTime) {
            audio.currentTime = abProgress;
            setProgress(abProgress);
            audio._hasSetInitialTime = true; // flag to prevent resetting
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

    // const togglePlay = async () => {
    //     const audio = audioRef.current;
    //     if (!audio) return;
    //     if (isPlaying) {
    //         audio.pause();
    //         if (audio.currentTime > 0) {
    //             saveProgress(audio.currentTime);
    //         }
    //     } else {
    //         try {
    //             await audio.play();
    //         } catch(err) {
    //             console.warn("playback blocked - waiting for user gesture", err);
    //         }
            
    //     }
    //     setIsPlaying(!isPlaying);
    // };

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
            className={`full-audio-bar ${showAudioBar ? "visible" : "hidden"}`} 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <button
                onClick={() => setShowAudioBar(false)}
                className="button-menu-gray drag-handle"
                style={{
                position: "absolute",
                top: "0px",
                right: "12px",
                padding: '0px',
                border: "none",
                cursor: "pointer",
                opacity: 0.7
                }}
            >
                <img src="/icons/down_arrow_gray.svg" alt="Hide Audio Bar" className="icon-mobile drag-handle" style={{ height: 30 }} />
                <img src="/icons/collapse_gray.svg" alt="Hide Audio Bar" className="icon-desktop" style={{ height: 30 }} />
            </button>

        {abUrl ? (
            <>
                <audio
                    ref={audioRef}
                    src={abUrl}
                    preload="metadata"
                    playsInline
                    style={{ display: "none" }}
                    onLoadedMetadata={() => {
                        const audio = audioRef.current;
                        const saved = Number(localStorage.getItem(`abp_${id}`)) || 0;
                        if (audio && saved > 0) {
                            // wait a bit before seeking — fixes iOS timing issue
                            setTimeout(() => {
                                try {
                                    audio.currentTime = saved;
                                    setProgress(saved);
                                } catch (err) {
                                    console.warn("⚠️ Couldn't restore position yet:", err);
                                }
                            }, 300);
                        }
                    }}
                    onPlay={() => {
                        const audio = audioRef.current;
                        const saved = Number(localStorage.getItem(`abp_${id}`)) || 0;
                        if (audio && saved > 0 && Math.abs(audio.currentTime - saved) > 2) {
                            // if playing from start, restore again right after user-triggered play
                            setTimeout(() => {
                                audio.currentTime = saved;
                                setProgress(saved);
                            }, 300);
                        }
                    }}
                    onTimeUpdate={(e) => {
                        const current = e.target.currentTime;
                        localStorage.setItem(`abp_${id}`, String(Math.floor(current)));
                    }}
                />

                <img src="/icons/drag_bar.svg" alt="Hide Audio Bar" className="icon-mobile drag-handle" style={{ width: '40px', marginTop: '-3px', marginBottom: '15px' }} />
                <span className="audiobook-title">{currentStoryTitle}</span>

                <div className="audio-progress-time-container">
                    {/* Progress bar */}
                    <input
                        className="audio-progress"
                        type="range"
                        min="0"
                        max={duration || 0}
                        value={progress}
                        onChange={handleSeek}
                    />
                    {/* Timestamp */}
                    <div className="audio-timestamp">
                        <span className="time current-time">{formatTime(progress)}</span>
                        <span className="time total-time">{formatTime(duration)}</span>
                    </div>
                </div>

                <div className="audio-play-pause-skip-container">
                    {/* Skip Backward */}
                    <button onClick={skipBackward} style={{background: "transparent", border: "none", cursor: "pointer", padding: 0, opacity: 1, transition: "opacity 0.2s ease"}} onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.7)} onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}>
                        <img src={replayIcon} alt="<" style={{height: 28}}/>
                    </button>

                    {/* Play / Pause button */}
                    <button 
                        onClick={() => {
                            const audio = audioRef.current;
                            if (!audio) return;
                            if (isPlaying) {
                                audio.pause();
                                if (audio.currentTime > 0) {
                                    saveProgress(audio.currentTime);
                                }
                            } else {
                                audio.play().then(() => setIsPlaying(true)).catch(err => {
                                console.warn("iOS play blocked:", err);
                                }); 
                            }
                            setIsPlaying(!isPlaying);
                        }}
                        style={{background: "transparent", border: "none", cursor: "pointer", padding: 0, opacity: 1, transition: "opacity 0.2s ease"}} onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.7)} onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}>
                        <img src={isPlaying ? pauseIcon : playIcon} alt="Play" style={{height: 60}}/>
                    </button>

                    {/* Skip Forward */}
                    <button onClick={skipForward} style={{background: "transparent", border: "none", cursor: "pointer", padding: 0, opacity: 1, transition: "opacity 0.2s ease"}} onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.7)} onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}>
                        <img src={forwardIcon} alt=">" style={{height: 28}}/>
                    </button>
                </div>
   
             </>

        ) : (
            <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
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
                {errMsg && (
                    <span style={{color: '#8e5656ff', maxWidth: '300px'}}>{errMsg}</span>
                )}
            </div>
            )}
        </div>
  );
};

export default FullAudiobookBar;