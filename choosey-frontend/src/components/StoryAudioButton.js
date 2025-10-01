import React, { useState, useRef } from "react";
import playIcon from "../assets/icons/play_circle_pink.svg";
import pauseIcon from "../assets/icons/pause_circle_pink.svg";

let activeAudio = null;

const StoryAudioButton = ({storyText, apiBaseURL}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);

    const handlePlayPause = async () => {
        if (isPlaying) {
            if (audioRef.current) {
                audioRef.current.pause();
                // Do NOT null out audioRef.current; allow resume.
            }
            setIsPlaying(false);
        } else {
            if (activeAudio && activeAudio !== audioRef.current) {
                activeAudio.pause();
            }

            // Stream narration audio directly from backend
            const url = `${apiBaseURL}/api/v1/narrate?text=${encodeURIComponent(storyText)}&voice_id=JBFqnCBsd6RMkjVDRZzb`;
            try {
                const res = await fetch(url, {method: "HEAD"});
                if (!res.ok) {
                    alert("Narration unavailable. Please try again later.");
                    return;
                }
                // Only create a new Audio instance if not already present
                if (!audioRef.current) {
                    audioRef.current = new Audio(url);
                    audioRef.current.crossOrigin = 'anonymous';

                    // Reset button back when playback finishes
                    audioRef.current.addEventListener('ended', () => {
                        setIsPlaying(false);
                        if (activeAudio === audioRef.current) {
                            activeAudio = null;
                        }
                        audioRef.current = null;
                    });

                    // Handle playback errors
                    audioRef.current.addEventListener("error", (e) => {
                        console.error("Audio playback error:", e);
                        setIsPlaying(false);
                        if (activeAudio === audioRef.current) {
                            activeAudio = null;
                        }
                        audioRef.current = null;
                        alert('Narration failed. Please try again.')
                    });
                }
                activeAudio = audioRef.current;

                // Start/resume playing audio
                await audioRef.current.play();
                setIsPlaying(true);
            } catch (err) {
                console.error("Narration failed:", err);
                alert("Narration unavailable. Please try again later.");
                setIsPlaying(false);
            }
        }
    };

    return (
        <button onClick={handlePlayPause} className="button-gray" style={{paddingBottom: '0px', paddingTop: '4px'}}>
            <img
                src={isPlaying ? pauseIcon : playIcon}
                style={{height: 30}}
                alt={isPlaying ? "Pause narration" : "Play narration"}
            />
        </button>
    );
};
export default StoryAudioButton;