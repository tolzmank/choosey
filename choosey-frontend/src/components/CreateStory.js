import React, { useState, useEffect, use } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AgeCheckModal from './AgeCheckModal';


function CreateStory({currentUser, userProfile, apiBaseURL, onLoginClick, setCurrentStoryId, setCurrentStoryTitle}) {
    const [showAgeModal, setShowAgeModal] = useState(false);
    const [pendingSpice, setPendingSpice] = useState(null);

    const [length, setLength] = useState('quicky');
    const [control, setControl] = useState('');
    const [spice, setSpice] = useState('');
    const [minAgeMsg, setMinAgeMsg] = useState('');
    //const [explicitnessMsg, setExplicitnessMsg] = useState('');
    const [errMsg, setErrMsg] = useState('');

    const [loading, setLoading] = useState(false);

    const handleSelectSpice = (choice) => {
        setMinAgeMsg('');
        if (choice !== 'hot') {
            setSpice(choice);
            return;
        }
        if (!currentUser) {
            setPendingSpice('hot');
            setShowAgeModal(true);
        }
        if (userProfile?.birthdate) {
            const birth = new Date(userProfile.birthdate);
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;

            if (age >= 18) {
                setSpice(choice);
            } else {
                setMinAgeMsg("You must be 18+ to select explicit stories.");
            }
        } else {
            // logged in but no birthdate
            setPendingSpice(choice);
            setShowAgeModal(true);
        }
    };

    const explicitPepperIcons = (explicitness) => {
        const explicitMap = {
            'mild': 1,
            'medium': 2,
            'hot': 3,
        }
        const explicitMsgMap = {
            'mild': 'Mostly romantic tension and flirty scenes — fade-to-black moments.',
            'medium': 'Includes detailed foreplay and sensual scenes, but not fully explicit.',
            'hot': 'Fully explicit adult content with graphic sexual detail.'
        };
        let peppers = explicitMap[explicitness] || 0;
        let explicitMsg = explicitMsgMap[explicitness] || '';
        return (
                <div style={{ display: 'flex', gap: '2px', alignItems: 'center', marginTop: '5px' }}>
                    {Array.from({ length: peppers }).map((_, i) => (
                        <img key={i} src="/images/pink_pepper_smiley.png" alt="pepper" style={{ height: '20px' }} />
                    ))}
                    <p style={{ color:'#db859dff', marginLeft: '5px', marginTop: '0px', marginBottom: '0px'}}>{explicitMsg}</p>
                </div>
            );
    };

    const confirmAge = () => {
        if (pendingSpice) {
            setSpice(pendingSpice);
        }
        setShowAgeModal(false);
        setPendingSpice(null);
    };

    const cancelAge = () => {
        setShowAgeModal(false);
        setPendingSpice(null);
        setMinAgeMsg("You must be 18+ to select explicit stories.");
    }

    const [storyOptions, setStoryOptions] = useState({
        genre: "surprise",
        relationshipType: "surprise",
        persona: "surprise",
        romanticInterestPersonality: "surprise",
        customGenre: "",
        customRelationshipType: "",
        customPersona: "",
        customRomanticInterestPersonality: "",
    });

    function updateStoryOption(field, value) {
        setStoryOptions((prev) => ({
            ...prev,
            [field]: value,
        }));
    }

    const navigate = useNavigate();

    const handleCreateStory = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrMsg('');
        //setCurrentStoryTitle('')
        // use logged in user, or anonymous id or create anon id
        let idToken = null;
        let anonId = null;
        if (currentUser) {
            idToken = await currentUser.getIdToken();
        } else {
            anonId = localStorage.getItem('anon_id');
            if (!anonId) {
                anonId = crypto.randomUUID();
                localStorage.setItem('anon_id', anonId);
            }
        }
        try {
            const res = await axios.post(`${apiBaseURL}/api/v1/create_story`,
            {
                genre: storyOptions.genre === 'custom' ? storyOptions.customGenre : storyOptions.genre,
                relationship_type: storyOptions.relationshipType === 'custom' ? storyOptions.customRelationshipType : storyOptions.relationshipType,
                length,
                control,
                spice,
                persona: storyOptions.persona === 'custom' ? storyOptions.customPersona : storyOptions.persona,
                romantic_interest_personality: storyOptions.romanticInterestPersonality === 'custom' ? storyOptions.customRomanticInterestPersonality : storyOptions.romanticInterestPersonality,
                anon_id: anonId
            },
            { headers: { Authorization: `Bearer ${idToken}` } }
            )
            .then(res => {
                //console.log('Story created:', res.data);
                // navigate to Story Reader View here
                navigate(`/read_story/${res.data.story_id}`, {
                    state: { storySet: res.data.story_set }
                });
            })
        } catch (err) {
            console.log(err);
            setErrMsg(err.response?.data?.error);
        } finally {
            setLoading(false);
        }
    };

  return (
    <>
        {loading && (
            <div id="loading-overlay">
                <div className="loading-spinner"></div>
                <p>Getting your fantasy ready...</p>
            </div>
        )}

        <div className="container" style={{marginBottom: '150px'}}>
            <form onSubmit={handleCreateStory}>
            <table>
                <thead>
                <tr>
                    <th className="no-sort">Make the Story Yours</th>
                </tr>
                </thead>
                <tbody>
                <tr><td style={{ paddingTop: '20px' }}>What's Your Flavor?</td></tr>
                <tr>
                    <td>
                    <select className="bubble-input" name="genre" value={storyOptions.genre} title="Your fantasy, your rules. Select the kind of story to dive into." onChange={e => updateStoryOption('genre', e.target.value)} required>
                        <option value="surprise">Surprise Me!</option>
                        
                        <option value="custom">Custom</option>
                        <option value="erotic_romance">Erotic Romance</option>
                        <option value="romantasy">Romantasy (Romantic Fantasy)</option>
                        <option value="forbidden_romance">Forbidden Romance</option>
                        <option value="romantic_thriller">Romantic Thriller</option>
                        <option value="romantic_comedy">Romantic Comedy (RomCom)</option>
                    </select>
                    </td>
                </tr>
                {storyOptions.genre === "custom" && (
                    <tr>
                        <td>
                            <input
                                className="bubble-input"
                                style={{width: '300px', backgroundColor: "#ffd6e2ff"}}
                                type="text"
                                maxLength={200}
                                placeholder="What kind of story gets you going?"
                                value={storyOptions.customGenre}
                                onChange={(e) =>
                                    updateStoryOption('customGenre', e.target.value )
                                }
                            />
                        </td>
                    </tr>
                    )}
                
                <tr><td style={{ paddingTop: '20px' }}>Choose Your Entanglement</td></tr>
                <tr>
                    <td>
                    <select className="bubble-input" name="relationship_type" value={storyOptions.relationshipType} title="Pick the kind of interaction you’re craving." onChange={e => updateStoryOption('relationshipType', e.target.value)} required>
                        <option value="surprise">Down for anything</option>
                        
                        <option value="custom">Custom</option>
                        <option value="traditional">Traditional</option>
                        <option value="reverse_harem">Reverse Harem</option>
                        <option value="mmf">Throuple (MMF)</option>
                        <option value="ffm">Throuple (FFM)</option>
                        <option value="open_relationship">Open Relationship</option>
                        <option value="enemies_to_lovers">Enemies to Lovers</option>
                    </select>
                    </td>
                </tr>
                {storyOptions.relationshipType === "custom" && (
                    <tr>
                        <td>
                            <input
                                className="bubble-input"
                                style={{width: '300px', backgroundColor: "#ffd6e2ff"}}
                                type="text"
                                maxLength={200}
                                placeholder="Describe your perfect entanglement..."
                                value={storyOptions.customRelationshipType}
                                onChange={(e) =>
                                    updateStoryOption('customRelationshipType', e.target.value )
                                }
                            />
                        </td>
                    </tr>
                    )}

                <tr><td style={{ paddingTop: '20px' }}>How long do you want it?</td></tr>
                <tr>
                    <td>
                    <select className="bubble-input" name="length" value={length} title="Pick your pace — just a quicky or keep it going and going?" onChange={e => setLength(e.target.value)} required>
                        <option value="quicky" defaultValue>Quicky (Short & Sweet)</option>
                        <option value="novella">Slow Burn (Novella)</option>
                        <option value="novel">Deep Dive (Novel)</option>
                        <option value="epic">All In (Epic)</option>
                    </select>
                    </td>
                </tr>

                <tr><td style={{ paddingTop: '20px' }}>How much control do you want?</td></tr>
                <tr>
                    <td>
                    <select className="bubble-input" name="control" value={control} title="How hands-on do you want to be with the story? Mostly sit back or taking full control?" onChange={e => setControl(e.target.value)} required>
                        <option value="" disabled defaultValue>Select</option>
                        <option value="full">Lay Back (No Decisions)</option>
                        <option value="low">Let It Ride</option>
                        <option value="medium">Medium Control</option>
                        <option value="high">Driver's Seat</option>
                    </select>
                    </td>
                </tr>

                <tr><td style={{ paddingTop: '20px' }}>How Spicy are you feeling?</td></tr>
                <tr>
                    <td>
                        <select className="bubble-input" name="spice" value={spice} title="Mild tease or full sizzle? Set the explicitness level for your story." onChange={e => handleSelectSpice(e.target.value)} required>
                        <option value="" disabled defaultValue>Select</option>
                        <option value="mild">Sweetie (Mild)</option>
                        <option value="medium">Just Enough Heat (Medium)</option>
                        <option value="hot">Turn Up the Heat (Explicit)</option>
                    </select>
                    {minAgeMsg && (
                        <p style={{color: '#8e5656ff', maxWidth: '300px', marginBottom: '0px'}}>{minAgeMsg}</p>
                    )}
                    {explicitPepperIcons(spice)}
                    </td>
                </tr>

                <tr><td style={{ paddingTop: '20px' }}>Female Main Character Persona</td></tr>
                <tr>
                    <td>
                    <select className="bubble-input" name="persona" value={storyOptions.persona} title="Pick your story persona." onChange={e => updateStoryOption('persona', e.target.value)} required>
                        <option value="surprise">I'm not sure, you choose</option>
                        
                        <option value="custom">Custom</option>
                        <option value="sweetheart">Sweetheart (Loving & Loyal)</option>
                        <option value="badass">Badass (Bold & Fierce)</option>
                        <option value="flirt">Flirt (Charming & Teasing)</option>
                        <option value="brooding">Brooding (Dark & Deep)</option>
                        <option value="chaotic">Wildcard (Unpredictable & Fun)</option>
                    </select>
                    </td>
                </tr>
                {storyOptions.persona === "custom" && (
                <tr>
                    <td>
                        <input
                            className="bubble-input"
                            style={{width: '300px', backgroundColor: "#ffd6e2ff"}}
                            type="text"
                            maxLength={200}
                            placeholder="Who do you want to be?..."
                            value={storyOptions.customPersona}
                            onChange={(e) =>
                                updateStoryOption('customPersona', e.target.value )
                            }
                        />
                    </td>
                </tr>
                )}

                <tr><td style={{ paddingTop: '20px' }}>Heartthrob Flavor Profile</td></tr>
                <tr>
                    <td>
                    <select className="bubble-input" name="romantic_interest_personality" value={storyOptions.romanticInterestPersonality} title="Choose your ideal love interest vibe." onChange={e => updateStoryOption('romanticInterestPersonality', e.target.value)} required>
                        <option value="surprise">I don't have a type</option>

                        
                        <option value="custom">Custom</option>
                        <option value="protector">Protector</option>
                        <option value="rogue">Rogue</option>
                        <option value="softie">Softie</option>
                        <option value="grump">Grump</option>
                        <option value="golden">Golden Retriever</option>
                    </select>
                    </td>
                </tr>
                {storyOptions.romanticInterestPersonality === "custom" && (
                <tr>
                    <td>
                        <input
                            className="bubble-input"
                            style={{width: '300px', backgroundColor: "#ffd6e2ff"}}
                            type="text"
                            maxLength={200}
                            placeholder="Describe tonight's heartthrob..."
                            value={storyOptions.customRomanticInterestPersonality}
                            onChange={(e) =>
                                updateStoryOption('customRomanticInterestPersonality', e.target.value )
                            }
                        />
                    </td>
                </tr>
                )}

                <tr>
                    <td style={{ paddingTop: '20px', marginTop: '10px', paddingBottom: '20px' }}>
                        <button className="button" type="submit">Start Adventure</button>
                        {errMsg && (
                            <p style={{color: '#8e5656ff', maxWidth: '400px'}}>{errMsg}</p>
                        )}
                    </td>
                </tr>
                </tbody>
            </table>
            </form>

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
            {showAgeModal && (
            <AgeCheckModal
                onConfirm={confirmAge}
                onCancel={cancelAge}
                showProfileMessage={!!currentUser && !userProfile?.birthdate}
            />
            )}

        </div>
    </>
        
  );
}

export default CreateStory;