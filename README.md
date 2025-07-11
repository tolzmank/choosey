# choosey
AI driven choose your own adventure style book creation app

Google App Engine Link:
https://choosey-463422.uc.r.appspot.com/
# Choosey

**Choosey** is an AI-driven *Pick Your Own Adventure* style story creation app. Users can instantly start creating and reading interactive stories, make plot choices, and customize genre, relationship style, and spice level. Anonymous users can try the app with limited daily usage and are encouraged to sign up to save and continue their stories anytime.

## 🚀 Live Demo

👉 [Try Choosey on Google App Engine](https://choosey-463422.uc.r.appspot.com/)

## 📚 Features

- ✨ AI-generated branching stories with multiple choices
- ✅ Anonymous mode with daily limits — no account required to get started
- 🔑 Sign up to save your stories and pick up where you left off
- 🔄 Continue, restart, or reset your story at any point
- 🎨 Customize your story’s genre, relationship type, length, control, spice level, and main character style
- 🌗 Toggle light/dark reading themes and adjust text appearance

## 🛠️ Tech Stack

- Python + Flask backend
- Google Cloud Datastore for storage
- Firebase Authentication
- Hosted on Google App Engine

## 🗃️ Project Structure

```
choosey/
├── app.yaml
├── main.py (or app.py)
├── static/
│   ├── style.css
│   ├── script.js
│   └── images/
├── templates/
│   └── index.html
└── README.md
```

## ⚙️ Running Locally

1. Clone this repo:
   ```
   git clone https://github.com/yourusername/choosey.git
   cd choosey
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Add your `.env` with necessary environment variables.

4. Run locally:
   ```
   python app.py
   ```

## 📤 Deployment

Choosey runs on [Google App Engine](https://cloud.google.com/appengine).  
To deploy:
```
gcloud app deploy
```

## 📜 License

This project is for educational and demo purposes.

---
[Choosey Live](https://choosey-463422.uc.r.appspot.com/)