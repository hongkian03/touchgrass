# Proposed onboarding and feature disclosure copy

Draft product copy requiring implementation and verification. These controls do
not currently exist merely because this document exists. A policy link or Chrome
site-permission prompt alone does not explain online AI processing.

## Website access and local recording

**Choose where Touchgrass works**

On websites you enable, Touchgrass reads relevant prompt and model controls to
record your AI activity and display coaching. Local usage history includes
prompt snippets, timestamps and model information. It can operate while the
Touchgrass panel is closed.

Proposed action: **Enable selected websites**.

## Online coaching

**Get online model-choice coaching**

Online coaching sends your draft text and limited recent conversation context to
our backend and configured AI providers, including Chalk/Jev and Groq where used.
This can happen while you type, before you send the message to the AI website.
The providers process this information to assess task suitability and routing.

Read our [Privacy Policy]([PRIVACY_POLICY_URL]) for providers, retention and controls.

Proposed unchecked consent: **I agree to send this information for online coaching.**

Proposed actions: **Enable online coaching** / **Not now**.

Implement the actual consent gate before collecting/transmitting this information.
If local-only functionality cannot be supported, do not promise a local-only path.

## Automatic integration repair

**Help Touchgrass adapt when a website changes**

If the page integration stops working, automatic repair sends a page snapshot,
selector details and a draft excerpt to our backend. These may contain conversation
content or personal information. Daytona and Factory's configured AI services
process the inputs to repair the integration. Cleaning and redaction do not
guarantee removal of all personal information; some repair files remain on the
backend as described in our privacy policy.

Proposed unchecked consent: **I agree to send page snapshots and draft excerpts
for automatic integration repair.**

Proposed actions: **Enable automatic repair** / **Not now**.

## Export analysis

**Analyze a conversation export**

The file you select is uploaded to our backend and processed using Daytona and
Factory's configured AI services. It may contain your full conversation history
and identifying information. A redacted copy is used in parts of the workflow,
but redaction may not remove every sensitive detail. Results and job-related
files may remain on the backend. Review the file before uploading.

Proposed action: **Upload and analyze**.

## Carry a prompt to another website

**Open this prompt on another AI website?**

The destination may receive the prompt through its URL. That text may be saved
in browser history or the destination's logs. Where prefill is unavailable,
Touchgrass may copy the prompt to your clipboard for you to paste.

Proposed action: **Open with this prompt** / **Cancel**.

## Reset wording

**Reset usage and score**

This resets the main usage history and score in this Chrome profile. It keeps
your name and selected platforms and does not delete all extension storage or
server-side records. For server-data requests, contact [PRIVACY_EMAIL].

Use this narrower wording until a complete deletion feature is implemented.
