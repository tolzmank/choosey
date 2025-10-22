import logging
import threading
logging.basicConfig(level=logging.INFO)
import re
import os
import requests
import random
import io
import uuid
from datetime import datetime, timezone, timedelta
import pytz
from mutagen.mp3 import MP3
import json
from dotenv import load_dotenv
load_dotenv()

import stripe

CHOOSEY_FRONTEND_BASE_URL = "https://choosey--choosey-473722.us-central1.hosted.app"

# Google Cloud Datastore
from google.cloud import datastore, secretmanager
ds_client = datastore.Client(project="choosey-473722")

# Google Cloud Storage Bucket
from google.cloud import storage
storage_client = storage.Client(project="choosey-473722")

# Firebase Authentication
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

client = secretmanager.SecretManagerServiceClient()
response = client.access_secret_version(request={"name": os.environ["FIREBASE_ADMIN_CREDENTIALS"]})
secret_payload = response.payload.data.decode("UTF-8")
cred_dict = json.loads(secret_payload)
cred = credentials.Certificate(cred_dict)
firebase_admin.initialize_app(cred)

# Stripe secret key from Google Secret Manager
stripe_response = client.access_secret_version(request={"name": os.environ["STRIPE_API_KEY"]})
stripe.api_key = stripe_response.payload.data.decode("UTF-8")

stripe_response = client.access_secret_version(request={"name": os.environ["STRIPE_PRICE_ID"]})
STRIPE_PRICE_ID = stripe_response.payload.data.decode("UTF-8")

stripe_response = client.access_secret_version(request={"name": os.environ["STRIPE_WEBHOOK"]})
STRIPE_WEBHOOK = stripe_response.payload.data.decode("UTF-8")

# OpenAI
from openai import OpenAI, BadRequestError, APIError, RateLimitError
response = client.access_secret_version(request={"name": os.environ["OPENAI_API_KEY_CHOOSEY"]})
openai_client = OpenAI(api_key=response.payload.data.decode("UTF-8"))

from flask import Flask, Blueprint, render_template, redirect, url_for, request, Response, jsonify, session, flash
app = Flask(__name__)
response = client.access_secret_version(request={"name": os.environ["FLASK_SECRET_KEY"]})
app.secret_key = response.payload.data.decode("UTF-8")
from flask_cors import CORS
CORS(app)

# ElevenLabs Voice Narration
narration_bp = Blueprint("narration", __name__)
from elevenlabs import stream
from elevenlabs.client import ElevenLabs
elevenlabs = ElevenLabs()
secret_response = client.access_secret_version(request={"name": os.environ["ELEVEN_LABS_API_KEY"]})
ELEVEN_API_KEY = secret_response.payload.data.decode("UTF-8")
ELEVEN_BASE_URL = "https://api.elevenlabs.io/v1"

# Hume AI Narration
from hume import HumeClient
from hume.tts import PostedUtterance, PostedUtteranceVoiceWithName, PostedUtteranceVoiceWithId
secret_response = client.access_secret_version(request={"name": os.environ["HUME_API_KEY"]})
HUME_API_KEY = secret_response.payload.data.decode("UTF-8")


@app.route('/')
def index():
    return jsonify({'status': 'Choosey API is running'})


@app.route('/api/v1/update_scroll_progress', methods=['POST'])
def update_scroll_progress():
    user, anon_id, error = get_user_id()
    if error and "anon_id" not in request.headers:
        return error
    
    data = request.get_json() or {}
    story_id = data.get('story_id')
    scroll_position = float(data.get('scroll_position'))
    scroll_height = float(data.get('scroll_height', 1))

    if not story_id:
        return jsonify({'error': 'Missing story_id'}), 400

    key = ds_client.key('Story', int(story_id))
    entity = ds_client.get(key)
    if not entity:
        return jsonify({'error': 'Story not found'}), 404
    
    story_user = entity.get('user')
    story_anon_id = entity.get('anon_id')
    if (user and story_user == user) or (anon_id and story_anon_id == anon_id):
        # Save position and height to calculate relative scroll progress
        ratio = scroll_position / scroll_height if scroll_height > 0 else 0.0
        entity['scroll_position'] = scroll_position
        entity['scroll_height'] = scroll_height
        entity['scroll_ratio'] = ratio
        entity['last_modified'] = datetime.now(timezone.utc)
        ds_client.put(entity)
        return jsonify({"success": True}), 200
    return jsonify({'error': 'Unauthorized: user or anon_id not associated with story_id'}), 403


def generate_audiobook_text(text_block, story_id, user, anon_id, hume_client, voice_id, voice_speed, retries):
    try:
        utterances=[
            PostedUtterance(
                text=text_block,
                voice=PostedUtteranceVoiceWithId(id=voice_id, provider='HUME_AI',),
                speed=voice_speed,
                description=get_acting_instructions(text_block, story_id, user, anon_id),
            )
        ]
        response = hume_client.tts.synthesize_file_streaming(utterances=utterances)
        
        if response:
            log_api_usage(
                user=user,
                anon_id=anon_id,
                provider='hume_ai',
                model='hume_ai',
                prompt_tokens=0,
                completion_tokens=len(text_block),
                story_id=story_id,
                endpoint='generate_audiobook_text'
            )
            return response
        elif retries:
            print(f'No response from generate audio surplus text. Retrying... [{retries}] attempted text block snippet: {text_block[:80]}')
            return generate_audiobook_text(text_block, story_id, user, anon_id, hume_client, voice_id, voice_speed, retries=retries-1)
        else:
            print('Attempted text block FAILED, snippet:', {text_block[:80]})
            print(f'Response from generate audio surplus text failed. No response received after retries')
    except Exception as e:
            if retries:
                print(f'Failed generate audio surplus text. Retrying... [{retries}] attempted text block snippet: {text_block[:80]}')
                return generate_audiobook_text(text_block, story_id, user, anon_id, hume_client, voice_id, voice_speed, retries=retries-1)
            else:
                print(f"❌ Audiobook generation failed after retries: {e}")
                app.logger.error(f"Hume story block audio generation failed: {e}")
    return None
    


@app.route('/api/v1/generate_audiobook/<int:story_id>', methods=['POST'])
def generate_audiobook(story_id):
    print('GENERATE AUDIOBOOK TRIGGERED >>>')
    print('STORY ID RECEIVED:', story_id)
    user, anon_id, error = get_user_id()
    if error and 'anon_id' not in request.headers:
        return error
    user_profile = get_user_profile(user)
    story_set = get_story(story_id, user, anon_id)
    voice_id = user_profile.get('voice_id', '176a55b1-4468-4736-8878-db82729667c1')
    voice_speed = user_profile.get('voice_speed', 1.0)
    
    audio_chunks = []
    hume_client = HumeClient(api_key=HUME_API_KEY,)
    surplus_text_queue = []
    print("Synthesizing audiobook via Hume...")
    for story_block in story_set['story']:
        story_text = story_block['text']

        # Generate audio for any text that did not fit from the previous story block
        while surplus_text_queue:
            print('Generating from surplus text queue...')
            text_block = surplus_text_queue.pop(0)
            surplus_response = generate_audiobook_text(text_block, story_id, user, anon_id, hume_client, voice_id, voice_speed, retries=3)
            if surplus_response:
                for chunk in surplus_response:
                    audio_chunks.append(chunk)

        # If story block text goes over max char limit, split up story block text into < 5000 char blocks and queue
        max_char_limit = 5000
        if len(story_text) > max_char_limit - 10:   # 10 character buffer
            print(f'Text block over max limit, chars: {len(story_text)} / {max_char_limit - 10}' )
            words = story_text.split()
            current_line = ''

            for word in words:
                if len(current_line) + len(word) + 1 <= max_char_limit:
                    current_line += (" " if current_line else "") + word
                else:
                    surplus_text_queue.append(current_line)
                    current_line = word
            if current_line:
                surplus_text_queue.append(current_line)
            print(f'Added {len(surplus_text_queue)} text blocks to surplus queue.')
            if surplus_text_queue:
                story_text = surplus_text_queue.pop(0)

        try:
            response = generate_audiobook_text(story_text, story_id, user, anon_id, hume_client, voice_id, voice_speed, retries=3)
            if response:
                for chunk in response:
                    audio_chunks.append(chunk)
            
        except Exception as e:
            print(f"❌ Audiobook generation failed: {e}")
            app.logger.error(f"Hume audiobook generation failed: {e}")
            # return jsonify({"error": str(e)}), 500

    if not audio_chunks:
        print('Failed to synthesize audio')
        return jsonify({'error': 'Failed to synthesize audio'}), 500
    
    audio_data = b"".join(audio_chunks)

    # Save to Google Cloud Storage Bucket
    print('Uploading to GCS bucket...')
    bucket_name = os.getenv('GCS_AUDIO_BUCKET', 'choosey-473722.appspot.com')
    bucket = storage_client.bucket(bucket_name)
    filename=f'{story_id}_{uuid.uuid4().hex}.mp3'
    blob = bucket.blob(filename)
    blob.upload_from_string(audio_data, content_type='audio/mpeg')
    blob.make_public()

    # Get audio file duration
    audio_file = io.BytesIO(audio_data)
    audio_info = MP3(audio_file)
    audio_duration = int(audio_info.info.length)

    # Update Datastore record
    key = ds_client.key('Story', story_id)
    entity = ds_client.get(key)
    entity['audiobook_url'] = blob.public_url
    entity['audiobook_progress'] = 0
    entity['audiobook_duration'] = audio_duration
    ds_client.put(entity)
    print(f"✅ Audiobook saved to: {blob.public_url}")
    return jsonify({"audiobook_url": blob.public_url}), 200
    
    
@app.route('/api/v1/get_audiobook/<int:story_id>', methods=['GET'])
def get_audiobook(story_id):
    user, anon_id, error = get_user_id()
    if error and 'anon_id' not in request.headers:
        return error
    key = ds_client.key('Story', int(story_id))
    entity = ds_client.get(key)
    if not entity:
        return jsonify({"error": "Story not found"}), 404
    
    audiobook_url = entity.get('audiobook_url')
    audiobook_progress = entity.get('audiobook_progress', 0)
    audiobook_duration = entity.get('audiobook_duration', 0)
    return jsonify({
        'title': entity.get('title'),
        'audiobook_url': audiobook_url, 
        'audiobook_progress': audiobook_progress,
        'audiobook_duration': audiobook_duration
        }), 200


@app.route('/api/v1/update_audiobook_progress', methods=['POST'])
def update_audiobook_progress():
    user, anon_id, error = get_user_id()
    if error and "anon_id" not in request.headers:
        return error
    
    data = request.get_json() or {}
    story_id = data.get('story_id')
    progress = data.get('progress_in_seconds', 0)

    if not story_id:
        return jsonify({"error": "Missing story_id"}), 400

    key = ds_client.key("Story", int(story_id))
    entity = ds_client.get(key)
    if not entity:
        return jsonify({"error": "Story not found"}), 404
    
    entity['audiobook_progress'] = progress
    print('AUDIOBOOK PROGRESS:', progress)
    ds_client.put(entity)
    return jsonify({'success': True}), 200


@app.route('/api/v1/narrate_hume', methods=['GET'])
def narrate_hume():
    print(f'NARRATE HUME TRIGGERED: {HUME_API_KEY} >>>')
    try:
        user, anon_id, error = get_user_id()
        story_text = request.args.get('text')
        story_id = request.args.get('story_id')
        voice_id = request.args.get('voice_id', '176a55b1-4468-4736-8878-db82729667c1')
        voice_speed = float(request.args.get('voice_speed', 1.0))

        print('VOICE_ID:', voice_id)
        if not story_text:
            return jsonify({"error": "No text provided"}), 400
        
        utterances=[
            PostedUtterance(
                text=story_text,
                voice=PostedUtteranceVoiceWithId(id=voice_id, provider='HUME_AI',),
                speed=voice_speed,
                description=get_acting_instructions(story_text, story_id, user, anon_id),
            )
        ]

        def generate():
            print('Generate voice started...')
            hume_client = HumeClient(api_key=HUME_API_KEY,)
            response = hume_client.tts.synthesize_file_streaming(utterances=utterances)

            if response:
                log_api_usage(
                    user=user,
                    anon_id=anon_id,
                    provider='hume_ai',
                    model='hume_ai',
                    prompt_tokens=0,
                    completion_tokens=len(story_text),
                    story_id=story_id,
                    endpoint='narrate_hume'
                )
                print('Audio Response Received...')
                for chunk in response:
                    yield chunk
            else:
                print('No Audio Response Received')
        return Response(generate(), mimetype='audio/mpeg')

    except Exception as e:
        print(f'Hume narration failed: {e}')
        app.logger.error(f'Hume narrate failed: {e}')
        return jsonify({'error': str(e)}), 500


def get_acting_instructions(story_text, story_id, user, anon_id):
    acting_prompt = f"""
    Given this section of a novel, write a one-sentence performance direction describing how it should be spoken
    (tone, pacing, emotion). Keep it short and descriptive, like: "The voice is breathy, aroused, with rising tension."

    Text:
    {story_text}
    """
    try:
        acting_response = openai_client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {'role': 'system', 'content': 'You generate voice performance directions for text-to-speech story telling narration.'},
                {'role': 'user', 'content': acting_prompt}
            ],
            temperature=0.7
        )
        log_api_usage(
            user=user,
            anon_id=anon_id,
            provider='openai',
            model='gpt-4o-mini',
            prompt_tokens=acting_response.usage.prompt_tokens,
            completion_tokens=acting_response.usage.completion_tokens,
            story_id=story_id,
            endpoint='get_acting_instructions'
        )
        acting_instructions = acting_response.choices[0].message.content.strip()
        #print('VOICE ACTING INSTRUCTIONS: ', acting_instructions)
        return acting_instructions
    except Exception as e:
        print('Could not get acting instructions, using default...')
        return 'The voice is breathy, passionate, and romantic.'


@app.route('/api/v1/narrate_elevenlabs', methods=['GET'])
def narrate_elevenlabs():
    print(f'NARRATE TRIGGERED ELEVEN LABS: {ELEVEN_API_KEY}>>>')
    user, anon_id, error = get_user_id()
    story_text = request.args.get('text')
    story_id = request.args.get('story_id')
    voice_id = request.args.get('voice_id', '176a55b1-4468-4736-8878-db82729667c1')
    voice_speed = float(request.args.get('voice_speed', 1.0))

    # Check if voice_id is a Hume AI id, if so, switch to default Elevenlabs voice_id
    if '-' in voice_id:
        voice_id = 'JBFqnCBsd6RMkjVDRZzb'

    if not story_text:
        return jsonify({'error': 'No text provided'}), 400
    
    def generate():
        try:
            with requests.post(
                f'{ELEVEN_BASE_URL}/text-to-speech/{voice_id}/stream',
                headers={
                    'xi-api-key': ELEVEN_API_KEY,
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                },
                json={
                    'text': story_text,
                    'model_id': 'eleven_flash_v2',
                    'voice_speed': voice_speed,
                    'voice_settings': {
                        'stability': 0.0,           # Low stability (closer to 0.0): The voice will sound more expressive, dynamic, and varied — but might sometimes drift in tone, pacing, or even clarity.
                                                    # High stability (closer to 1.0): The voice stays very consistent and “robotically” stable — less emotional nuance, but reliable and predictable.
                        'similarity_boost': 0.1     # Low similarity boost (closer to 0.0): More natural and adaptive — the model may add variation or slight drift away from the reference voice.
                                                    # High similarity boost (closer to 1.0): The output strongly tries to mimic the base voice exactly, but sometimes at the cost of expressiveness.
                    }
                },
                stream=True
            ) as r:
                r.raise_for_status()
                for chunk in r.iter_content(chunk_size=4096):
                    if chunk:
                        yield chunk

            log_api_usage(
                user=user,
                anon_id=anon_id,
                provider='elevenlabs',
                model='elevenlabs',
                prompt_tokens=0,
                completion_tokens=len(story_text),
                story_id=story_id,
                endpoint='narrate_elevenlabs'
            )
        except Exception as e:
            logging.error(f'ElevenLabs narrate failed: {e}')
            return

    try:
        return Response(generate(), mimetype='audio/mpeg')
    except Exception as e:
        logging.error(f'ElevenLabs narrate failed: {e}')
        return jsonify({'error': str(e)}), 500


def set_user_unlimited(user_id, source="stripe", customer_id=None, subscription_id=None, expiry_dt=None, promo_code=None):
    key = ds_client.key('UserProfile', user_id)
    profile = ds_client.get(key) or datastore.Entity(key=key)
    profile['sub_status'] = 'unlimited'
    profile['sub_source'] = 'source'
    if subscription_id:
        profile['sub_status'] = 'unlimited'
        profile['sub_source'] = source
        profile['sub_id'] = subscription_id
    if expiry_dt:
        profile['sub_expiry'] = expiry_dt
    if promo_code:
        profile['promo_code'] = promo_code
    if customer_id:
        profile['stripe_customer_id'] = customer_id
    ds_client.put(profile)
    return profile


@app.route('/api/v1/create_checkout_session', methods=['POST'])
def create_checkout_session():
    # Check for Authorization header. Only call get_user_id() if present.
    auth_header = request.headers.get('Authorization')
    if auth_header:
        user, anon_id, error = get_user_id()
        if error:
            return error
    else:
        user = None
    data = request.get_json() or {}
    success_url = data.get('success_url') or (CHOOSEY_FRONTEND_BASE_URL + '/account_page?success=true')
    cancel_url = data.get('cancel_url') or (CHOOSEY_FRONTEND_BASE_URL + '/account_page?canceled=true')
    if not STRIPE_PRICE_ID:
        return jsonify({'error': 'Stripe price not configured'}), 500
    try:

        client_reference_id = data.get('uid')
        checkout_session = stripe.checkout.Session.create(
            mode='subscription',
            line_items=[{'price': STRIPE_PRICE_ID, 'quantity': 1}],
            allow_promotion_codes=True,
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=client_reference_id,
        )
        return jsonify({'id': checkout_session.id, 'url': checkout_session.url}), 200
    except Exception as e:
        logging.exception('Stripe checkout session creation failed')
        return jsonify({'error': str(e)}), 400


@app.route("/api/v1/create_customer_portal_session", methods=["POST"])
def create_customer_portal_session():
    user, anon_id, error = get_user_id()
    if error:
        return error
    data = request.get_json() or {}
    api_base_url = data.get('api_base_url', CHOOSEY_FRONTEND_BASE_URL)
    print('API BASE URL USED:', api_base_url)

    key = ds_client.key('UserProfile', user)
    profile = ds_client.get(key)
    customer_id = profile.get("stripe_customer_id") if profile else None
    if not customer_id:
        return jsonify({"error": "No Stripe customer found for user"}), 400

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=api_base_url + "/account_page"
    )
    return jsonify({"url": session.url})


@app.route('/api/v1/stripe_webhook', methods=['POST'])
def stripe_webhook():
    print('STRIPE WEBHOOK TRIGGERED >>>')
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature', '')
    try:
        if STRIPE_WEBHOOK:
            event = stripe.Webhook.construct_event(payload=payload, sig_header=sig_header, secret=STRIPE_WEBHOOK)
        else:
            event = json.loads(payload.decode('utf-8'))
    except Exception as e:
        logging.error(f'Webhook verification failed: {e}')
        return ('', 400)
    
    event_type = event.get('type')
    data_obj = event.get('data', {}).get('object', {})
    print(f'EVENT TYPE: {event_type}')
    if event_type == 'checkout.session.completed' and data_obj.get('mode') == 'subscription':
        # Use client_reference_id as the Firebase UID
        uid = data_obj.get('client_reference_id')
        customer_id = data_obj.get('customer')
        subscription_id = data_obj.get('subscription')
        discounts = data_obj.get('discounts', [])
        expiry_dt = None
        promo_code = None
        try:
            if subscription_id:
                sub = stripe.Subscription.retrieve(subscription_id)
                cpe = sub.get('current_period_end')
                if cpe:
                    expiry_dt = datetime.fromtimestamp(int(cpe), tz=timezone.utc)
                if discounts:
                    promo_id = discounts[0].get('promotion_code')
                    if promo_id:
                        promo = stripe.PromotionCode.retrieve(promo_id)
                        promo_code = promo.get('code')
        except Exception as e:
            logging.error(f'Failed to retrieve subscription {subscription_id}: {e}')
        if uid:
            set_user_unlimited(uid, 
                               source='stripe', 
                               customer_id=customer_id, 
                               subscription_id=subscription_id, 
                               expiry_dt=expiry_dt, 
                               promo_code=promo_code
                               )
            return ('', 200)
        else:
            logging.warning("Stripe webhook: No client_reference_id (Firebase UID) found in checkout.session.completed event")
        # fallback: nothing more to do
        return ('', 200)

    # Handle cancellations or non-payment
    if event_type in ('customer.subscription.deleted', 'customer.subscription.updated'):
        subscription = data_obj
        subscription_id = subscription.get('id')
        status = subscription.get('status')
        if status == 'canceled':
            try:
                query = ds_client.query(kind='UserProfile')
                query.add_filter('sub_id', '=', subscription_id)
                for prof in query.fetch():
                    prof['sub_status'] = 'free'
                    prof['sub_source'] = ''
                    ds_client.put(prof)

            except Exception as e:
                logging.error(f'Failed to downgrade user for subscription {subscription_id}: {e}')
            return ('', 200)
        return ('', 200)
    
    if event_type == 'invoice.payment_succeeded':
        try:
            subscription_id = data_obj.get('subscription')
            customer_id = data_obj.get('customer')
            if subscription_id:
                sub = stripe.Subscription.retrieve(subscription_id)
                expiry_dt = datetime.fromtimestamp(int(sub['current_period_end']), tz=timezone.utc)
                query = ds_client.query(kind='UserProfile')
                query.add_filter('sub_id', '=', subscription_id)
                for prof in query.fetch():
                    prof['sub_status'] = 'unlimited'
                    prof['sub_source'] = 'stripe'
                    prof['sub_expiry'] = expiry_dt
                    ds_client.put(prof)
        except Exception as e:
            logging.error(f'Failed to process invoice.payment_succeeded: {e}')
        return ('', 200)
    
    if event_type in ('invoice.payment_failed', 'customer.subscription.deleted', 'customer.subscription.updated'):
            subscription_id = data_obj.get('subscription') or data_obj.get('id')
            status = data_obj.get('status')
            if status in ('canceled', 'unpaid', 'past_due'):
                try:
                    query = ds_client.query(kind='UserProfile')
                    query.add_filter('sub_id', '=', subscription_id)
                    for prof in query.fetch():
                        prof['sub_status'] = 'free'
                        prof['sub_source'] = ''
                        ds_client.put(prof)
                        print(f'Downgraded user for subscription {subscription_id}')
                except Exception as e:
                    logging.error(f'Failed to downgrade user for subscription {subscription_id}: {e}')
            return ('', 200)



    return ('', 200)


def get_user_id():
    auth_header = request.headers.get('Authorization')
    anon_id = request.headers.get('anon_id')
    if not auth_header:
        return None, anon_id, None
    if auth_header.startswith('Bearer '):
        id_token = auth_header.split('Bearer ')[1]
    else:
        id_token = auth_header.strip()
    try:
        decoded_token = firebase_auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        return uid, None, None
    except Exception as e:
        logging.error(f"Token verification failed: {e}")
        return None, anon_id, (jsonify({"error": "Invalid or expired token"}), 401)
    

@app.route('/api/v1/my_stories', methods=['GET'])
def my_stories():
    user, anon_id, error = get_user_id()
    if error:
        return error
    user_stories = get_all_stories_for_user(user)
    return jsonify(user_stories)


@app.route('/api/v1/anon_stories', methods=['GET'])
def anon_stories():
    anon_id = request.args.get('anon_id')
    print(f'ANON STORIES TRIGGERED >>> {anon_id}')
    user_stories = get_all_stories_for_anon_user(anon_id)
    return jsonify(user_stories)


def get_all_stories_for_anon_user(anon_id):
    if not anon_id:
        return []
    query = ds_client.query(kind='Story')
    query.add_filter('anon_id', '=', anon_id)
    all_stories = list(query.fetch())
    sorted_stories = sorted(all_stories, key=lambda x: x.get('last_modified'), reverse=True)
    result = []
    for entity in sorted_stories:
        story = dict(entity)
        story['id'] = entity.key.id
        result.append(story)
    return result


@app.route('/set_timezone', methods=['POST'])
def set_timezone():
    data = request.get_json()
    timezone = data.get('timezone')

    if timezone:
        session['timezone'] = timezone
        return ('', 204)
    else:
        print("Invalid timezone data")
        return ('Invalid timezone', 400)


@app.route('/api/v1/read_story/<int:story_id>', methods=['GET'])
def read_story(story_id):
    user, anon_id, error = get_user_id()
    if error:
        return error
    if not user and not anon_id:
        return jsonify({"retry": True}), 202
    story_set = get_story(int(story_id), user, anon_id)
    if story_set:
        return jsonify({
            "story_id": story_id,
            "story_set": story_set
        }), 201
    return jsonify({"error": "Story not found"}), 404


@app.route('/api/v1/get_user_profile', methods=['GET'])
def get_user_profile():
    user, anon_id, error = get_user_id()
    if error:
        return error
    user_profile = get_user_profile(user)
    return jsonify(user_profile)


@app.route('/api/v1/delete_account', methods=['DELETE'])
def delete_account():
    user, anon_id, error = get_user_id()
    if error:
        return error
    # Cancel Stripe subscription if exists
    try:
        key = ds_client.key('UserProfile', user)
        profile = ds_client.get(key)
        if profile and profile.get('sub_id'):
            stripe.Subscription.delete(profile['sub_id'])
    except Exception as e:
        if profile and profile.get('sub_status') == 'unlimited':
            logging.error(f'Error canceling Stripe subscription: {e}')

    # Delete Firebase user
    try:
        firebase_auth.delete_user(user)
    except Exception as e:
        print(f"Error deleting Firebase user: {e}")

    # Delete audiobooks
    query = ds_client.query(kind='Story')
    query.add_filter('user', '=', user)
    for entity in query.fetch():
        audiobook_url = entity.get('audiobook_url')
        if audiobook_url and 'storage.googleapis.com' in audiobook_url:
            try:
                filename = audiobook_url.split('/')[-1]
                bucket_name = os.getenv('GCS_AUDIO_BUCKET', 'choosey-473722.appspot.com')
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(filename)
                if blob.exists():
                    blob.delete()
                    print(f"Deleted audiobook file: {filename}")
            except Exception as e:
                logging.error(f"Failed to delete audiobook file {filename}: {e}")
    # Delete all stories for user
    keys = [entity.key for entity in query.fetch()]
    if keys:
        ds_client.delete_multi(keys)

    # Delete the user's profile entry
    profile_key = ds_client.key('UserProfile', user)
    ds_client.delete(profile_key)
    return jsonify({"success": True}), 200


@app.route('/api/v1/update_account', methods=['PUT'])
def update_account():
    user, anon_id, error = get_user_id()
    if error:
        return error
    # Fetch or create the UserProfile entity
    key = ds_client.key('UserProfile', user)
    profile = ds_client.get(key) or datastore.Entity(key=key)
    # Update fields only if present in incoming data
    data = request.get_json() or {}
    if 'name' in data:
        profile['name'] = data['name'].strip() if isinstance(data['name'], str) else data['name']
    if 'birthdate' in data:
        profile['birthdate'] = data['birthdate'].strip() if isinstance(data['birthdate'], str) else data['birthdate']
    if 'email' in data:
        profile['email'] = data['email']
        
    if 'voice_id' in data:
        profile['voice_id'] = data['voice_id']
    else:
        profile['voice_id'] = "15f594d3-0683-4585-b799-ce12e939a0e2"

    if 'voice_speed' in data:
        profile['voice_speed'] = data['voice_speed']
    else:
        profile['voice_speed'] = 1.0
    
    if 'turn_offs' in data:
        profile['turn_offs'] = data['turn_offs']
    else:
        profile['turn_offs'] = ''

    ds_client.put(profile)
    return jsonify({
        "success": True,
        "profile": {
            "name": profile.get('name', ''),
            "birthdate": profile.get('birthdate', ''),
            "email": profile.get('email', ''),
            "voice_id": profile.get('voice_id'),
            "voice_speed": profile.get('voice_speed'),
            "turn_offs": profile.get('turn_offs')
        }
    }), 200


def get_user_profile(user):
    if user:
        try:
            key = ds_client.key('UserProfile', user)
            profile_entity = ds_client.get(key) or {}
            user_profile = {
                'name': profile_entity.get('name', ''),
                'birthdate': profile_entity.get('birthdate', ''),
                'voice_id': profile_entity.get('voice_id', '15f594d3-0683-4585-b799-ce12e939a0e2'),
                'voice_speed': profile_entity.get('voice_speed', 1.0),
                'turn_offs': profile_entity.get('turn_offs'),
                'sub_status': profile_entity.get('sub_status', 'free'),
                'sub_source': profile_entity.get('sub_source', ''),
                'sub_id': profile_entity.get('sub_id', ''),
                'sub_expiry': profile_entity.get('sub_expiry', '')
            }
            return user_profile
        except Exception as e:
            print(f"Error getting user profile: {e}")
    return {}


@app.route('/api/v1/create_story', methods=['POST'])
def create_story_api():
    user, anon_id, error = get_user_id()
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400
    
    anon_id = None
    if not user:
        anon_id = data.get('anon_id')
        if not anon_id:
            return jsonify({"error": "Missing anon_id for anonymous user."}), 400
    try:
        story_id, story_set = create_story(data, user, anon_id)
        if story_id:
            return jsonify({
                "story_id": story_id,
                "story_set": story_set
            }), 201
    except Exception as e:
        err_str = str(e).lower()
        user_err_msg = "Could not generate your story right now. Please try again later."
        if "content_policy" in err_str or "sensitive content" in err_str or "safety system" in err_str:
            user_err_msg = "Your story settings contain content that can't be generated. Please try adjusting the phrasing or topic."
        elif "invalid request" in err_str:
            user_err_msg = "Your story input seems too long or formatted incorrectly. Try simplifying or shortening it."
        return jsonify({"error": user_err_msg, "debug": str(e)}), 400


def create_story(form_data, user=None, anon_id=None):
    print('CREATE STORY TRIGGERED >>>')
    print('USER:', user)
    print('ANON ID:', anon_id)

    # Map user input
    story_set = {
        'genre': form_data.get('genre'),
        'relationship_type': form_data.get('relationship_type'),
        'length': form_data.get('length'),
        'control': form_data.get('control'),
        'spice': form_data.get('spice'),
        'persona': form_data.get('persona'),
        'romantic_interest_personality': form_data.get('romantic_interest_personality'),
        'story': []
    }
    #print()
    #print('STORY_SET START:', story_set)
    story_set, err = get_next_story_block(story_set, anon_id, None)
    if err:
        raise Exception(err)

    if story_set:
        story_set['title'] = story_set['story'][0]['title']
        del story_set['story'][0]['title']

    if user:
        story_id = save_story_db(story_set, user)
    else:
        # store as anonymous user
        story_id = save_story_anonymous(story_set, anon_id)

    update_story_db(story_id, story_set)
    if story_set['control'] == 'full':
        story_set = get_full_story(story_id, story_set, user, anon_id)
    return story_id, story_set


def save_story_anonymous(story_set, anon_id=None):
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


@app.route('/api/v1/migrate_anon', methods=['POST'])
def migrate_anon():
    user, anon_id, error = get_user_id()
    if error:
        return error
    data = request.get_json() or {}
    anon_id = data.get('anon_id')
    migrate_anon_stories_to_user(anon_id, user)
    return jsonify({"success": True})


def migrate_anon_stories_to_user(anon_id, user):
    if not anon_id or not user:
        return
    query = ds_client.query(kind='Story')
    query.add_filter('anon_id', '=', anon_id)
    for entity in query.fetch():
        entity['user'] = user
        entity['anon_id'] = None
        ds_client.put(entity)


def save_story_db(story_set, user):
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


@app.route('/api/v1/choose_path', methods=['POST'])
def choose_path():
    print('CHOOSE PATH API TRIGGERED')
    data = request.get_json()
    if not data:
        print('NO DATA')
        return jsonify({"error": "Missing JSON body"}), 400
    
    user, anon_id, error = get_user_id()
    anon_id = None
    print('USER:', user)
    if not user:
        print('NO USER')
        anon_id = data.get('anon_id')
        if not anon_id:
            print('NO ANON ID')
            return jsonify({"error": "Missing user or anon_id for anonymous user."}), 400
        
    story_id = int(data.get('story_id'))
    print('STORY_ID>>>>>:', story_id, type(story_id))
    if not story_id:
        print('NO STORY ID')
        return jsonify({"error": "Missing story_id."}), 400
    
    story_id, story_set = choose_path(story_id, data, user, anon_id)
    return jsonify({
        'story_id': story_id,
        'story_set': story_set
    }), 200


def choose_path(story_id, form_data, user, anon_id):
    story_set = get_story(story_id, user, anon_id)

    decision = form_data['decision']
    next = form_data['next']
    choice = {'decision': decision, 'next': next}
    story_set, err = get_next_story_block(story_set, anon_id, choice)
    update_story_db(story_id, story_set)
    return story_id, story_set


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


@app.route('/api/v1/start_over', methods=['POST'])
def start_over():
    print('Start over from beginning triggered')
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400
    
    user, anon_id, error = get_user_id()
    anon_id = None
    if not user:
        anon_id = data.get('anon_id')
        if not anon_id:
            return jsonify({"error": "Missing anon_id for anonymous user."}), 400
        
    story_id = data.get('story_id')
    if not story_id:
        return jsonify({"error": "Missing story_id."}), 400
    
    story_id, story_set = start_over(story_id, user, anon_id)
    if not story_set:
        return jsonify({"error": "Story not found or could not be reset."}), 404

    return jsonify({
        'story_id': story_id,
        'story_set': story_set
    }), 200


def start_over(story_id, user, anon_id):
    story_set = get_story(story_id, user, anon_id)
    if story_set:
        initial_story_block = story_set['story'][0]
        story_set['story'] = [initial_story_block]
        update_story_db(story_id, story_set)
        return story_id, story_set
    return story_id, {}


@app.route('/api/v1/go_back', methods=['POST'])
def go_back():
    print('Go back one story block triggered')
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400
    
    user, anon_id, error = get_user_id()
    anon_id = None
    if not user:
        anon_id = data.get('anon_id')
        if not anon_id:
            return jsonify({"error": "Missing anon_id for anonymous user."}), 400
        
    story_id = data.get('story_id')
    if not story_id:
        return jsonify({"error": "Missing story_id."}), 400
    
    story_id, story_set = go_back(story_id, user, anon_id)
    if not story_set:
        return jsonify({"error": "Story not found or could not be modified."}), 404

    return jsonify({
        'story_id': story_id,
        'story_set': story_set
    }), 200


def go_back(story_id, user, anon_id):
    story_set = get_story(story_id, user, anon_id)
    if story_set['story'] and len(story_set['story']) > 1:
        last_story_block = story_set['story'][-1]
        story_set['story'].remove(last_story_block)
        update_story_db(story_id, story_set)
    return story_id, story_set


@app.route('/delete_all_stories', methods=['POST'])
def delete_all_stories():
    query = ds_client.query(kind='Story')
    keys = [entity.key for entity in query.fetch()]
    ds_client.delete_multi(keys)
    print(f'All stories deleted')
    return ''


@app.route('/api/v1/delete_anon_story/<int:story_id>', methods=['DELETE'])
def delete_anon_story(story_id):
    anon_id = request.args.get('anon_id')
    success = delete_anonymous_story(story_id, anon_id)
    if success:
        return '', 204
    return '', 404


def delete_anonymous_story(story_id, anon_id):
    if story_id and anon_id:
        key = ds_client.key('Story', story_id)
        try:
            entity = ds_client.get(key)
        except Exception as e:
            logging.error(f"Datastore get failed: {e}")
            return False
        
        if entity and entity.get('anon_id') == anon_id:
            # Delete the Datastore entity
            ds_client.delete(key)
            print(f'Story ID: {story_id} deleted')
            return True
        return False


@app.route('/api/v1/delete_story/<int:story_id>', methods=['DELETE'])
def delete_story(story_id):
    user, anon_id, error = get_user_id()
    if error:
        return error
    
    success = delete_user_story(story_id, user)
    if success:
        return '', 204
    return '', 404


def delete_user_story(story_id, user):
    if story_id and user:
        key = ds_client.key('Story', story_id)
        try:
            entity = ds_client.get(key)
        except Exception as e:
            logging.error(f"Datastore get failed: {e}")
            return False
        
        if entity and entity.get('user') == user:
            # Delete the Datastore entity
            ds_client.delete(key)
            print(f'Story ID: {story_id} deleted')
            
            # Delete the audiobook (if exists)
            audiobook_url = entity.get('audiobook_url')
            if audiobook_url and 'storage.googleapis.com' in audiobook_url:
                try:
                    filename = audiobook_url.split('/')[-1]
                    bucket_name = os.getenv('GCS_AUDIO_BUCKET', 'choosey-473722.appspot.com')
                    bucket = storage_client.bucket(bucket_name)
                    blob = bucket.blob(filename)
                    if blob.exists():
                        blob.delete()
                        print(f'Deleted audiobook file: {filename}')
                except Exception as e:
                    logging.error(f'Failed to delete audiobook file {filename}: {e}')
            return True
        return False
    

def get_all_stories_for_user(user):
    if not user:
        return []
    query = ds_client.query(kind='Story')
    query.add_filter('user', '=', user)
    all_stories = list(query.fetch())
    sorted_stories = sorted(all_stories, key=lambda x: x.get('last_modified'), reverse=True)
    result = []
    for entity in sorted_stories:
        story = dict(entity)
        story['id'] = entity.key.id
        result.append(story)
    return result


def get_story(story_id, user, anon_id):
    key = ds_client.key('Story', int(story_id))
    try:
        entity = ds_client.get(key)
    except Exception as e:
        logging.error(f"Datastore get failed: {e}")
        return None
    print('GET STORY TRIGGERED >>>')
    print('USER:', user)
    print('ANON:', anon_id)
    print('STORY ID:', story_id)
    if entity and (user and entity.get('user') == user) or (anon_id and entity.get('anon_id') == anon_id):
        story_set = {
            'story_id': entity.key.id,
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
            'last_modified': entity.get('last_modified'),
            'anon_id': anon_id,
            'audiobook_progress': entity.get('audiobook_progress', 0),
            'audiobook_url': entity.get('audiobook_url'),
            'audiobook_duration': entity.get('audiobook_duration', 0),
            'scroll_position': entity.get('scroll_position', 0),
            'scroll_height': entity.get('scroll_height', 1),
            'scroll_ratio': entity.get('scroll_ratio', 0.0)
        }
        #print('STORY SET:', story_set)
        return story_set
    print('Get Story Returned NONE >>>')
    return None


def clean_custom_input(user_input: str, min_length: int = 2) -> str | None:
    """
    Validate and clean custom story option input.
    Returns None if input is nonsense (blank, too short, random letters).
    Otherwise returns the stripped input.
    """

    if not user_input:
        return None

    # Strip leading/trailing whitespace
    cleaned = user_input.strip()

    # Empty after stripping → invalid
    if not cleaned:
        return None

    # Too short to be meaningful (default <2 characters)
    if len(cleaned) < min_length:
        return None

    # Reject if all characters are the same, like "aaaa"
    if len(set(cleaned.lower())) == 1:
        return None

    # Reject if it's just gibberish letters with no vowels
    if re.fullmatch(r"[bcdfghjklmnpqrstvwxyz]+", cleaned.lower()):
        return None

    # Passed all checks
    return cleaned


def get_surprise_selections(user_set, story_set, turn_offs, user, anon_id):
    print('GET SURPRISE SELECTIONS TRIGGERED...')
    explicitness_map = {
        "mild": "Mild: Sweet, romantic, fade-to-black intimacy. Focuses on emotion, longing, and gestures.",
        "medium": "Medium: Steamy and sensual. Some detail in foreplay and passion, but not graphic.",
        "hot": "Hot: Fully explicit, XXX-rated. Novel will include direct adult terms and graphic sexual detail."
    }
    explicitness = explicitness_map.get(story_set['spice'])

    explicitness_request = ''
    if explicitness:
        explicitness_request = f'The romance novel will have an explicitnes level of {explicitness}. So make the category selections fitting to this level of explicitness.'
    
    turn_offs_request = ''
    if turn_offs:
        turn_offs_request = f'DO NOT include anything involving: {turn_offs}.'
    
    current_selections = {}
    selections_needed = {}

    for k, v in user_set.items():
        if v == 'surprise':
            selections_needed[k] = v
        else:
            current_selections[k] = v

    if not selections_needed:
        return user_set, story_set
    print()
    print('START USER SET:', user_set)
    print()
    print('SELECT NEEDED:', selections_needed)
    prompt = f"""
    Invent a cohesive set of romance story settings. These will later be used to create a romance novel.
    Pick ONE for each category below, making sure they feel like they belong in the same world and tone. 
    Be creative — you can invent unique personalities/physical descriptors, genres, or archetypes.
    {explicitness_request}
    {turn_offs_request}

    1. Genre — pick a unique subgenre of romance novels or something imaginative.
    2. Relationship type — how the sexual dynamic plays out between the characters.
    3. Persona — the female main character’s personality, physical characteristics, and vibe.
    4. Romantic interest personality — the main character’s romantic partner’s personality, physical characteristics, and vibe.

    Return ONLY a JSON object like:
    {{
      "genre": "string",
      "relationship_type": "string",
      "persona": "string",
      "romantic_interest_personality": "string"
    }}
    """
    print('SURPRISE PROMPT:', prompt)
    resp = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You invent creative, cohesive romance novel story setups."},
            {"role": "user", "content": prompt}
        ],
        temperature=1.0,   # max creativity
        response_format={ "type": "json_object" }
    )
    log_api_usage(
        user=user,
        anon_id=anon_id,
        provider='openai',
        model='gpt-4o-mini',
        prompt_tokens=resp.usage.prompt_tokens,
        completion_tokens=resp.usage.completion_tokens,
        story_id=story_set.get('story_id'),
        endpoint='get_surprise_selections'
    )
    try:
        selections = json.loads(resp.choices[0].message.content)
        if selections:
            # Update story set with generated surprise values
            for k, v in story_set.items():
                if v == 'surprise' and k in selections:
                    story_set[k] = selections[k]

            for k,v in selections_needed.items():
                if k in selections:
                    selections_needed[k] = selections[k]
            mod_user_set = current_selections | selections_needed
            #print('GEN SELECTS:', selections)
            print('MOD USER SET:', mod_user_set)
            print('OpenAI generated SURPRISE selections successfully!')
            return mod_user_set, story_set
    except Exception as e:
        print("❌ Failed to parse surprise selections:", e)
        print("❌ JSON decode failed:", e, "Raw content:", resp.choices[0].message.content)
    print('OpenAI Failed to generate SURPRISE selections.')
    # include random selection from the regular mapped set, if openai fails
    print('OpenAI failed to return surprise selections, selections is None')
    return user_set, story_set


def get_estimated_paragraph_count(story_set):
    words_per_para = 90
    count = 0
    if story_set:
        for story_block in story_set:
            words = story_block['text'].split()
            count += len(words)
            paragraph_count = round(count / words_per_para)
        print('PARAGRAPHS:', paragraph_count)
        return paragraph_count
    return 0


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
    if story_set['genre'] in genre_map:
        genre = genre_map.get(story_set['genre'])
    else:
        genre = clean_custom_input(story_set['genre'])
        if not genre:
            story_set['genre'] = 'surprise'
            genre = story_set['genre']

    relationship_type_map = {
        'traditional': "Traditional Romance: Single romantic interest, deep emotional arc, steady growth to commitment.",
        'reverse_harem': "Reverse Harem: Multiple lovers, no choosing. Each offers unique tension and shared scenes.",
        'mmf': "MMF Throuple: Two men, one woman. Jealousy, rivalry, or camaraderie between all parties.",
        'ffm': "FFM Throuple: Two women, one man. Parallel or shared arcs with emotional and physical tension.",
        'open_relationship': "Open Relationship: Consensual, non-exclusive. Interwoven connections and boundary negotiation.",
        'enemies_to_lovers': "Enemies to Lovers: High-conflict, charged banter that flips into intense passion."
    }
    if story_set['relationship_type'] in relationship_type_map:
        relationship_type = relationship_type_map.get(story_set['relationship_type'])
    else:
        relationship_type = clean_custom_input(story_set['relationship_type'])
        if not relationship_type:
            story_set['relationship_type'] = 'surprise'
            relationship_type = story_set['relationship_type']

    # Overall length map (total paragraphs for story)
    plot_length_map = {
        'quicky': 24,
        'novella': 96,
        'novel': 496,
        'epic': 992
    }
    print('length map:', story_set['length'])
    total_blocks = plot_length_map.get(story_set['length'])

    # Control map (paragraphs per block "user decision")
    control_map = {
            'full': 60,
            'low': 8,
            'medium': 4,
            'high': 2
        }
    print('control story set:', story_set['control'])
    num_paragraphs_per_block = control_map.get(story_set['control'])
    if num_paragraphs_per_block > total_blocks:
        num_paragraphs_per_block = total_blocks
    
    spice_map = {
        'mild': "Mild: Sweet, fade to black. Physical affection implied — no explicit detail.",
        'medium': "Medium: Sensual, steamy, explicit, with foreplay detail, But no direct graphic terms for the sexual acts.",
        'hot': 
            """
            Hot: Fully explicit smut, XXX-rated. 
            You must use direct adult terms: penis, clitoris, vagina, cock, pussy, nipples, moans, thrusts, fluids, cum, orgasm, and any other words typically associated with adult level content. 
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
        "sweetheart": "Sweetheart: Warm, innocent -  but eager for more temptation.",
        "badass": "Badass: Bold, sarcastic fierce.",
        "flirt": "Flirt: Playful, magnetic, witty.",
        "brooding": "Brooding: Guarded, intense, slow to trust.",
        "chaotic": "Wildcard: Impulsive, unpredictable, fun."
    }
    if story_set['persona'] in persona_map:
        persona = persona_map.get(story_set['persona'])
    else:
        persona = clean_custom_input(story_set['persona'])
        if not persona:
            story_set['persona'] = 'surprise'
            persona = story_set['persona']
    
    romantic_interest_personality_map = {
        'protector': "Protector: Strong, loyal. Shows love through actions.",
        'rogue': "Rogue: Teasing, masks true feelings with charm.",
        'softie': "Softie: Gentle, emotionally open.",
        'grump': "Grump: Sarcastic, secretly devoted.",
        'golden': "Golden Retriever: Playful, loyal, warm energy."
    }
    if story_set['romantic_interest_personality'] in romantic_interest_personality_map:
        romantic_interest_personality = romantic_interest_personality_map.get(story_set['romantic_interest_personality'])
    else:
        romantic_interest_personality = clean_custom_input(story_set['romantic_interest_personality'])
        if not romantic_interest_personality:
            story_set['romantic_interest_personality'] = 'surprise'
            romantic_interest_personality = story_set['romantic_interest_personality']
    
    # Build string for describing romantic interest personalities IF one of the relationship types include more than one romantic interest
    vary_rel_types = ['reverse_harem', 'mmf', 'ffm', 'open_relationship']
    second_rel_personality_options = ""
    if romantic_interest_personality != 'surprise':
        if rel_type in vary_rel_types:
            option_num = 1
            for k, v in romantic_interest_personality_map.items():
                second_rel_personality_options += ' ' + str(option_num) + ': ' + v + '\n'
                option_num += 1
            romantic_interest_personality = f"""
            The main romantic interest's personality should be {romantic_interest_personality}.
            Make up any additional personalities for the other romantic interests. Ensure they stay consistent based on the previous summaries.
            """
        else:
            romantic_interest_personality = f"The main romantic interest's personality should be {romantic_interest_personality}."
    #Any additional romantic interest personalities should be creatively chosen from the following list:{second_rel_personality_options}
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
    print('USER SET', user_set)
    return user_set


def get_next_story_block(story_set, anon_id, choice=None):
    print('GET NEXT STORY BLOCK TRIGGERED...')
    user, anon_id, error = get_user_id()
    user_profile = get_user_profile(user)
    turn_offs = user_profile.get('turn_offs')
    turn_offs_description = ''
    if turn_offs:
        cleaned = turn_offs.strip()
        if not cleaned or len(cleaned) < 2 or cleaned.isalpha() and len(cleaned) <= 4:
            turn_offs = None
        else:
            turn_offs_description = f"""
            Under no circumstances should the story text include or reference: {turn_offs}. 
            If the text requests them, ignore or redirect to an alternative that still enables the story to flow and makes sense.
            """

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

        paragraphs_used = get_estimated_paragraph_count(story_set['story'])
        paragraphs_remaining = total_paragraphs - paragraphs_used
        if paragraphs_remaining < 0:
            paragraphs_remaining = 0
        if paragraphs_remaining < paragraphs_per_block:
            paragraphs_per_block = paragraphs_remaining

        if paragraphs_remaining <= paragraphs_per_block:
            # Last plot block, wrap up story, no more choices
            prompt = f"""
            You are writing the last {paragraphs_remaining} paragraphs of the conclusion of a story. 

            Write the last part of the story ({paragraphs_remaining} paragraphs), continuing naturally from the reader's choice.
            Let the reader's choice guide the continuation of the next part of the story you are writing now.
            Currently, the story's length is {paragraphs_used} paragraphs long.
            So as the story is now, the story is { round((paragraphs_used / total_paragraphs) * 100) }% of the way complete.
            This section of the story you write should resolve the absolute final conclusion of the story by the end of it.
        
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
            Currently, the story's length is {paragraphs_used} paragraphs long. The total length of the story when it's done will need to be {total_paragraphs}.
            So as the story is now, the story is { round((paragraphs_used / total_paragraphs) * 100) }% of the way complete.
            So, based on where the plot's current phase is (intro, arc, or conclusion), the next section you will write needs to reflect the current phase of the story, while progressing the plot based on the percentage of the story's progress, keeping in mind the total paragraph limit for the story.

            Here is a story summary so far:
            \"{summary}\"

            Last section of the story so far:
            \"{last_block['text']}\"

            The reader chose to:
            \"{user_choice}\"

            Write the next part of the story ({paragraphs_per_block} paragraphs), continuing naturally from the reader's choice.
            Let the reader's choice guide the continuation of the next part of the story you are writing now. But make sure the explicitness and graphic detail is {spice}

            Important:
            - The total length of this story should be about {total_paragraphs} paragraphs total.
            - You have currently used approximately {paragraphs_used} paragraphs.
            - That means you have ~{paragraphs_remaining} paragraphs left to wrap up the full arc.
            - Plan the pacing and narrative arcs accordingly — don’t stall or wrap up too fast.

            """.strip()

    else:
        user_set, story_set = get_surprise_selections(user_set, story_set, turn_offs, user, anon_id)
        genre = user_set['genre']
        relationship_type = user_set['relationship_type']
        total_paragraphs = user_set['length']
        paragraphs_per_block = user_set['control']
        spice = user_set['spice']
        author_type = user_set['author_type']
        persona = user_set['persona']
        romantic_interest_personality = user_set['romantic_interest_personality']

        # Initial story creation, first plot block
        prompt = f"""
        Write the first section of the story, which should be {paragraphs_per_block} paragraphs.

        This story will be built in sections, like a choose your own adventure style book. 
        So the overall length of this story when completed should total to {total_paragraphs} paragraphs.
        But for now, only write the first {paragraphs_per_block} paragraphs of the story, 
        But keep in mind the overall story intro, arc, and conclusion in the future will still be limited to {total_paragraphs}. So ensure the plot structure follows this pace.

        Make sure the explicitness and graphic detail is {spice}

        """.strip()


    STATIC_SYSTEM_INSTRUCTIONS = f"""
        You are an interactive “choose-your-own-adventure” {author_type}.
        
        Write a story with the level of explicitness and sensuality: {spice}
        Genre of the story should be: {genre}
        Relationship type(s) in story: {relationship_type}
        FMC Persona: {persona}
        Personality type(s) or description(s) of love interest(s): {romantic_interest_personality}
        {turn_offs_description}
        
        Include plenty of dialog between characters and physical descriptions of the characters and settings to make the plot feel alive and real.

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

    #print('PROMPT:', prompt)
    #print('STATIC:', STATIC_SYSTEM_INSTRUCTIONS)
    #print()
    #print('MODERA:', check_moderation(prompt))
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": STATIC_SYSTEM_INSTRUCTIONS},
                {"role": "user", "content": prompt}
            ],
            temperature=0.9,
            response_format={ "type": "json_object" }
        )
        log_api_usage(
            user=user,
            anon_id=anon_id,
            provider='openai',
            model='gpt-4o',
            prompt_tokens=response.usage.prompt_tokens,
            completion_tokens=response.usage.completion_tokens,
            story_id=story_set.get('story_id'),
            endpoint='get_next_story_block'
        )
        #print('RESPONSE:', response)
        try:
            text = response.choices[0].message.content
            if not text:
                raise ValueError("OpenAI response returned no content.")
            story_block = json.loads(text)
            story_set['story'].append(story_block)
            return story_set, None
        
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            print("JSON parsing error:", e)
            print("Response text was:", text)
            return story_set, e

    except (BadRequestError, APIError, RateLimitError) as e:
        print("OPENAI ERROR:", e)
        return story_set, e



def get_full_story(story_id, story_set, user, anon_id):
    # Stop recursion when story is over
    if story_set['story'][-1]['choices'][0]['decision'] == '':
        return story_set
    else:
        decision = random.choice(story_set['story'][-1]['choices'])
        story_id, story_set = choose_path(story_id, decision, user, anon_id)
        return get_full_story(story_id, story_set, user, anon_id)


# Check if prompt violates OpenAI's moderation policies
def check_moderation(input_text: str):
    response = openai_client.moderations.create(
        model="omni-moderation-latest",
        input=input_text
    )
    flagged = response.results[0].flagged
    categories = response.results[0].categories
    #print(response, categories)
    return flagged, categories


def log_api_usage(user, anon_id, provider, model, prompt_tokens, completion_tokens, story_id, endpoint):
    def _log_task():
        try:
            entity = datastore.Entity(ds_client.key("TokenUsage"))
            model_price_map = {
                'hume_ai': {
                    'prompt': 0,
                    'completion': 14/140000                     # $14.00 / 140,000 characters
                    },
                'gpt-4o': {
                    'prompt': 2.5/1000000,                      # $2.50  / 1M tokens
                    'completion': 10/1000000                    # $10.00 / 1M tokens
                    },
                'gpt-4o-mini': {
                    'prompt': 0.15/1000000,                     # $0.15  / 1M tokens
                    'completion': 0.6/1000000                   # $0.60  / 1M tokens
                    },
                'elevenlabs': {
                    'prompt': 0,
                    'completion': 22/400000                     # $22.00 / 200,000 credits (@ 0.5 credits per character)
                }
            }
            if model in model_price_map:
                cost_usd = (prompt_tokens * model_price_map[model]['prompt']) + (completion_tokens * model_price_map[model]['completion'])
            else:
                cost_usd = 0
                print('model not found in model cost map')

            entity.update({
                'user_id': user,
                'anon_id': anon_id,
                'provider': provider,
                'model': model,
                'model_cost': cost_usd,
                'endpoint': endpoint,
                'prompt_tokens': prompt_tokens,
                'tokens_completion': completion_tokens,
                'timestamp': datetime.now(timezone.utc),
                'story_id': story_id
            })
            print('TOKENS USED:', prompt_tokens + completion_tokens)
            print('Total Cost:', cost_usd)
            ds_client.put(entity)
        except Exception as e:
            app.logger.error(f"Log API token Usage failed: {e}")
    threading.Thread(target=_log_task, daemon=True).start()


# # cron handler to remove non registered account user's stories from database (triggered daily)
# @app.route('/cron/cleanup_anonymous', methods=['GET'])
# def cleanup_anonymous():
#     cutoff = datetime.now(timezone.utc) - timedelta(days=30)
#     q = ds_client.query(kind='Story')
#     q.add_filter('user', '=', None)
#     q.add_filter('created_at', '<', cutoff)
#     keys = [e.key for e in q.fetch()]
#     if keys:
#         ds_client.delete_multi(keys)
#     return ('', 204)


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True)
