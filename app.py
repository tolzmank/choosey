
import os
import random
import re
import threading
import time
import uuid

import json
from dotenv import load_dotenv
load_dotenv()

# Google Cloud Datastore
from google.cloud import datastore
ds_client = datastore.Client(project="choosey-463422")

import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

cred = credentials.Certificate('choosey-463422-firebase-adminsdk.json')
firebase_admin.initialize_app(cred)


# OpenAI for answer bot
#from openai.types.chat import ChatCompletionMessage
from openai import OpenAI
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

from flask import Flask, render_template, redirect, url_for, request, jsonify, session
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")


@app.route('/')
def index():
    story_id = session.get('story_id')
    if story_id:
        story_set = get_story(story_id)
    else:
        story_set = {}
    
    show_login = session.pop('show_login_form', False)
    return render_template('index.html', 
                           show_login=show_login,
                           user=session.get('user'), 
                           story_set=story_set
                           )



@app.route('/show_login', methods=['GET'])
def show_login():
    session['show_login_form'] = True
    return redirect(url_for('index'))

@app.route('/hide_login', methods=['GET'])
def hide_login():
    session['show_login_form'] = False
    return redirect(url_for('index'))


@app.route('/session_login', methods=['POST'])
def session_login():
    data = request.get_json()
    id_token = data.get('idToken')
    decoded = firebase_auth.verify_id_token(id_token)
    session['user'] = { 'uid': decoded['uid'], 'email': decoded.get('email') }
    #return ('', 204)
    return redirect(url_for('index'))


@app.route('/session_logout', methods=['GET'])
def session_logout():
    session.clear()
    #return ('', 204)
    return redirect(url_for('index'))


@app.route('/create_story', methods=['POST'])
def create_story():
    user = session.get('user')

    genre = request.form.get('genre')
    length = request.form.get('length')
    control = request.form.get('control')
    spice = request.form.get('spice')
    persona = request.form.get('persona')

    story_set = {
        'genre': genre,
        'length': length,
        'control': control,
        'spice': spice,
        'persona': persona,
        'story': []
    }
    story_set = get_next_story_block(story_set, None)
    story_id = save_story_db(story_set)
    session['story_id'] = story_id
    return render_template('index.html', user=user, story_set=story_set)


def save_story_db(story_set):
    if story_set:
        entity = datastore.Entity(key=ds_client.key('Story'), exclude_from_indexes=['story'])
        entity.update({
            'genre': story_set['genre'],
            'length': story_set['length'],
            'control': story_set['control'],
            'spice': story_set['spice'],
            'persona': story_set['persona'],
            'story': json.dumps(story_set['story'])
        })
        ds_client.put(entity)
        print('Story saved with ID:', entity.key.id)
        story_id = entity.key.id
        return story_id


@app.route('/choose_path', methods=['POST'])
def choose_path():
    user = session.get('user')
    story_id = session.get('story_id')
    story_set = get_story(story_id)

    decision = request.form['decision']
    next = request.form['next']
    choice = {'decision': decision, 'next': next}
    story_set = get_next_story_block(story_set, choice)

    update_story_db(story_id, story_set)

    return render_template('index.html', user=user, story_set=story_set)


def update_story_db(story_id, story_set):
    key = ds_client.key('Story', story_id)
    entity = ds_client.get(key)
    if entity:
        entity['story'] = json.dumps(story_set['story'])
        ds_client.put(entity)
        print('Story updated with ID:', story_id)


@app.route('/start_over', methods=['POST'])
def start_over():
    story_id = session.get('story_id')
    story_set = get_story(story_id)
    initial_story_block = story_set['story'][0]
    story_set['story'] = [initial_story_block]
    update_story_db(story_id, story_set)
    return redirect(url_for('index'))


@app.route('/go_back', methods=['POST'])
def go_back():
    story_id = session.get('story_id')
    story_set = get_story(story_id)
    last_story_block = story_set['story'][-1]
    story_set['story'].remove(last_story_block)
    update_story_db(story_id, story_set)
    return redirect(url_for('index'))


@app.route('/reset', methods=['POST'])
def reset():
    story_id = session.get('story_id')
    if story_id:
        key = ds_client.key('Story', story_id)
        ds_client.delete(key)
        print(f'Story ID: {story_id} deleted')
    session['story_id'] = None
    return redirect(url_for('index'))


@app.route('/delete_all_stories', methods=['POST'])
def delete_all_stories():
    query = ds_client.query(kind='Story')
    keys = [entity.key for entity in query.fetch()]
    ds_client.delete_multi(keys)
    print(f'All stories deleted')
    return redirect(url_for('index'))


@app.route('/delete_story/<int:story_id>', methods=['POST'])
def delete_story(story_id):
    if story_id:
        key = ds_client.key('Story', story_id)
        ds_client.delete(key)
        print(f'Story ID: {story_id} deleted')
    return redirect(url_for('index'))


def get_story(story_id):
    key = ds_client.key('Story', story_id)
    entity = ds_client.get(key)
    if entity:
        story_set = {
            'genre': entity.get('genre'),
            'length': entity.get('length'),
            'control': entity.get('control'),
            'spice': entity.get('spice'),
            'persona': entity.get('persona'),
            'story': json.loads(entity.get('story', '[]'))
        }
        return story_set
    return None


def map_user_set(story_set):
    """ Map user selections to specific prompt friendly variables """
    # Genre map
    genre_map = {
        'romantasy': 'Romantasy (Romantic Fantasy)',
        'erotic_romance': 'Erotic Romance',
        'taboo_romance': 'Taboo Romance',
        'romantic_thriller': 'Romantic Thriller',
        'romantic_comedy': 'Romantic Comedy (RomCom)'
    }
    genre = genre_map.get(story_set['genre'])

    # Overall length map (total paragraphs for story)
    plot_length_map = {
        'quicky': 20,
        'novella': 100,
        'novel': 500,
        'epic': 1000
    }
    total_blocks = plot_length_map.get(story_set['length'])

    # Control map (paragraphs per block "user decision")
    control_map = {
            'low': 8,
            'medium': 4,
            'high': 2
        }
    num_paragraphs_per_block = control_map.get(story_set['control'])
    
    spice_map = {
        'mild': "A tender slow-burn with shy glances, butterflies, and a kiss that lingers. Sweet tension, minimal heat.",
        'medium': "Flirty touches, heated glances, and clothes that might just come off. Suggestive, but not too explicit.",
        'hot': "Steamy, uninhibited, and totally NSFW. Full-on heat with all the delicious penetration, sounds, climax, sensations, etc details left in."
        }
    spice = spice_map.get(story_set['spice'])

    persona_map = {
        "sweetheart": "The main character is gentle, kind-hearted, emotionally open, and loyal. They think with their heart, crave meaningful connection, and often put others before themselves. They blush easily but love deeply.",
        "badass": "The main character is bold, sharp-tongued, fiercely independent, and unafraid to take risks. They lead with strength, sarcasm, and confidence, and never wait for permission. Think rogue with a conscience.",
        "flirt": "The main character is magnetic, teasing, and playful. They use charm, wit, and seduction like second nature, always keeping others on their toes. Every interaction is a game, and they’re always one move ahead.",
        "brooding": "The main character is intense, emotionally guarded, and introspective. They speak in low tones, carry emotional scars, and rarely let others in. When they do, it’s devastatingly deep and raw.",
        "chaotic": "The main character is wild, impulsive, and unpredictable. They thrive on chaos, break rules for fun, and stir the pot with reckless joy. They’re passionate, spontaneous, and a little dangerous — in a good way."
        }
    persona = persona_map.get(story_set['persona'])

    # Build final user setting map
    user_set = {
        'genre': genre,
        'length': total_blocks,
        'control': num_paragraphs_per_block,
        'spice': spice,
        'persona': persona
        }
    return user_set


def get_next_story_block(story_set, choice=None):
    print('Getting story block...')
    user_set = map_user_set(story_set)
    genre = user_set['genre']
    total_paragraphs = user_set['length']
    paragraphs_per_block = user_set['control']
    spice = user_set['spice']
    persona = user_set['persona']

    plot_blocks = story_set.get('story')
    if plot_blocks:
        last_block = story_set['story'][-1]
        summary = story_set['story'][-1]['summary']
        user_choice = choice.get('decision')

        paragraphs_used = len(story_set['story']) * paragraphs_per_block
        paragraphs_remaining = total_paragraphs - paragraphs_used

        prompt = f"""
        You are a flirty, skilled romance novelist continuing an interactive, spicy romance story.

        Here’s the user’s setup:
        - Genre: {genre}
        - Total desired length: {total_paragraphs} paragraphs
        - Paragraphs per section: {paragraphs_per_block}
        - Spice level: {spice}
        - Main character persona: {persona}

        Story summary so far:
        \"{summary}\"

        Last section of the story:
        \"{last_block['text']}\"

        The reader chose to:
        \"{user_choice}\"

        Your task:
        1. Write the next part of the story (exactly {paragraphs_per_block} paragraphs), continuing naturally from the reader's choice.
        2. Keep the **tone, persona, and spice level** consistent.
        3. At the end, present exactly **two narratively distinct choices** for the reader.
        4. Include a short updated **summary** of the entire plot so far.

        Important:
        - The total length of this story should be about {total_paragraphs} paragraphs total.
        - You have already used approximately {paragraphs_used} paragraphs.
        - That means you have ~{paragraphs_remaining} paragraphs left to wrap up the full arc.
        - Plan the pacing and narrative arcs accordingly — don’t stall or wrap up too fast.

        Respond ONLY with valid JSON like this:

        {{
        "text": "Next {paragraphs_per_block} paragraph story content...",
        "choices": [
            {{"decision": "Choice A", "next": 3}},
            {{"decision": "Choice B", "next": 4}}
        ],
        "summary": "Short updated summary of the plot so far."
        }}
        """.strip()

    else:
        prompt = f"""
        You are a flirty, skilled romance novelist writing the first part of a steamy, interactive story.

        Here’s the user’s setup:
        - Genre: {genre}
        - Desired story length: {total_paragraphs} paragraphs total
        - Paragraphs per section (control level): {paragraphs_per_block}
        - Spice level: {spice}
        - Main character persona: {persona}

        Instructions:
        1. Write the **opening** of the story (exactly {paragraphs_per_block} paragraphs), setting the tone, world, and protagonist in an immersive way.
        2. Make sure the narrative **reflects the chosen persona** (e.g. if ‘badass’, make the protagonist bold and sarcastic).
        3. Adjust sensuality to match the **spice level** (e.g. if ‘hot’, begin introducing sexual tension or NSFW elements early).
        4. At the end, present exactly **two choices** the reader can make next — each should sound tempting, personal, and narratively distinct.
        5. End with a 1-2 sentence **summary** of what’s happened so far. (This will be used in the next prompt as plot memory.)

        Respond ONLY with a valid JSON object like this:

        {{
        "text": "Your story content here in {paragraphs_per_block} paragraphs...",
        "choices": [
            {{"decision": "First choice", "next": 1}},
            {{"decision": "Second choice", "next": 2}}
        ],
        "summary": "Brief summary of events so far."
        }}
        """.strip()

    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a flirty, fun romance novelist."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.9,
        response_format={ "type": "json_object" }
    )
    try:
        text = response.choices[0].message.content
        story_block = json.loads(text)
    except json.JSONDecodeError as e:
        print("JSON parsing error:", e)
        print("Response text was:", text)
        return story_set
    
    story_set['story'].append(story_block)
    return story_set


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True)

    #app.run(debug=True)