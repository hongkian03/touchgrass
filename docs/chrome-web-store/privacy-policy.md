# Touchgrass Privacy Policy

Effective date: October 18, 2026

Touchgrass is operated by Kian Hong ("we", "us", or "our"). This policy
explains how the Touchgrass Chrome extension and its connected backend handle
information. Contact us at hrggyg@gmail.com with privacy questions or requests.

## What Touchgrass does

Touchgrass helps you understand your AI usage and offers contextual suggestions
on supported AI websites you enable. It can display usage summaries, estimate
environmental impact, suggest a lighter model, analyze a conversation export you
upload, and repair its page integration when a website changes.

Some information stays in your browser. Online coaching, analysis and integration
repair send information to our backend and external service providers. The
extension's panel does not need to be open for enabled page features to operate.

## Information we handle

### Preferences and browser-local history

The extension stores your display name, enabled websites, onboarding preferences,
usage records, scores, streaks, coaching choices, cached integration settings and
backend session information in Chrome extension local storage.

Usage records can include timestamps, AI website/provider, displayed model,
request type, regeneration activity, attachment counts and prompt-text snippets.
The current recorder limits each stored prompt snippet to 2,000 characters and
keeps up to 2,000 usage records; coaching-choice history is also bounded. This is
not a time-based retention period. Browser-local information is not automatically
uploaded in full merely because it is stored, but online features separately
transmit the information described below.

### Online coaching

When you use an enabled AI website, Touchgrass can analyze a draft before it is
sent, as well as around a send action. Requests may include the draft text,
limited recent conversation messages, website, displayed model, conversation
identifier, attachment/context indicators and request identifiers.

Our backend sends relevant content through Chalk's Model Gateway to the
configured classification provider, including Typesafe/Jev where configured, to
assess task suitability. When the Groq routing/fallback feature runs, it receives
a draft excerpt and routing context such as the current and enabled platforms.
Here, a "local" fallback means that the extension initiates the fallback flow;
Groq inference still involves sending content to an external service.

The coaching database is designed to retain decision metadata, timestamps,
pseudonymous session/owner identifiers, input length, a keyed input digest,
recommendation details and interaction events, rather than raw prompt text or
recent-message bodies in those coaching decision records. This does not mean
that content never leaves your device or that other workflows never retain it.

### Conversation exports and analysis

If you upload a conversation export, the file can contain messages, identifiers,
model information and other information included by the exporting service.

In the hosted Daytona workflow, the backend receives the file and uploads it to
a temporary Daytona sandbox for processing. A redacted copy of the export's
structure is used by Factory Droid to develop parsing and analysis code. That
code is run against the original export inside the sandbox, and results are
returned to the backend. Analysis results, job records, logs, generated code and
redacted workspaces may remain in backend storage.

Redaction reduces exposure but is not a guarantee that all identifying or
sensitive information has been removed. Review files before uploading them and
avoid including information that is unnecessary for the analysis.

### Automatic integration repair

If Touchgrass cannot find the expected elements on an enabled website, it can
automatically submit a page-HTML snapshot, selector information, integration
version and a draft excerpt for repair. A snapshot may contain conversation
content or identifying information from the page even after some tags have been
removed in the browser.

Our repair workflow processes the snapshot in Daytona, then uses cleaned page
content and validation inputs with Factory Droid and its configured model
providers to repair the integration. Validation inputs can include draft text;
we do not claim that all repair inputs are anonymous. Cleaned snapshots, repair
inputs, generated files and job results may remain on our backend.

### Opening another AI website

If you choose an action that carries a prompt to another AI website, Touchgrass
may put the prompt into that website's URL or copy it to your clipboard. Prompt
text placed in a URL may become part of browser history and be visible to the
destination website and its logging systems. Clipboard contents are also subject
to your device's clipboard features. This action is initiated by your choice.

### Other network information

Checking an unfamiliar AI-site hostname can send that hostname to Groq. Loading
an icon for a custom website can request the icon from Google's favicon service,
which receives the requested domain and ordinary network information.

Our hosting and service providers may receive connection information such as IP
address, timestamps and request metadata when handling network requests. Error
messages and support communications may also contain information you provide.

## How information is used

We use information to provide usage tracking, summaries, contextual coaching,
user-requested analysis, model/website switching, integration repair, session
handling, troubleshooting and support.

We do not sell your personal information or use AI-site activity or conversation
content for personalized, retargeted or interest-based advertising. We do not use
your conversation content to train our own general-purpose AI models. Our use and transfer of information
handled by Touchgrass will comply with the Chrome Web Store User Data Policy,
including its Limited Use requirements.

We limit use of AI-site activity and conversation content to providing or
improving Touchgrass's described user-facing features. We limit transfers of
that information to service providers needed for those features, security
purposes and applicable legal requirements. We do not permit routine human
review of conversation content. Human access is limited to the exceptions
allowed by the Chrome Web Store User Data Policy, such as reviewing specific
content with your explicit agreement for support, investigating abuse, meeting
legal obligations, or using aggregated, anonymized information for internal
operations.

## Service providers and sharing

Information may be processed by:

| Service | Role and information involved |
| --- | --- |
| Railway | Hosts our backend, persistent application data and operational infrastructure |
| Chalk and the configured classification/model providers | Route and process online coaching content and related request data |
| Groq | Process draft excerpts for routing/fallback and hostnames for AI-site classification when those features run |
| Daytona | Process uploaded exports and page snapshots in temporary computing environments |
| Factory and the model providers used by Droid | Process job instructions, redacted export structure, cleaned page content and repair validation inputs |
| GitHub Pages | Hosts this privacy-policy page and receives ordinary connection information when you visit it |
| Google favicon service | Provide custom-site icons using the requested domain |
| An AI website you choose to open | Receive content you choose to carry to that website |

Providers process information under the applicable service agreements, account
settings and privacy terms. Their retention and permitted uses must not be
assumed to be the same as our application database retention. We may disclose
information when required by applicable law or to address security incidents,
subject to applicable restrictions on user-data use and transfer.

## Retention

| Information | Retention |
| --- | --- |
| Browser-local usage and coaching-choice history | Bounded by record counts; retained until overwritten or removed. Other local settings/caches may remain until removed |
| Backend coaching decisions and associated events | Seven days. Aged records are removed during application startup and certain requests, rather than at a guaranteed exact instant |
| Backend sessions | Expire after the same configured retention period used for coaching decisions; expired records are removed during cleanup |
| Raw files in temporary Daytona sandboxes | The application attempts to delete sandboxes after jobs, including error paths; configured sandbox lifecycle limits provide additional controls |
| Job records, analysis outputs, logs, generated files, cleaned repair inputs and redacted workspaces | Currently have no scheduled automatic expiry and may remain until removed by the operator |
| Infrastructure logs | Managed by Railway under its plan-dependent log-retention settings. We have not configured a separate log archive. See [Railway log retention](https://docs.railway.com/observability/logs#log-retention); an expired log viewing window should not be interpreted as guaranteed immediate erasure from provider systems |
| Backups, if enabled | We have not enabled application-volume backups. Service providers may retain infrastructure copies under their own terms and processes; deleting an application record does not guarantee immediate removal from those systems |

Deletion of active application records does not establish immediate erasure from
provider systems, backups, your browser history, your clipboard, or the AI
website where the conversation originated. Contact us about retained server data.

## Your choices and requests

You can choose enabled websites, revoke Touchgrass's site permissions through
Chrome, disable the extension, or uninstall it. Stopping future access does not
by itself delete information already processed or stored.

The current Settings → Reset action resets core usage and score information. It
preserves your name and selected platforms and does not erase every extension
storage key or server-side record. Removing the extension removes its active
local extension storage from that Chrome profile; it does not delete server
records, independently saved reports, browser history or device backups.

Contact hrggyg@gmail.com to request access, correction or deletion of information
we hold. We may need nonsecret identifying details to locate records and verify
a request. Do not email passwords, provider API keys, extension session tokens or
unnecessary conversation content. Depending on your location, applicable law may
provide additional rights relating to your personal information.

Browser-local history is stored in your Chrome profile rather than in a complete
server-side copy we can retrieve for you. If you request deletion of an uploaded
analysis or repair job, include its job identifier if available. If we cannot
identify a record safely, we may need additional information before acting.

## Security and processing locations

The hosted extension/backend workflow uses HTTPS for network requests. We use
browser permission boundaries and application controls appropriate to the
service. No system or redaction process can guarantee complete security or the
removal of every sensitive detail. Processing may take place outside your country
through our hosting and service providers.

## Changes and contact

We may update this policy as Touchgrass changes. We will update the effective
date and provide additional notice or request consent when required for material
changes in data handling. The current policy will be available at
https://hongkian03.github.io/touchgrass/.

Operator: Kian Hong

Privacy contact: hrggyg@gmail.com
