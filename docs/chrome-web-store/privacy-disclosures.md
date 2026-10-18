# Chrome Web Store privacy fields

Internal submission guidance, not a public policy. Reconcile this with the final
manifest, provider configuration, consent UI and privacy policy before certifying.

## Single-purpose description

Help users understand and manage AI usage through usage summaries and contextual
model-choice coaching on supported AI websites they enable.

## Permission justifications

### storage

Stores the user's selected AI websites, onboarding preferences, display name,
usage history, scores, coaching choices, cached integration configuration and
backend session information so the extension can operate across visits.

### scripting

Attaches the usage recorder and coaching interface to supported websites after
the user grants access. Also attaches the floating extension panel following a
toolbar action. It is not used to download and execute server-provided code.

### tabs

Finds supported open tabs to initialize or refresh their enabled integrations,
coordinates navigation, and opens a user-selected destination AI website when
the user chooses a coaching action.

Audit whether these operations need the `tabs` permission itself or only other
APIs/host grants. Remove it if the final code works without its privileged fields.

### alarms

Schedules background checks for updated site-integration configuration so the
extension can continue working when a supported website's interface changes.

### activeTab

Provides temporary access to the tab where the user clicks the extension's
toolbar icon so Touchgrass can display its floating panel in that tab.

### Hosted backend host permission

Connects to the Touchgrass backend at
https://hackharvard-production.up.railway.app for coaching requests, session
handling, user-uploaded conversation analysis, job results, and site-integration
configuration and repair.

### Optional AI-website host permissions

Allows Touchgrass to observe relevant prompt/model controls, record usage and
display contextual coaching on supported AI websites the user selects. The
extension requests website access as part of onboarding or platform selection.

### Groq host permission — current architecture only

Sends draft excerpts and platform context for model/platform routing and sends
unfamiliar website hostnames for AI-site classification.

This permission should be removed from the store build if all Groq calls move to
the backend. Do not distribute a shared provider key in the extension bundle.

### Localhost host permissions — development only

The current manifest permits localhost and 127.0.0.1 for local backend development.
Remove them from the public build if users do not have a documented local-backend
feature. Do not invent a production justification for an unused permission.

## Data-category assessment

Chrome requires disclosure of local handling as well as transmissions. Treat
this table as a data inventory, not an instruction to blindly select checkboxes.

| Category | Current evidence and submission action |
| --- | --- |
| Personally identifiable information | Display name is stored locally; uploads/snapshots may contain names and other identifiers. Disclose the relevant handling |
| Website content | Prompt snippets, drafts, recent messages, page snapshots and uploaded conversations are handled. Disclose |
| User activity | Prompt sends, regeneration activity, coaching interactions and timestamps are handled. Disclose |
| Web history | Provider/site domains and conversation identifiers are handled; custom-site lookups transmit a hostname. Assess against the dashboard's definition; do not claim that no browsing information is handled |
| Personal communications | Conversation content can be handled, including communications in exports or page snapshots. Review the dashboard's definition and disclose applicable content |
| Authentication information | Extension session tokens are stored locally and session-token hashes on the backend. Determine how the dashboard classifies these. Do not claim access to AI-site passwords or cookies unless the final implementation actually accesses them |
| Financial/payment, health, location or other sensitive information | No dedicated feature solicits these, but free-text conversations may contain them. Review the exact dashboard definitions and final processing scope rather than claiming such content can never be present |

Do not describe a keyed digest or pseudonymous session as proof that all handled
information is anonymous. Never mark the product as handling no user data.

## Data-use certifications

The privacy draft commits to no sale, targeted advertising, or unrelated
general-purpose model training by the operator. Confirm actual operator and
provider practices before checking certifications. Do not equate "not retained
in the coaching database" with "not transmitted" or "not retained anywhere."

## Remote-code explanation

Use the following explanation only after checking the exact release bundle:

> All browser-executed extension logic is packaged with the extension. The
> backend returns structured coaching results and versioned JSON containing CSS
> selectors. Packaged extension code uses those selectors to find page elements.
> The extension does not download or evaluate JavaScript, WebAssembly, or code
> generated by an AI model in the browser. Factory Droid runs as part of a
> server-side workflow; generated parsing/analysis code executes server-side.

If that remains accurate, the browser extension does not use remote executable
code for those flows. Remote JSON is not automatically compliant merely because
it is JSON: keep executable logic packaged and review any future interpreter or
remotely supplied instruction mechanism.

## References

- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
