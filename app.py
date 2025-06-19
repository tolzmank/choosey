
import os
import random
import re
import threading
import time
from difflib import SequenceMatcher
import json
from dotenv import load_dotenv
load_dotenv()


# OpenAI for answer bot
from openai.types.chat import ChatCompletionMessage
from openai import OpenAI
#from openai.types import ResponseFormat
#import openai
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

from flask import Flask, render_template, redirect, url_for, request, jsonify
app = Flask(__name__)

story_set = {}

@app.route('/')
def index():

    return render_template('index.html',
                           story_set=story_set
                           )

@app.route('/setup', methods=['POST'])
def setup():
    global story_set
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
    return redirect(url_for('index'))


@app.route('/choose_path', methods=['POST'])
def choose_path():
    global story_set
    decision = request.form['decision']
    next = request.form['next']
    choice = {'decision': decision, 'next': next}
    print('CHOICE >>> ', choice)
    story_set = get_next_story_block(story_set, choice)
    print('STORY BLOCKS LENGTH: ', len(story_set['story']))
    return redirect(url_for('index'))


@app.route('/start_over', methods=['POST'])
def start_over():
    global story_set
    initial_story_block = story_set['story'][0]
    story_set['story'] = [initial_story_block]
    return redirect(url_for('index'))


@app.route('/go_back', methods=['POST'])
def go_back():
    global story_set
    last_story_block = story_set['story'][-1]
    story_set['story'].remove(last_story_block)
    return redirect(url_for('index'))


@app.route('/reset', methods=['POST'])
def reset():
    global story_set
    story_set = {}
    return redirect(url_for('index'))


@app.route('/delete_stories', methods=['POST'])
def delete_stories():
    global story_set
    story_set = {}
    return redirect(url_for('index'))


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
    #app.run(host='0.0.0.0', port=8080, debug=True)

    app.run(debug=False)