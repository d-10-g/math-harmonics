<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/5114d0f5-131c-4a6f-aebb-0eaadcbe7d55

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run as Native MacOS App

1. Install dependencies (if you haven't already):
   `npm install`
2. Start the desktop app in development mode:
   `npm run electron:start`
3. Build the native MacOS application (requires building the Vite app first, which is handled automatically):
   `npm run electron:build`

The compiled MacOS app will be available in the `release` folder.
