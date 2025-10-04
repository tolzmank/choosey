import React, { useState, useRef } from "react";
import playIcon from "../assets/icons/play_circle_pink.svg";
import pauseIcon from "../assets/icons/pause_circle_pink.svg";

if (!window.activeAudio) {
  window.activeAudio = null;
}

const StoryAudioButton = ({storyText, apiBaseURL, voiceId, voiceSpeed}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const audioRef = useRef(null);

    const handlePlayPause = async () => {
        if (isPlaying) {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            setIsPlaying(false);
        } else {
            setIsLoading(true);
            if (window.activeAudio && window.activeAudio !== audioRef.current) {
                window.activeAudio.pause();
            }

            try {
                // Stream narration audio directly from backend
                const audioUrl = `${apiBaseURL}/api/v1/narrate_hume?text=${encodeURIComponent(storyText)}&voice_id=${voiceId}&voice_speed=${voiceSpeed}`;
                // Only create a new Audio instance if not already present
                if (!audioRef.current) {
                    audioRef.current = new Audio(audioUrl);
                    audioRef.current.crossOrigin = 'anonymous';

                    // Reset button back when playback finishes
                    audioRef.current.addEventListener('ended', () => {
                        setIsPlaying(false);
                        if (window.activeAudio === audioRef.current) {
                            window.activeAudio = null;
                        }
                        audioRef.current = null;
                    });

                    // Handle playback errors
                    audioRef.current.addEventListener("error", (e) => {
                        console.error("Audio playback error:", e);
                        setIsPlaying(false);
                        setIsLoading(false);
                        if (window.activeAudio === audioRef.current) {
                            window.activeAudio = null;
                        }
                        audioRef.current = null;
                        alert('Narration failed. Please try again.')
                    });
                }
                window.activeAudio = audioRef.current;

                // Start/resume playing audio
                await audioRef.current.play();
                setIsLoading(false);
                setIsPlaying(true);
            } catch (err) {
                console.error("Narration failed:", err);
                alert("Narration unavailable. Please try again later.");
                setIsLoading(false);
                setIsPlaying(false);
            }
        }
    };

    return (
        <button onClick={handlePlayPause} className="button-gray" style={{paddingBottom: '4px', paddingTop: '4px'}}>
            
            {isLoading ? (
                <div className="loading-spinner small"></div>
            ) : (
                <div className="audio-button-content">
                <img
                    src={isPlaying ? pauseIcon : playIcon}
                    style={{height: 30}}
                    alt={isPlaying ? "Pause narration" : "Play narration"}
                />
                </div>
            )}
            
        </button>
    );
};
export default StoryAudioButton;