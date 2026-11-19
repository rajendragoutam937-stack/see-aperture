# Aperture Vision — Groq edition

A deployable Node.js + vanilla HTML/CSS/JS starter (all files in one folder) for an AI vision platform.

## Features included
- Groq-powered chat through a server-side API route.
- Groq vision requests for uploaded JPG/PNG/WEBP images.
- Browser-based object detection using TensorFlow.js + COCO-SSD.
- Live camera object detection (camera permission required; localhost or HTTPS).
- Dark/light theme.
- Browser speech input where supported.
- Responsive layout.
- API status indicator.

## Required Render environment variable
`GROQ_API_KEY` = your private Groq API key.

Optional model overrides:
- `GROQ_CHAT_MODEL` (default: `openai/gpt-oss-120b`)
- `GROQ_VISION_MODEL` (default: `qwen/qwen3.8-27b`)

If your Groq account does not have access to a default model, set the optional model variable to a currently available model from your Groq Console. Model availability and free usage limits can change.

## Run locally
1. Install Node.js 20 or newer.
2. In this folder run `npm install`.
3. Set `GROQ_API_KEY` in your terminal environment.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Deploy to Render
1. Push the contents of this folder to a GitHub repository.
2. In Render, create a **Web Service** connected to that repository.
3. Runtime: Node.
4. Build command: `npm install`
5. Start command: `npm start`
6. Add `GROQ_API_KEY` under Environment.
7. Deploy.

Render supplies the `PORT` variable automatically.

## Important notes
- Never put the Groq API key in `app.js`, HTML, or any client-side file.
- Browser object detection is local and uses COCO-SSD. It detects common object classes, not every possible object.
- Camera access requires HTTPS in production (Render provides HTTPS).
- The Groq vision model must support image input. If a model name is unavailable or unsupported, change `GROQ_VISION_MODEL` in Render.
- This starter does not include a medical diagnostic feature. Health-related answers are general information only.
- External browser libraries are loaded from jsDelivr; an internet connection is required.


## Inline image search

When someone asks Aperture Vision to show/find images or pictures (for example, "show me images of solar panels"), the app searches Wikimedia Commons and displays image thumbnails directly inside the chat. Selecting an image opens its original Commons page, where the creator and license information can be checked. No extra API key is required for this feature.

The chat renderer also displays direct image URLs and Markdown image syntax returned in assistant messages as inline images. Some third-party hosts may block embedding; in that case, the chat shows a source link instead.

## Live camera + visual chat update

Aperture Vision now uses a live two-column workspace: the camera/image view on the left and the AI chat on the right. While the camera is active, COCO-SSD runs repeatedly in the browser and draws object labels and confidence boxes over the live feed. When a user sends a chat message, the browser captures the latest camera frame, resizes it, and sends it with the conversation to the `/api/chat` endpoint so the configured Groq vision model can answer based on what is currently visible. Uploaded pictures are also automatically analyzed for common objects and attached to chat questions.

Camera access requires HTTPS (Render provides HTTPS) and browser permission. The first object-detection run downloads the COCO-SSD model, so it may take a little longer. No additional environment variable is required. Keep `GROQ_API_KEY` configured in Render; `GROQ_VISION_MODEL` can be used to override the default vision model.
