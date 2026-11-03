# Speech input in the AI chat

Choose a speech mode, start recording and stop when finished. Formnaro adds
the recognised text to your draft. Check dimensions, names and units before
sending. Each recording is limited to three minutes. Cancelling leaves the
previous draft intact. A transcription that would make the draft too long
remains separately editable. Closing the chat ends active recording.

## Local Whisper

The portable package includes the recognition engine. Use **Download speech
model** to install the optional 574 MB model once in the portable data folder.
After that, transcription runs on the local CPU without an account, API key
or internet connection. Sending the draft to an AI provider is a separate
action.

The app holds the recording in memory and uses a temporary WAV for Whisper.
It removes temporary audio and text after completion, failure or cancellation.
A crash or power loss can leave files in the Windows temporary
`Formnaro-Speech` directory. If the microphone is unavailable, check Windows
microphone permissions.

The engine and model are verified by SHA-256. The [runtime manifest](../speech-runtime/manifest.json)
identifies the bundled whisper.cpp build and optional model. Runtime license
notices are included under `resources/speech`.

## Online Deepgram

Configure a dedicated Deepgram API key for online speech. Formnaro stores it
encrypted on the local PC. On stop, the app sends the completed recording to
Deepgram Nova-3 for transcription. Usage charges may apply. Cancel stops an
active request. The resulting text remains in the draft until you send it.

## Developer verification

Run `node scripts/setup-speech-runtime.mjs` to prepare the pinned engine
and `npm run test:speech` to check the audio format, process limits and cleanup.
The portable release checks use a synthetic speech fixture. Use a physical
microphone to evaluate the audio capture on a particular system.
