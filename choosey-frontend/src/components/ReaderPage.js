// src/components/ReaderPage.js
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import RetryPaymentButton from './RetryPaymentButton';
import StoryAudioButton from "../components/StoryAudioButton";
import FullAudiobookBar from "../components/FullAudiobookBar";
import StoryInfoModal from './StoryInfoModal';

function ReaderPage({
    currentUser, 
    userProfile, 
    apiBaseURL, 
    darkMode, setDarkMode, 
    onLoginClick, 
    showAudioBar, setShowAudioBar, 
    isPlaying, setIsPlaying, 
    audioRef,
    setCurrentStoryId,
    setIsFullAudioBookMode,
    currentStoryTitle, setCurrentStoryTitle,
}) {
    const location = useLocation();
    const [showRestartConfirm, setShowRestartConfirm] = useState(false);

    const [showInfoModal, setShowInfoModal] = useState(false);
    const [selectedStory, setSelectedStory] = useState(null);

    const { storySet } = location.state || {};
    const { id } = useParams();
    const loadingRef = useRef(null);
    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const scrollToBottom = () => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    };
    const navigate = useNavigate();

    // Text appearance
    const [fontSize, setFontSize] = useState(18);
    const [lineSpacing, setLineSpacing] = useState(1.5);

    // Stop audio if leaving ReaderPage
    useEffect(() => {
        return () => {
            if (window.activeAudio && !window.activeAudio.paused) {
                window.activeAudio.pause();
                window.activeAudio = null;
            }
        };
    }, []);

    // Restore persisted settings on mount
    useEffect(() => {
      const fs = localStorage.getItem('readerFontSize');
      const ls = localStorage.getItem('readerLineSpacing');
      if (fs) setFontSize(parseInt(fs, 10));
      if (ls) setLineSpacing(parseFloat(ls));

      const savedDM = localStorage.getItem('darkMode');
      if (savedDM !== null) {
        setDarkMode(savedDM === 'true');
      }
    }, [setDarkMode]);

    // Persist font size & line spacing when they change
    useEffect(() => {
      localStorage.setItem('readerFontSize', String(fontSize));
    }, [fontSize]);

    useEffect(() => {
      localStorage.setItem('readerLineSpacing', String(lineSpacing));
    }, [lineSpacing]);

    // Persist and sync dark mode with document body class
    useEffect(() => {
      document.body.classList.toggle('light-theme', !darkMode);
      localStorage.setItem('darkMode', String(darkMode));
    }, [darkMode]);

    const increaseFontSize = () => setFontSize((prev) => Math.min(prev + 2, 28));
    const decreaseFontSize = () => setFontSize((prev) => Math.max(prev - 2, 12));
    const increaseLineSpacing = () => setLineSpacing((prev) => Math.min(prev + 0.2, 3));
    const decreaseLineSpacing = () => setLineSpacing((prev) => Math.max(prev - 0.2, 1));
    
    const [localStory, setLocalStory] = useState(storySet);
    const [loading, setLoading] = useState(!storySet);
    // Full audiobook (lay back mode) states
    const [abUrl, setAbUrl] = useState(null);
    const [abProgress, setAbProgress] = useState(0);
    const [abLoading, setAbLoading] = useState(false);
    const audioBarRef = useRef(null);
    const saveDebounceRef = useRef(0);

    const isFullAudiobookMode = localStory?.control === 'full';


    const anonId = localStory?.anon_id || localStorage.getItem('anon_id');

    const lastBlock = localStory?.story?.[localStory?.story.length - 1];

    const getAuthHeaders = async () => {
        const headers = {};

        if (currentUser) {
            const idToken = await currentUser.getIdToken();
            headers["Authorization"] = `Bearer ${idToken}`;
        } else {
            const anonId = localStorage.getItem("anon_id");
            if (anonId) {
                headers["anon_id"] = anonId;
            }
        }

        return headers;
    };



    // Refresh story
    useEffect(() => {
        const fetchStory = async () => {
            try {
                let headers = {};

                if (currentUser) {
                    const idToken = await currentUser.getIdToken();
                    headers.Authorization = `Bearer ${idToken}`;
                } else {
                    const anonId = localStorage.getItem("anon_id");
                    if (anonId) {
                        headers["anon_id"] = anonId;
                    }
                }
                const res = await axios.get(`${apiBaseURL}/api/v1/read_story/${id}`, {headers});

                if (res.data && res.data.story_set) {
                    setLocalStory(res.data.story_set);
                    setCurrentStoryId(res.data.story_set.story_id)
                    setIsFullAudioBookMode(isFullAudiobookMode)
                    setCurrentStoryTitle(res.data.story_set.title)

                    // Restore scroll position
                    const ratio = res.data.scroll_ratio ?? null;
                    const pos = res.data.scroll_position || localStorage.getItem(`scroll_${res.data.story_set.story_id}`);

                    if (ratio !== null) {
                        // Wait for DOM render to complete before scrolling
                        setTimeout(() => {
                            const checkReady = () => {
                            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                            if (docHeight > 0) {
                                const newPos = ratio * docHeight;
                                window.scrollTo({ top: newPos, behavior: 'smooth' });
                            } else {
                                requestAnimationFrame(checkReady);
                            }
                            };
                            requestAnimationFrame(checkReady);
                        }, 300);
                    } else if (pos) {
                        const targetPos = Number(pos);
                        setTimeout(() => {
                            const checkReady = () => {
                            const docHeight = document.documentElement.scrollHeight;
                            if (docHeight > targetPos || docHeight > window.innerHeight + 100) {
                                window.scrollTo({ top: targetPos, behavior: 'smooth' });
                            } else {
                                requestAnimationFrame(checkReady);
                            }
                            };
                            requestAnimationFrame(checkReady);
                        }, 300);
                    }


                } else {
                    console.warn("Story data not found in response");
                }
            } catch (err) {
                console.error("❌ Error fetching story:", err);
            }
        };

        if (id) {
            fetchStory();
        }
    }, [id, currentUser]);

    const handleGoBack = async () => {
        try {
            const headers = await getAuthHeaders();
            const res = await axios.post(`${apiBaseURL}/api/v1/go_back`, {
            story_id: Number(id)
            }, { headers });
            setLocalStory(res.data.story_set);
        } catch (err) {
            console.error("Go Back failed", err);
        }
    };

    const handleStartOver = async () => {
        try {
            const headers = await getAuthHeaders();
            const res = await axios.post(`${apiBaseURL}/api/v1/start_over`, {
            story_id: Number(id)
            }, { headers });
            setLocalStory(res.data.story_set);
        } catch (err) {
            console.error("Start Over failed", err);
        }
    };

    const handleReset = () => {
        if (currentUser && userProfile?.sub_status === 'unlimited') {
            navigate("/my_stories");
        } else {
            navigate("/create_story");
        }
    };

    const handleChoice = async (choice) => {
        // Pause global audiobook if playing
        // if (audioBarRef.current && !audioBarRef.current.paused) {
        //   try { audioBarRef.current.pause(); } catch {}
        // }
        if (!localStory || !localStory.story) return;
        let idToken = null;
        if (currentUser) {
            idToken = await currentUser.getIdToken();
        }
        console.log('USER>>', idToken)
        setLoading(true);
        setTimeout(() => {
            loadingRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
        try {
            const res = await axios.post(`${apiBaseURL}/api/v1/choose_path`, {
                story_id: Number(id),
                decision: choice.decision,
                next: choice.next,
                anon_id: anonId
            },
            { headers: { Authorization: `Bearer ${idToken}` } }
        );
            setLocalStory(res.data.story_set);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!storySet) {
        // Fallback: fetch if needed
        console.log('FALLBACK USED - no user, trying anon_id')
        axios.get(`${apiBaseURL}/api/v1/read_story/${id}?anon_id=${anonId}`)
            .then(res => setLocalStory(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [id, storySet]);

    useEffect(() => {
        const handleScroll = async () => {
            const storyId = Number(id);
            const scrollPosition = window.scrollY;
            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;

            // Save scroll position to local storage immediately (for speed)
            localStorage.setItem(`scroll_${storyId}`, scrollPosition);

            // Throttle updates to backend (every 5 seconds)
            if (saveDebounceRef.current) return;
            saveDebounceRef.current = setTimeout(async () => {
            saveDebounceRef.current = null;
            try {
                const headers = await getAuthHeaders();
                await axios.post(`${apiBaseURL}/api/v1/update_scroll_progress`, {
                story_id: storyId,
                scroll_position: scrollPosition,
                scroll_height: scrollHeight,
                }, { headers });
            } catch (err) {
                console.error("Failed to update scroll progress:", err);
            }
            }, 5000);
        };

        window.addEventListener("scroll", handleScroll);
        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
        };
        }, [id, currentUser]);

    if (loading && !localStory) {
        // Only show the full-page overlay if story hasn't loaded yet
        return (
            <div id="loading-overlay">
                <div className="loading-spinner"></div>
                <p>Creating your story...</p>
            </div>
        );
    }

    if (!localStory) {
    return <p>Error loading story.</p>;
    }

    return (
        <>
        <div className="reader-container">
            <div className="text-controls" id="text-controls">
                <button className='button-gray-trans' onClick={decreaseFontSize}>
                    <img src='/icons/text_size_decrease.svg' alt="Decrease Text Size" style={{height: 20}}></img>
                </button>
                <button className='button-gray-trans' onClick={increaseFontSize}>
                    <img src='/icons/text_size_increase.svg' alt="Increase Text Size" style={{height: 20}}></img>
                </button>

                <button className='button-gray-trans' onClick={decreaseLineSpacing}>
                    <img src="/icons/density_increase.svg" alt="Less Spacing" style={{height: 20}}/>
                </button>
                <button className='button-gray-trans' onClick={increaseLineSpacing}>
                    <img src="/icons/density_decrease.svg" alt="More Spacing" style={{height: 20}}/>
                </button>
                
                <button onClick={() => {
                    setDarkMode(!darkMode);
                    localStorage.setItem("darkMode", !darkMode);
                }}
                className="button-gray-trans"
                >
                    <img
                        src={darkMode ? "/icons/dark_mode.svg" : "/icons/light_mode.svg"}
                        alt="Toggle Theme"
                        className="theme-icon"
                        style={{height: 20}}
                    />
                </button>

                <button className="button-gray-trans" onClick={scrollToTop}>
                    <img src="/icons/scroll_top.svg" alt="Scroll to Top" style={{ height: 20 }} />
                </button>

                <button className="button-gray-trans" onClick={scrollToBottom}>
                    <img src="/icons/scroll_bottom.svg" alt="Scroll to Bottom" style={{ height: 20 }} />
                </button>
            </div>


            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px'}}>
            <button className='button-menu' onClick={() => { setSelectedStory(localStory); setShowInfoModal(true); }} title="Story Info"
                style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center'
                }}
            >
                <img src="/icons/book1.svg" alt="i" style={{ height: '25px' }} />  <p style={{ fontWeight: 700, fontSize: 20, marginLeft: '10px'}}>{localStory?.title}</p>
            </button>

            </div>
            

            {localStory?.story?.map((plotBlock, index) => (
                <div key={index}>
                    <div className='story-text'>
                        <br></br>

                        <div style={{ /*border: '1px solid rgba(255, 119, 160, 01)',*/ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', width: '100%', marginBottom: '10px'}}>
                            <div style={{marginLeft: '50px', zIndex: 10}}>
                                {!isFullAudiobookMode && (
                                    <StoryAudioButton storyText={plotBlock.text} storyId={id} apiBaseURL={apiBaseURL} voiceId={userProfile?.voice_id || "5bb7de05-c8fe-426a-8fcc-ba4fc4ce9f9c"} voiceSpeed={userProfile?.voice_speed || 1.0}/>
                                )} 
                            </div>


                            <p style={{/*border: '1px solid rgba(255, 119, 160, 01)',*/ borderRadius: '20px', zIndex: 1, width: '100%', textAlign: 'center', fontSize: `${fontSize}px`, lineHeight: lineSpacing,  marginLeft: -120, marginTop: 10, marginBottom: 10}}><strong>{index+1}</strong></p>
                        </div>
                        
                        <p style={{fontSize: `${fontSize}px`, lineHeight: lineSpacing,  margin: 10}}>    
                            {plotBlock.text.split(/\n\s*\n/).map((para, j) => (
                                <p key={`${index}-${j}`}>{para.trim()}</p>
                            ))}
                        </p>

                    </div>
                    {index === localStory.story.length - 1 && plotBlock.choices && (
                        <>
                            {plotBlock.choices?.[0]?.decision !== "" ? (
                                <div className="decision-row">
                                    {plotBlock.choices.map((choice, idx) => (
                                        <button key={idx} className="decision-button" style={{fontSize: `${fontSize}px`, lineHeight: lineSpacing}} onClick={() => handleChoice(choice)}>
                                            {choice.decision}
                                        </button>
                                    ))}
                            </div>
                            ) : (
                                <div className="story-end-banner">
                                    <p style={{fontWeight: 700, textAlign: 'center', fontSize: 20 }}>The End</p>
                                </div>
                            )}
                            
                            {loading && (
                                <div className="local-loading" ref={loadingRef}>
                                    <div className="loading-spinner"></div>
                                    <p style={{ color: '#b3b3b3', fontFamily: "'Quicksand', sans-serif" }}>
                                        As you wish. Get Ready for more...
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
                
            ))}
            {!currentUser && (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <button className="button-gray" style={{ backgroundColor: 'transparent', color: '#7f7f7f', paddingLeft: '20px', marginBottom: '10px' }} onClick={onLoginClick} title="Login or create an account to save your stories">
                    Login or create an account to save, listen, and enable custom options for your stories
                </button>
                </div>
            )}
            {currentUser && userProfile?.sub_status !== 'unlimited' &&(
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <p>Complete subscription payment to save, listen, and enable custom options for your stories</p>
                    <RetryPaymentButton apiBaseURL={apiBaseURL} />
                </div>
            )}
        </div>
        <div className="decision-row">
            <button className="button-gray" style={{marginBottom: 100}} onClick={handleGoBack}>
                <img src='/icons/undo.svg' alt="Restart story" style={{height: 40}}></img><br></br>
                Undo Last Decision
            </button>
            <button className="button-gray" style={{marginBottom: 100}} onClick={() => setShowRestartConfirm(true)} >
                <img src='/icons/restart.svg' alt="Restart story" style={{height: 40}}></img><br></br>
                Restart from Beginning
            </button>
            <button className="button-gray" style={{marginBottom: 100}} onClick={handleReset}>
                <img src='/icons/close.svg' alt="Restart story" style={{height: 40}}></img><br></br>
                Close Reader
            </button>
        </div>
        
        {showRestartConfirm && (
            <div className="modal-overlay">
                <div className="modal-content" style={{backgroundColor: '#2f2f2f'}}>
                <h4>Restart Story?</h4>
                <p>This will erase all progress and return you to the very first story block. Are you sure?</p>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px"}}>
                    <button 
                    className="button-gray" 
                    onClick={() => setShowRestartConfirm(false)}
                    >
                    Cancel
                    </button>
                    <button 
                    className="button" 
                    onClick={() => {
                        setShowRestartConfirm(false);
                        handleStartOver();
                    }}
                    >
                    Yes, Restart
                    </button>
                </div>
                </div>
            </div>
            )}
            {!currentUser && (
                <div className="premium-banner">
                    <p>Save all your stories & continue anytime</p>
                    <p>Unlock all story selections</p>
                    <p>Listen to your full stories with audiobook narration</p>
                    <button 
                    className="button" 
                    onClick={() => onLoginClick(true)}
                    >
                    Go Unlimited
                    </button>
                </div>
            )}

            {showInfoModal && (
                <StoryInfoModal
                    storySet={storySet}
                    onClose={() => setShowInfoModal(false)}
                />
            )}

            {currentUser && userProfile?.sub_status !== 'unlimited' && (
                <div className='premium-banner'>
                    <>
                    <p style={{marginTop: '0px'}}>Please complete payment to unlock Choosey Unlimited features.</p>
                    <ul>
                        <li>Save and pick up any of your stories anytime</li>
                        <li>Spice it up with your own custom story twists</li>
                        <li>Hear every word with immersive audiobook narration</li>
                    </ul>
                    <RetryPaymentButton apiBaseURL={apiBaseURL} />
                    </>
                </div>
            )}
        </>
    );
}

export default ReaderPage;