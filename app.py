import logging
logging.basicConfig(level=logging.INFO)

import os
import requests
import io
import uuid
from datetime import datetime, timezone, timedelta
import pytz

import json
from dotenv import load_dotenv
load_dotenv()

import stripe

# Google Cloud Datastore
from google.cloud import datastore, secretmanager
ds_client = datastore.Client(project="choosey-473722")

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
from openai import OpenAI
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


@app.route('/')
def index():
    return jsonify({'status': 'Choosey API is running'})


@app.route('/api/v1/narrate', methods=['POST', 'GET'])
def narrate():
    print(f'NARRATE TRIGGERED {ELEVEN_API_KEY}>>>')
    if request.method == 'POST':
        data = request.get_json() or {}
        story_text = data.get('text')
        voice_id = data.get('voice_id', "JBFqnCBsd6RMkjVDRZzb")
    else:
        story_text = request.args.get('text')
        voice_id = request.args.get('voice_id', "JBFqnCBsd6RMkjVDRZzb")

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
        user, error = get_user_id()
        if error:
            return error
    else:
        user = None
    data = request.get_json() or {}
    success_url = data.get('success_url') or (os.getenv('FRONTEND_URL', 'http://localhost:3000') + '/account_page?success=true')
    cancel_url = data.get('cancel_url') or (os.getenv('FRONTEND_URL', 'http://localhost:3000') + '/account_page?canceled=true')
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
    user, error = get_user_id()
    if error:
        return error

    key = ds_client.key('UserProfile', user)
    profile = ds_client.get(key)
    customer_id = profile.get("stripe_customer_id") if profile else None
    if not customer_id:
        return jsonify({"error": "No Stripe customer found for user"}), 400

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=os.getenv("FRONTEND_URL", "http://localhost:3000") + "/account_page"
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
    
    # if event_type == 'checkout.session.expired':
    #     uid = data_obj.get('client_reference_id')
    #     if uid:
    #         # Delete Firebase user
    #         try:
    #             firebase_auth.delete_user(uid)
    #         except Exception as e:
    #             print(f"Error deleting Firebase user: {e}")
    #         try:
    #             # Delete all stories for user
    #             query = ds_client.query(kind='Story')
    #             query.add_filter('user', '=', uid)
    #             keys = [entity.key for entity in query.fetch()]
    #             if keys:
    #                 ds_client.delete_multi(keys)
    #         except Exception as e:
    #             logging.error(f'Error deleting storeis for user {uid}: {e}')
    #         try:
    #             # Delete the user's profile entry
    #             profile_key = ds_client.key('UserProfile', uid)
    #             ds_client.delete(profile_key)
    #         except Exception as e:
    #             logging.error(f'Error deleting UserProfile for user {uid}: {e}')
    #     else:
    #         logging.warning("stripe webhook: No client_reference_id (Firebase UID) found in checkout.session.expired event")
    #     return ('', 200)

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
    if not auth_header:
        return None, (jsonify({"error": "Missing Authorization header"}), 401)
    if auth_header.startswith('Bearer '):
        id_token = auth_header.split('Bearer ')[1]
    else:
        id_token = auth_header.strip()
    try:
        decoded_token = firebase_auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        return uid, None
    except Exception as e:
        logging.error(f"Token verification failed: {e}")
        return None, (jsonify({"error": "Invalid or expired token"}), 401)
    

@app.route('/api/v1/my_stories', methods=['GET'])
def my_stories():
    user, error = get_user_id()
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
    user, error = get_user_id()
    if error:
        return error
    anon_id = None
    if not user:
        anon_id = request.args.get('anon_id')
    story_set = get_story(int(story_id), user, anon_id)
    if story_set:
        return jsonify({
            "story_id": story_id,
            "story_set": story_set
        }), 201
    return jsonify({"error": "Story not found"}), 404


@app.route('/api/v1/get_user_profile', methods=['GET'])
def get_user_profile():
    user, error = get_user_id()
    if error:
        return error
    user_profile = get_user_profile(user)
    return jsonify(user_profile)


@app.route('/api/v1/delete_account', methods=['DELETE'])
def delete_account():
    user, error = get_user_id()
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
    # Delete all stories for user
    query = ds_client.query(kind='Story')
    query.add_filter('user', '=', user)
    keys = [entity.key for entity in query.fetch()]
    if keys:
        ds_client.delete_multi(keys)
    # Delete the user's profile entry
    profile_key = ds_client.key('UserProfile', user)
    ds_client.delete(profile_key)
    return jsonify({"success": True}), 200


@app.route('/api/v1/update_account', methods=['PUT'])
def update_account():
    user, error = get_user_id()
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
    ds_client.put(profile)
    return jsonify({
        "success": True,
        "profile": {
            "name": profile.get('name', ''),
            "birthdate": profile.get('birthdate', ''),
            "email": profile.get('email', '')
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
                'voice_id': profile_entity.get('voice_id', 'JBFqnCBsd6RMkjVDRZzb'),
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
def create_story():
    user, error = get_user_id()
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400
    
    anon_id = None
    if not user:
        anon_id = data.get('anon_id')
        if not anon_id:
            return jsonify({"error": "Missing anon_id for anonymous user."}), 400

    story_id, story_set = create_story(data, user, anon_id)
    if story_id:
        return jsonify({
            "story_id": story_id,
            "story_set": story_set
        }), 201
    return jsonify({"error": "Failed to create story. Please try again."}), 500


def create_story(form_data, user=None, anon_id=None):
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
    story_set = get_next_story_block(story_set, None)
    story_set['title'] = story_set['story'][0]['title']
    del story_set['story'][0]['title']

    if user:
        story_id = save_story_db(story_set, user)
    else:
        # store as anonymous user
        story_id = save_story_anonymous(story_set, anon_id)

    update_story_db(story_id, story_set)
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
    user, error = get_user_id()
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
    
    user, error = get_user_id()
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
    story_set = get_next_story_block(story_set, choice)
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
    
    user, error = get_user_id()
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
    
    user, error = get_user_id()
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
    user, error = get_user_id()
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
    print('KEY:', key)

    try:
        entity = ds_client.get(key)
    except Exception as e:
        logging.error(f"Datastore get failed: {e}")
        return None
    print('GET STORY TRIGGERED >>>')
    print('USER:', user)
    print('ANON:', anon_id)
    print('STORY ID:', story_id)
    #print('ENTITY:', entity)
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
            'anon_id': anon_id
        }
        #print('STORY SET:', story_set)
        return story_set
    print('Get Story Returned NONE >>>')
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