import React, { useState, useRef } from "react";
import playIcon from "../assets/icons/play_circle_pink.svg";
import pauseIcon from "../assets/icons/pause_circle_pink.svg";

if (!window.activeAudio) {
  window.activeAudio = null;
}

const StoryAudioButton = ({storyText, storyId, apiBaseURL, voiceId, voiceSpeed}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const audioRef = useRef(null);
    const [errMsg, setErrMsg] = useState('');

    const handlePlayPause = async () => {
        setErrMsg('');
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
                const audioUrl = `${apiBaseURL}/api/v1/narrate_hume?text=${encodeURIComponent(storyText)}&story_id=${storyId}&voice_id=${voiceId}&voice_speed=${voiceSpeed}`;
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
                        setErrMsg('Could not generate audiobook narration. Please try again later.');
                    });
                }
                window.activeAudio = audioRef.current;

                // Start/resume playing audio
                await audioRef.current.play();
                setIsLoading(false);
                setIsPlaying(true);
            } catch (err) {
                console.error("Narration failed:", err);
                setErrMsg('Could not generate audiobook narration. Please try again later.');
                setIsLoading(false);
                setIsPlaying(false);
            }
        }
    };

    return (
        <div >
            <button onClick={handlePlayPause} className="button-gray" style={{paddingBottom: '4px', paddingTop: '4px', marginRight: '0px'}}>
                
                {isLoading ? (
                    <div className="loading-spinner small"></div>
                ) : (
                    <div className="audio-button-content">
                    <img
                        src={isPlaying ? pauseIcon : playIcon}
                        style={{height: 30}}
                        alt={isPlaying ? "Pause" : "Play"}
                    />
                    </div>
                )}
                
            </button>
            {errMsg && (
                <span
                    style={{
                    color: '#8e5656ff',
                    fontSize: '0.9em',
                    textIndent: '0em',
                    marginLeft: '10px',
                    verticalAlign: 'middle',     // aligns vertically with the button
                    lineHeight: '1',             // prevents extra top padding
                    display: 'inline-block',     // removes inherited paragraph spacing
                    }}
                >
                    {errMsg}
                </span>
            )}
        </div>
    );
};
export default StoryAudioButton;