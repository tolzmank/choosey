// src/components/ReaderPage.js
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import RetryPaymentButton from './RetryPaymentButton';
import StoryAudioButton from "../components/StoryAudioButton";

function ReaderPage({currentUser, userProfile, apiBaseURL, darkMode, setDarkMode, onLoginClick}) {
    const location = useLocation();
    const [showRestartConfirm, setShowRestartConfirm] = useState(false);
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
    

    // Audiobook Narration
    const playNarration = async (text) => {
        const res = await fetch(`${apiBaseURL}/api/v1/narrate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voice_id: "JBFqnCBsd6RMkjVDRZzb" })
        });

        if (!res.ok) {
            console.error("Failed to start narration");
            return;
        }

        const audioUrl = URL.createObjectURL(await res.blob());
        const audio = new Audio(audioUrl);
        audio.play();
    };

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

                const res = await axios.get(`${apiBaseURL}/api/v1/read_story/${id}`, {
                    headers
                });

                if (res.data && res.data.story_set) {
                    setLocalStory(res.data.story_set);
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


            <p style={{ fontWeight: 700, textAlign: 'center', fontSize: 20 }}>{localStory?.title}</p>
            {localStory?.story?.map((plotBlock, index) => (
                <div key={index}>
                    <p style={{fontSize: `${fontSize}px`, lineHeight: lineSpacing,  margin: 10}}>
                        <StoryAudioButton storyText={plotBlock.text} apiBaseURL={apiBaseURL}/> {plotBlock.text}</p>
                    
                    {index === localStory.story.length - 1 && plotBlock.choices && (
                        <>
                            {plotBlock.choices?.[0]?.decision !== "" ? (
                                <div className="decision-row">
                                    {plotBlock.choices.map((choice, idx) => (
                                        <button
                                            key={idx}
                                            className="decision-button"
                                            onClick={() => handleChoice(choice)}
                                        >
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