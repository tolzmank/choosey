
import os
import uuid
from datetime import datetime, timezone, timedelta
import pytz

import json
from dotenv import load_dotenv
load_dotenv()

# Google Cloud Datastore
from google.cloud import datastore, secretmanager
ds_client = datastore.Client(project="choosey-463422")

# Firebase Authentication
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

client = secretmanager.SecretManagerServiceClient()
secret_name = os.environ["FIREBASE_ADMIN_CREDENTIALS"]
response = client.access_secret_version(request={"name": secret_name})
secret_payload = response.payload.data.decode("UTF-8")

cred_dict = json.loads(secret_payload)
cred = credentials.Certificate(cred_dict)
firebase_admin.initialize_app(cred)


# OpenAI
from openai import OpenAI
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

from flask import Flask, render_template, redirect, url_for, request, jsonify, session, flash
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")


@app.route('/')
def index():
    story_id = session.get('story_id')
    if story_id:
        story_set = get_story(story_id)
    else:
        story_set = {}

    # Display create story page by default
    if not any([
        session.get('show_login_form'),
        session.get('show_stories'),
        session.get('show_create'),
        session.get('show_account'),
        session.get('story_id')
    ]):
        session['show_create'] = True

    scroll_on_load = request.args.get('scroll') == 'end'
    #show_login = session.pop('show_login_form', False)
    return render_template('index.html', 
                            show_login=session.get('show_login_form'),
                            show_stories=session.get('show_stories'),
                            show_create=session.get('show_create'),
                            show_account=session.get('show_account'),
                            user=session.get('user'), 
                            story_set=story_set,
                            user_profile=session.get('user_profile'),
                            show_create_account=session.get('show_create_account'),
                            scroll_on_load=scroll_on_load
                            )


@app.route('/show_login', methods=['GET'])
def show_login():
    session['show_login_form'] = True
    session['show_create_account'] = False
    session['show_stories'] = False
    session['show_create'] = False
    session['show_account'] = False
    session['hold_story_id'] = session.get('story_id')
    session.pop('story_id', None)
    return redirect(url_for('index'))


@app.route('/hide_login', methods=['GET'])
def hide_login():
    session['show_login_form'] = False
    if session.get('hold_story_id'):
        session['show_create'] = False
        session['show_stories'] = False
        session['show_account'] = False
        session['story_id'] = session.get('hold_story_id')
        session.pop('hold_story_id')
    else:
        session['show_create'] = True
    return redirect(url_for('index'))


@app.route('/show_create_story_page', methods=['GET'])
def show_create_story_page():
    session['show_stories'] = False
    session['show_create'] = True
    session.pop('story_id', None)
    return redirect(url_for('index'))



@app.route('/my_stories', methods=['GET'])
def my_stories():
    session['show_stories'] = True
    session['show_create'] = False
    session['show_account'] = False
    session.pop('story_id', None)
    user_stories = get_all_stories_for_user()

    for story in user_stories:
        story['created_at'] = to_localtime(story['created_at'])
        story['last_modified'] = to_localtime(story['last_modified'])
    return render_template('index.html', 
                            show_stories=session.get('show_stories'),
                            show_create=session.get('show_create'),
                            show_account=session.get('show_account'),
                            user=session.get('user'), 
                            user_stories=user_stories,
                            user_profile=session.get('user_profile')
                            )


def to_localtime(utc_dt):
    if utc_dt is None:
        return ''
    user_tz = session.get('timezone', 'UTC')
    local_tz = pytz.timezone(user_tz)
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=pytz.UTC)
    return utc_dt.astimezone(local_tz)


@app.route('/set_timezone', methods=['POST'])
def set_timezone():
    data = request.get_json()
    timezone = data.get('timezone')

    if timezone:
        session['timezone'] = timezone
        print('TIMEZONE SET:', session['timezone'])
        return ('', 204)
    else:
        print("Invalid timezone data")
        return ('Invalid timezone', 400)


@app.route('/read_story/<int:story_id>', methods=['GET'])
def read_story(story_id):
    session['story_id'] = story_id
    session['show_stories'] = False
    session['show_create'] = False
    session['show_account'] = False
    return redirect(url_for('index', scroll='end'))


@app.route('/account_settings', methods=['GET'])
def account_settings():
    session['show_stories'] = False
    session['show_create'] = False
    session['show_account'] = True
    session.pop('story_id', None)
    user = session.get('user')
    user_profile = {}
    if user:
        key = ds_client.key('UserProfile', user)
        profile_entity = ds_client.get(key) or {}
        user_profile = {
            'name': profile_entity.get('name', ''),
            'birthdate': profile_entity.get('birthdate', '')
        }
    return render_template('index.html', 
                                show_stories=session.get('show_stories'),
                                show_create=session.get('show_create'),
                                show_account=session.get('show_account'),
                                user=session.get('user'),
                                user_details=session.get('user_details'),
                                user_profile=user_profile
                                )


@app.route('/show_create_account', methods=['GET'])
def show_create_account():
    session['show_create_account'] = True
    session['show_login_form'] = True
    return redirect(url_for('index'))


@app.route('/hide_create_account', methods=['GET'])
def hide_create_account():
    session['show_login_form'] = True
    session['show_create_account'] = False
    return redirect(url_for('index'))


@app.route('/delete_account', methods=['POST'])
def delete_account():
    user = session.get('user')
    # Delete Firebase user
    try:
        firebase_auth.delete_user(user)
    except Exception as e:
        print(f"Error deleting Firebase user: {e}")
    # Delete all stories for user
    query = ds_client.query(kind='Story')
    query.add_filter('user', '=', user)
    keys = [entity.key for entity in query.fetch()]
    if keys:
        ds_client.delete_multi(keys)
    # Delete the user's profile entry
    profile_key = ds_client.key('UserProfile', user)
    ds_client.delete(profile_key)
    # Clear session and redirect to home
    session.clear()
    return redirect(url_for('index'))


@app.route('/update_account', methods=['POST'])
def update_account():
    user = session.get('user')
    # Fetch or create the UserProfile entity
    key = ds_client.key('UserProfile', user)
    profile = ds_client.get(key) or datastore.Entity(key=key)
    # Update fields from form
    profile['name'] = request.form.get('name', '').strip()
    profile['birthdate'] = request.form.get('birthdate', '').strip()
    ds_client.put(profile)
    flash('Profile updated!')
    return redirect(url_for('account_settings'))


@app.route('/session_login', methods=['POST'])
def session_login():

    data = request.get_json()
    id_token = data.get('idToken')
    decoded = firebase_auth.verify_id_token(id_token)
    user_info = { 'uid': decoded['uid'], 'email': decoded.get('email') }
    session['user_details'] = user_info
    session['user'] = user_info['uid']
    user = session.get('user')

    # If logging in for the first time after creating account, load extra info into datastore
    name = data.get('name')
    birthdate = data.get('birthdate')
    if name and birthdate:
        key = ds_client.key('UserProfile', user)
        entity = ds_client.get(key) or datastore.Entity(key=key)
        entity['name'] = name
        entity['birthdate'] = birthdate
        try:
            ds_client.put(entity)
        except Exception as e:
            print("Datastore save failed:", e)
            flash("Something went wrong saving your story. Please try again.")
    session['user_profile'] = get_user_profile(user)
    print('LOGIN Requested: ', session['user_profile']['name'])
    session.pop('show_login_form', False)

    # Add any anonymously created stories to a newly created/logged in user
    anon_id = session.get('anon_id')
    if anon_id:
        query = ds_client.query(kind='Story')
        query.add_filter('anon_id', '=', anon_id)
        for entity in query.fetch():
            entity['user'] = session['user']
            entity['anon_id'] = None
            try:
                ds_client.put(entity)
            except Exception as e:
                print("Datastore save failed:", e)
                flash("Something went wrong saving your story. Please try again.")
        session.pop('anon_id', None)
        
    return redirect(url_for('index'))


@app.route('/session_logout', methods=['GET'])
def session_logout():
    session.clear()
    #session['show_login_form'] = True
    return redirect(url_for('index'))


def get_user_profile(user):
    user_profile = {}
    if user:
        print('user:', user)
        key = ds_client.key('UserProfile', user)
        profile_entity = ds_client.get(key) or {}
        user_profile = {
            'name': profile_entity.get('name', ''),
            'birthdate': profile_entity.get('birthdate', '')
        }
    else:
        print('user profile not found')
    return user_profile


@app.route('/create_story', methods=['POST'])
def create_story():
    user = session.get('user')
    #max_anon_paragraphs = 40
    #if not user:
    #    if session['anon_paragraphs_count'] > max_anon_paragraphs:
    #        flash("Log in/Sign up to create and save more stories!")

    genre = request.form.get('genre')
    relationship_type = request.form.get('relationship_type')
    length = request.form.get('length')
    control = request.form.get('control')
    spice = request.form.get('spice')
    persona = request.form.get('persona')
    romantic_interest_personality = request.form.get('romantic_interest_personality')

    story_set = {
        'genre': genre,
        'relationship_type': relationship_type,
        'length': length,
        'control': control,
        'spice': spice,
        'persona': persona,
        'romantic_interest_personality': romantic_interest_personality,
        'story': []
    }
    story_set = get_next_story_block(story_set, None)
    story_set['title'] = story_set['story'][0]['title']
    del story_set['story'][0]['title']

    if user:
        story_id = save_story_db(story_set)
    else:
        # store as anonymous user
        story_id = save_story_anonymous(story_set)

    #story_id = save_story_db(story_set)
    session['story_id'] = story_id
    session['show_create'] = False
    return redirect(url_for('index'))
    #return render_template('index.html', user=user, story_set=story_set)


def save_story_anonymous(story_set):
# generate or reuse anonymous ID
    anon_id = session.get('anon_id') or str(uuid.uuid4())
    session['anon_id'] = anon_id

    if story_set:
        entity = datastore.Entity(key=ds_client.key('Story'), exclude_from_indexes=['story'])
        entity.update({
            'title': story_set['title'],
            'genre': story_set['genre'],
            'relationship_type': story_set['relationship_type'],
            'length': story_set['length'],
            'control': story_set['control'],
            'spice': story_set['spice'],
            'persona': story_set['persona'],
            'romantic_interest_personality': story_set['romantic_interest_personality'],
            'story': json.dumps(story_set['story']),
            'created_at': datetime.now(timezone.utc),
            'last_modified': datetime.now(timezone.utc),
            'anon_id': anon_id
        })
        try:
            ds_client.put(entity)
        except Exception as e:
            print("Datastore save failed:", e)
            flash("Something went wrong saving your story. Please try again.")
        print('Story saved with ID:', entity.key.id)
        story_id = entity.key.id
        return story_id


def save_story_db(story_set):
    user = session.get('user')
    if story_set:
        entity = datastore.Entity(key=ds_client.key('Story'), exclude_from_indexes=['story'])
        entity.update({
            'title': story_set['title'],
            'genre': story_set['genre'],
            'relationship_type': story_set['relationship_type'],
            'length': story_set['length'],
            'control': story_set['control'],
            'spice': story_set['spice'],
            'persona': story_set['persona'],
            'romantic_interest_personality': story_set['romantic_interest_personality'],
            'story': json.dumps(story_set['story']),
            'created_at': datetime.now(timezone.utc),
            'last_modified': datetime.now(timezone.utc),
            'user': user
        })
        try:
            ds_client.put(entity)
        except Exception as e:
            print("Datastore save failed:", e)
            flash("Something went wrong saving your story. Please try again.")
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
    return redirect(url_for('index'))
    #return render_template('index.html', user=user, story_set=story_set)


def update_story_db(story_id, story_set):
    key = ds_client.key('Story', story_id)
    entity = ds_client.get(key)
    if entity:
        entity['story'] = json.dumps(story_set['story'])
        entity['last_modified'] = datetime.now(timezone.utc)
        try:
            ds_client.put(entity)
        except Exception as e:
            print("Datastore save failed:", e)
            flash("Something went wrong saving your story. Please try again.")
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
    session.pop('story_id', None)
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
    user = session.get('user')
    if story_id:
        key = ds_client.key('Story', story_id)
        entity = ds_client.get(key)
        if entity and entity.get('user') == user:
            ds_client.delete(key)
            print(f'Story ID: {story_id} deleted')
    return redirect(url_for('my_stories'))


def get_all_stories_for_user():
    user = session.get('user')
    if not user:
        return []
    query = ds_client.query(kind='Story')
    query.add_filter('user', '=', user)
    all_stories = list(query.fetch())
    sorted_stories = sorted(all_stories, key=lambda x: x.get('last_modified'), reverse=True)
    return sorted_stories


def get_story(story_id):
    user = session.get('user')
    key = ds_client.key('Story', story_id)
    entity = ds_client.get(key)

    if entity and entity.get('user') == user:
        story_set = {
            'title': entity.get('title'),
            'genre': entity.get('genre'),
            'relationship_type': entity.get('relationship_type'),
            'length': entity.get('length'),
            'control': entity.get('control'),
            'spice': entity.get('spice'),
            'persona': entity.get('persona'),
            'romantic_interest_personality': entity.get('romantic_interest_personality'),
            'story': json.loads(entity.get('story', '[]')),
            'created_at': entity.get('created_at'),
            'last_modified': entity.get('last_modified')
        }
        return story_set
    return None


def map_user_set(story_set):
    """ Map user selections to specific prompt friendly variables """
    rel_type = story_set['relationship_type']

    genre_map = {
        'romantasy': "Romantasy: Sweeping fantasy setting, magical secrets, and forbidden power with an emotionally charged romance.",
        'erotic_romance': "Erotic Romance: Deep emotional connection through explicit intimacy and trust.",
        'forbidden_romance': "Forbidden Romance: Illicit desire that crosses boundaries that society—or the characters themselves—consider off-limits, like a step-sibling, an age-gap mentor, a best friend’s parent, or someone who once held power over the protagonist, the attraction is magnetic and dangerous.",
        'romantic_thriller': "Romantic Thriller: Suspenseful, high-stakes danger with slow-burning attraction and betrayal.",
        'romantic_comedy': "Romantic Comedy: Funny, witty banter with awkward mishaps that blossoms into love and romantic encounters."
    }
    genre = genre_map.get(story_set['genre'])

    relationship_type_map = {
        'traditional': "Traditional Romance: Single romantic interest, deep emotional arc, steady growth to commitment.",
        'reverse_harem': "Reverse Harem: Multiple lovers, no choosing. Each offers unique tension and shared scenes.",
        'mmf': "MMF Throuple: Two men, one woman. Jealousy, rivalry, or camaraderie between all parties.",
        'ffm': "FFM Throuple: Two women, one man. Parallel or shared arcs with emotional and physical tension.",
        'open_relationship': "Open Relationship: Consensual, non-exclusive. Interwoven connections and boundary negotiation.",
        'enemies_to_lovers': "Enemies to Lovers: High-conflict, charged banter that flips into intense passion."
    }
    relationship_type = relationship_type_map.get(story_set['relationship_type'])

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
        'mild': "Mild: Sweet, fade to black. Physical affection implied — no explicit detail.",
        'medium': "Medium: Sensual, steamy, explicit, with foreplay detail, But no direct graphic terms for the sexual acts.",
        'hot': 
            """
            Hot: Fully explicit smut, XXX-rated. 
            You must use direct adult terms: penis, clitoris, vagina, cock, pussy, nipples, moans, thrusts, fluids, cum, orgasm. 
            Always describe penetration, friction, body position, physical sensation, and climax in graphic detail. 
            Never fade to black or imply — show everything physically and emotionally.
            Never use vague words like “his thing” or “her entrance”; always name body parts directly.
            """
    }
    spice = spice_map.get(story_set['spice'])

    author_type_map = {
        'mild': 'romance author who writes sweet, sensual love stories with fade-to-black intimacy.',
        'medium': 'romance author who writes steamy, descriptive sexual scenes with foreplay detail, but avoids graphic, explicit language.',
        'hot': 'smut author who writes XXX rated novels.'
    }
    author_type = author_type_map.get(story_set['spice'])

    persona_map = {
        "sweetheart": "Sweetheart: Warm, innocent -  but eager for more temptation. ",
        "badass": "Badass: Bold, sarcastic fierce.",
        "flirt": "Flirt: Playful, magnetic, witty.",
        "brooding": "Brooding: Guarded, intense, slow to trust.",
        "chaotic": "Wildcard: Impulsive, unpredictable, fun."
    }
    persona = persona_map.get(story_set['persona'])
    
    romantic_interest_personality_map = {
        'protector': "Protector: Strong, loyal. Shows love through actions.",
        'rogue': "Rogue: Teasing, masks true feelings with charm.",
        'softie': "Softie: Gentle, emotionally open.",
        'grump': "Grump: Sarcastic, secretly devoted.",
        'golden': "Golden Retriever: Playful, loyal, warm energy."
    }
    romantic_interest_personality = romantic_interest_personality_map.get(story_set['romantic_interest_personality'])
    
    # Build string for describing romantic interest personalities IF one of the relationship types include more than one romantic interest
    vary_rel_types = ['reverse_harem', 'mmf', 'ffm', 'open_relationship']
    second_rel_personality_options = ""
    if rel_type in vary_rel_types:
        option_num = 1
        for k, v in romantic_interest_personality_map.items():
            second_rel_personality_options += ' ' + str(option_num) + ': ' + v + '\n'
            option_num += 1
        romantic_interest_personality = f"""
        The main romantic interest's personality should be {romantic_interest_personality}. 
        Any additional romantic interest personalities should be creatively chosen from the following list:
        {second_rel_personality_options}"""
    else:
        romantic_interest_personality = f"The main romantic interest's personality should be {romantic_interest_personality}."

    #print('REL PERSONALITY CREATED: ', romantic_interest_personality)
    # Build final user setting map
    user_set = {
        'genre': genre,
        'relationship_type': relationship_type,
        'length': total_blocks,
        'control': num_paragraphs_per_block,
        'spice': spice,
        'persona': persona,
        'romantic_interest_personality': romantic_interest_personality,
        'author_type': author_type
        }
    return user_set


def get_next_story_block(story_set, choice=None):
    userprofile = session.get('user_profile')
    username = ''
    if userprofile:
        username = userprofile['name']
    print(f'{username or "Anon"}: Getting story block...')
    user_set = map_user_set(story_set)
    genre = user_set['genre']
    relationship_type = user_set['relationship_type']
    total_paragraphs = user_set['length']
    paragraphs_per_block = user_set['control']
    spice = user_set['spice']
    author_type = user_set['author_type']
    persona = user_set['persona']
    romantic_interest_personality = user_set['romantic_interest_personality']

    plot_blocks = story_set.get('story')
    if plot_blocks:
        last_block = story_set['story'][-1]
        summary = story_set['story'][-1]['summary']
        user_choice = choice.get('decision')

        paragraphs_used = len(story_set['story']) * paragraphs_per_block
        paragraphs_remaining = total_paragraphs - paragraphs_used
        if paragraphs_remaining <= paragraphs_per_block:
            # Last plot block, wrap up story, no more choices
            prompt = f"""
            You are writing the last {paragraphs_remaining} paragraphs of the conclusion of a story. 

            Write the last part of the story ({paragraphs_per_block} paragraphs), continuing naturally from the reader's choice.
            Let the reader's choice guide the continuation of the next part of the story you are writing now.
            But for now, the next section of the story, which should be {paragraphs_per_block} paragraphs.
            Currently, the story's length is {len(plot_blocks) * paragraphs_per_block} paragraphs long.
            So as the story is now, the story is { ((len(plot_blocks) * paragraphs_per_block) / total_paragraphs) * 100 }% of the way complete.
            This section of the story you write should resolve the absolute final conclusion of the story.
        
            Here is a story summary so far:
            \"{summary}\"

            Last section of the story so far:
            \"{last_block['text']}\"

            The reader chose to:
            \"{user_choice}\"

            Since this is the last final conclusion. There will be no more choices for the reader to make. So you can just put an empty string "" in place for each of the "decision" values.
            Make sure the explicitness and graphic detail is {spice}

            Respond ONLY with a valid JSON object like this 
            (Since this is the last plot story block. There will not be any decisions in the JSON object this time.
            Only put an empty string for the values in each decision key in the JSON object, as shown below):

            {{
            "text": "Next {paragraphs_per_block} paragraph story content...",
            "choices": [
                {{"decision": "", "next": 3}},
                {{"decision": "", "next": 4}}
            ],
            "summary": "Short updated summary of the plot so far."
            }}
            """.strip()


        else:
            # Continue story development for next plot block
            prompt = f"""
            You are continuing the next {paragraphs_per_block} paragraphs of a story.

            This story will be built in sections. 
            So the overall length of this story when completed should total to {total_paragraphs} paragraphs.
            But for now, write the next section of the story, which should be {paragraphs_per_block} paragraphs.
            Currently, the story's length is {len(plot_blocks) * paragraphs_per_block} paragraphs long. The total length of the story when it's done will need to be {total_paragraphs}.
            So as the story is now, the story is { ((len(plot_blocks) * paragraphs_per_block) / total_paragraphs) * 100 }% of the way complete.
            So, based on where the plot's current phase is (intro, arc, or conclusion), the next section you will write needs to reflect the current phase of the story, while progressing the plot based on the percentage of the story's progress, keeping in mind the total paragraph limit for the story.

            Here is a story summary so far:
            \"{summary}\"

            Last section of the story so far:
            \"{last_block['text']}\"

            The reader chose to:
            \"{user_choice}\"

            Write the next part of the story ({paragraphs_per_block} paragraphs), continuing naturally from the reader's choice.
            This block should reflect the current arc: build tension toward the climax. The final conclusion should resolve within the last {paragraphs_per_block} paragraphs.
            Let the reader's choice guide the continuation of the next part of the story you are writing now. But make sure the explicitness and graphic detail is {spice}

            Important:
            - The total length of this story should be about {total_paragraphs} paragraphs total.
            - You have already used approximately {paragraphs_used} paragraphs.
            - That means you have ~{paragraphs_remaining} paragraphs left to wrap up the full arc.
            - Plan the pacing and narrative arcs accordingly — don’t stall or wrap up too fast.

            """.strip()

    else:
        # Initial story creation, first plot block
        prompt = f"""
        Write the opening of the story, which should be {paragraphs_per_block} paragraphs.

        This story will be built in sections, like a choose your own adventure style book. 
        So the overall length of this story when completed should total to {total_paragraphs} paragraphs.
        But for now, only write the opening of the story, 
        But keep in mind the overall story intro, arc, and conclusion in the future will still be limited to {total_paragraphs} So ensure the plot structure follows this pace.

        Make sure the explicitness and graphic detail is {spice}

        """.strip()


    STATIC_SYSTEM_INSTRUCTIONS = f"""
        You are an interactive “choose-your-own-adventure” {author_type}.
        
        Write a story with the level of explicitness and sensuality: {spice}
        Genre of the story should be: {genre}
        Relationship type(s) in story: {relationship_type}
        FMC Persona: {persona}
        Personality types of love interest(s): {romantic_interest_personality}
        
        • Never mention, foreshadow, or allude to decision points or branching paths in the narrative itself;  
        all branching lives strictly in the `"choices"` array.

        Respond ONLY with a valid JSON object like this (replace the placeholder values of 'Choice A' and 'Choice B' in the JSON object example with the actual brief descriptions of each choice.):
        - Do NOT use generic placeholders such as "Choice A" or "Choice B". Each "decision" value must be a clear, descriptive option reflecting the actual branch.
        - For the summary: Think: “From the very beginning of the tale through the end of this block, what is the one‐paragraph full plot arc?” Do **not** summarize only the paragraphs you just wrote—summarize the entire arc so far.  

        {{
        "text": "Your story content here in {paragraphs_per_block} paragraphs...",
        "choices": [
            {{"decision": "Choice A", "next": 1}},
            {{"decision": "Choice B", "next": 2}}
        ],
        "summary": "Brief cumulative summary of events so far.",
        "title": "Make up a brief title for this story."
        }}

    """.strip()

    #check_moderation(STATIC_SYSTEM_INSTRUCTIONS)
    #print('STATIC: ', STATIC_SYSTEM_INSTRUCTIONS)
    #print()
    #print('PROMPT: ', prompt)

    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": STATIC_SYSTEM_INSTRUCTIONS},
            {"role": "user", "content": prompt}
        ],
        temperature=0.9,
        response_format={ "type": "json_object" }
    )
    try:
        text = response.choices[0].message.content
        if not text:
            flash("Oops! Something went wrong. Try selecting your choice again to continue your story.")
            raise ValueError("OPenAI response returned no content.")
        story_block = json.loads(text)
    except (json.JSONDecodeError, TypeError, ValueError) as e:
        print("JSON parsing error:", e)
        print("Response text was:", text)
        flash("Oops! Something went wrong. Try selecting your choice again to continue your story.")
        return story_set
    
    story_set['story'].append(story_block)
    return story_set


# Check if prompt violates OpenAI's moderation policies
def check_moderation(input_text: str):
    response = openai_client.moderations.create(
        model="omni-moderation-latest",
        input=input_text
    )
    flagged = response.results[0].flagged
    categories = response.results[0].categories
    print(response, categories)
    return flagged, categories


# cron handler to remove non registered account user's stories from database (triggered daily)
@app.route('/cron/cleanup_anonymous', methods=['GET'])
def cleanup_anonymous():
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    q = ds_client.query(kind='Story')
    q.add_filter('user', '=', None)
    q.add_filter('created_at', '<', cutoff)
    keys = [e.key for e in q.fetch()]
    if keys:
        ds_client.delete_multi(keys)
    return ('', 204)


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True)

    #app.run(debug=True)