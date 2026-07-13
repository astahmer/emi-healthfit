# Emi HealthFit — User Guide

A step-by-step guide for using the gym assistant. No coding required.

## What you need

- Your iPhone
- The **Hevy** app
- The **HealthExportKit** app (to export Apple Health as JSON)
- The Worker URL (the web address of your assistant — it looks like `https://emi-healthfit.xxx.workers.dev`)

> The Worker URL is printed in the terminal when the app is deployed. Ask the person who set it up for the link.

---

## Quick overview

1. **Export your data** once a week (or whenever you want updated advice).
2. **Upload** the two files to the assistant.
3. **Chat** with the assistant to ask workout questions.

The assistant remembers everything you upload, so you can chat right after uploading or come back later.

---

## Method A — Web app (easiest on computer)

### 1. Open the app

Go to the Worker URL in any browser. You will see two tabs: **Upload data** and **Chat**.

### 2. Paste the Worker URL

If the URL is not already filled in, paste it into the **Worker URL** box at the top. It is saved for next time.

### 3. Export Apple Health data

On your iPhone:

1. Open **HealthExportKit**.
2. Tap **Export JSON**.
3. Save the file somewhere you can access on your computer (iCloud Drive, AirDrop, email, etc.).

The file name looks like `health-export-json-2022-01-01-...json`.

### 4. Export Hevy data

In the Hevy app:

1. Go to **Profile** → **Settings**.
2. Tap **Export & Import Data**.
3. Tap **Export Workouts**.
4. Save the `workout_data.csv` file.

### 5. Upload both files

On the web app:

1. Switch to the **Upload data** tab.
2. Select the HealthExportKit JSON file under **HealthExportKit JSON**.
3. Select the Hevy CSV file under **Hevy CSV**.
4. Tap **Upload**.
5. Wait for the green success message. It will tell you how many workouts and sets were imported.

### 6. Chat

1. Switch to the **Chat** tab.
2. Type a question, for example:
   - "what should I train today?"
   - "how is my recovery?"
   - "how is my squat progress?"
   - "what did I do last chest day?"
3. Tap **Send**.
4. The assistant answers based on your latest data.

---

## Method B — iPhone Shortcut (upload from phone)

This is the fastest way to upload after a workout because you never leave your phone.

### One-time setup

Create a new iOS Shortcut with these actions:

1. **Receive** files from Share Sheet (turn on "Show in Share Sheet").
2. **Get contents of URL**
   - URL: `https://your-worker-url/ingest`
   - Method: POST
   - Request Body: Form
   - Add two fields:
     - `health_export` → the HealthExportKit JSON file
     - `hevy_export` → the Hevy CSV file

Because Shortcuts can only share one file at a time easily, the simplest version is:

1. Export Health JSON and Hevy CSV to the Files app.
2. Select both files in Files.
3. Tap Share → run the Shortcut.

The Shortcut uploads both files and shows a quick confirmation.

### Using it

1. Export both files (same as Method A steps 3 and 4).
2. Share them to the Shortcut.
3. Done.

After uploading, open the web app to chat.

---

## Method C — OpenWebUI

If you already use a self-hosted OpenWebUI, you can talk to the assistant inside the same chat interface.

### Add a custom tool

In OpenWebUI:

1. Go to **Workspace** → **Tools**.
2. Create a new tool, for example `gym_assistant`.
3. Paste a tool that calls your Worker URL:

```python
import requests

def gym_assistant(question: str) -> str:
    """Ask the personal gym assistant based on Apple Health and Hevy data."""
    response = requests.post(
        "https://your-worker-url/chat",
        json={"message": question},
        timeout=60,
    )
    return response.json()["response"]
```

4. Save the tool and enable it in a conversation.
5. Type `@gym_assistant what should I train today?` or ask the model to use it.

The model will call the assistant and read the answer back to you.

---

## What the recovery label means

Every chat answer includes a small recovery badge:

- **Ready** — good recovery, you can train hard.
- **Caution** — moderate recovery, consider lighter volume.
- **Rest needed** — prioritize sleep and rest.

It is calculated from your last 7 days of sleep, recent workout strain, and activity.

---

## Troubleshooting

### "Please enter the Worker URL first"

Paste the Worker URL into the box at the top of the web app. If you do not have it, ask the person who deployed the app.

### Upload says "Upload failed"

- Make sure both files are selected.
- Check that the Worker URL is correct.
- Try uploading just one file first to see which one is causing the issue.

### Assistant says "No recent workouts found"

Upload your data first. The assistant only knows what you have uploaded.

### Chat responses are slow

The first Workers AI response can take a few seconds. If it is very slow, the free Workers AI queue may be busy. Try again in a moment.

### OpenWebUI tool returns an error

Make sure OpenWebUI can reach the internet and that the Worker URL in the tool is correct.

---

## Tips

- Upload fresh data once a week for the best advice.
- You can upload only the Health JSON or only the Hevy CSV if one is missing.
- The assistant does not delete old data when you upload new files; it merges them.
