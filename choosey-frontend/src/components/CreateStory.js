import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AgeCheckModal from './AgeCheckModal';


function CreateStory({currentUser, userProfile, apiBaseURL, onLoginClick}) {
    const [showAgeModal, setShowAgeModal] = useState(false);
    const [pendingSpice, setPendingSpice] = useState(null);

    const [genre, setGenre] = useState('');
    const [relationshipType, setRelationshipType] = useState('');
    const [length, setLength] = useState('');
    const [control, setControl] = useState('');
    const [spice, setSpice] = useState('');
    const [persona, setPersona] = useState('');
    const [romanticInterestPersonality, setRomanticInterestPersonality] = useState('');

    const [loading, setLoading] = useState(false);

    const handleSelectSpice = (choice) => {
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
                alert("You must be 18+ to select explicit stories.");
            }
            } else {
            // logged in but no birthdate
            setPendingSpice(choice);
            setShowAgeModal(true);
        }
    };

    const confirmAge = () => {
        if (pendingSpice) {
            setSpice(pendingSpice);
        }
        setShowAgeModal(false);
        setPendingSpice(null);
    };

    const cancelAbge = () => {
        setShowAgeModal(false);
        setPendingSpice(null);
    }

    const navigate = useNavigate();

    const handleCreateStory = async (e) => {
        e.preventDefault();
        setLoading(true);
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
                genre,
                relationship_type: relationshipType,
                length,
                control,
                spice,
                persona,
                romantic_interest_personality: romanticInterestPersonality,
                anon_id: anonId
            },
            { headers: { Authorization: `Bearer ${idToken}` } }
            )
            .then(res => {
                console.log('Story created:', res.data);
                // navigate to Story Reader View here
                navigate(`/read_story/${res.data.story_id}`, {
                    state: { storySet: res.data.story_set }
                });
            })
        } catch (err) {
            console.log(err);
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

        <div className="container">
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
                    <select className="bubble-input" name="genre" value={genre} title="Your fantasy, your rules. Select the kind of story you’re dying to dive into." onChange={e => setGenre(e.target.value)} required>
                        <option value="" disabled defaultValue required>Select</option>
                        <option value="romantasy">Romantasy (Romantic Fantasy)</option>
                        <option value="erotic_romance">Erotic Romance</option>
                        <option value="forbidden_romance">Forbidden Romance</option>
                        <option value="romantic_thriller">Romantic Thriller</option>
                        <option value="romantic_comedy">Romantic Comedy (RomCom)</option>
                    </select>
                    </td>
                </tr>
                
                <tr><td style={{ paddingTop: '20px' }}>Choose Your Entanglement</td></tr>
                <tr>
                    <td>
                    <select className="bubble-input" name="relationship_type" value={relationshipType} title="Pick the kind of relationship chaos—or clarity—you’re craving." onChange={e => setRelationshipType(e.target.value)} required>
                        <option value="" disabled defaultValue required>Select</option>
                        <option value="traditional">Traditional</option>
                        <option value="reverse_harem">Reverse Harem</option>
                        <option value="mmf">Throuple (MMF)</option>
                        <option value="ffm">Throuple (FFM)</option>
                        <option value="open_relationship">Open Relationship</option>
                        <option value="enemies_to_lovers">Enemies to Lovers</option>
                    </select>
                    </td>
                </tr>

                <tr><td style={{ paddingTop: '20px' }}>How long do you want it?</td></tr>
                <tr>
                    <td>
                    <select className="bubble-input" name="length" value={length} title="Pick your pace — just a quicky or keep it going and going?" onChange={e => setLength(e.target.value)} required>
                        <option value="" disabled defaultValue required>Select</option>
                        <option value="quicky">Quicky (Short & Sweet)</option>
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
                        <option value="" disabled defaultValue required>Select</option>
                        <option value="low">Let It Ride</option>
                        <option value="medium">A Little Control</option>
                        <option value="high">Driver's Seat</option>
                    </select>
                    </td>
                </tr>

                <tr><td style={{ paddingTop: '20px' }}>How Spicy are you feeling?</td></tr>
                <tr>
                    <td>
                        <select className="bubble-input" name="spice" value={spice} title="Mild tease or full sizzle? Set the explicitness level for your story." onChange={e => handleSelectSpice(e.target.value)} required>
                        <option value="" disabled defaultValue required>Select</option>
                        <option value="mild">Sweetie (Mild)</option>
                        <option value="medium">Just Enough Heat (Medium)</option>
                        <option value="hot">Turn Up the Heat (Explicit)</option>
                    </select>
                    </td>
                </tr>

                <tr><td style={{ paddingTop: '20px' }}>Female Main Character Flavor</td></tr>
                <tr>
                    <td>
                    <select className="bubble-input" name="persona" value={persona} title="Pick your story persona." onChange={e => setPersona(e.target.value)} required>
                        <option value="" disabled defaultValue required>Select</option>
                        <option value="sweetheart">Sweetheart (Loving & Loyal)</option>
                        <option value="badass">Badass (Bold & Fierce)</option>
                        <option value="flirt">Flirt (Charming & Teasing)</option>
                        <option value="brooding">Brooding (Dark & Deep)</option>
                        <option value="chaotic">Wildcard (Unpredictable & Fun)</option>
                    </select>
                    </td>
                </tr>

                <tr><td style={{ paddingTop: '20px' }}>Heartthrob Flavor Profile</td></tr>
                <tr>
                    <td>
                    <select className="bubble-input" name="romantic_interest_personality" value={romanticInterestPersonality} title="Choose your ideal love interest vibe." onChange={e => setRomanticInterestPersonality(e.target.value)} required>
                        <option value="" disabled defaultValue required>Select</option>
                        <option value="protector">Protector</option>
                        <option value="rogue">Rogue</option>
                        <option value="softie">Softie</option>
                        <option value="grump">Grump</option>
                        <option value="golden">Golden Retriever</option>
                    </select>
                    </td>
                </tr>

                <tr>
                    <td style={{ paddingTop: '20px', marginTop: '10px', paddingBottom: '20px' }}><button className="button" type="submit">Start Adventure</button></td>
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
                onCancel={cancelAbge}
                showProfileMessage={!!currentUser && !userProfile?.birthdate}
            />
            )}

        </div>
    </>
        
  );
}

export default CreateStory;