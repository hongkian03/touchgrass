# Touchgrass reviewer instructions

Draft for the dashboard's private Test instructions field. Validate the path and
replace bracketed fields before submission. Never include provider keys, session
tokens, personal AI-site credentials or private conversation exports.

## Purpose and setup

Touchgrass provides AI usage summaries and contextual model-choice coaching on
supported AI websites the user enables. Its hosted backend is
https://hackharvard-production.up.railway.app.

1. Install the submitted extension.
2. Click the Touchgrass toolbar action to open its panel. On a website the panel
   appears in the page; on Chrome-protected pages Chrome may show a popup.
3. Complete onboarding with a test display name and select a supported AI website
   such as ChatGPT. Grant the requested site permission and review the online
   processing disclosures.
4. Visit the enabled AI website and sign in using an appropriate test account if
   the website requires it. These third-party accounts are separate from Touchgrass.
5. Refresh the website if it was open before permissions were granted.

Touchgrass account/login requirements for the final release:
[DESCRIBE_ACTUAL_LOGIN_REQUIREMENTS_AND_PROVIDE_A_DEDICATED_REVIEWER_ACCOUNT_IF_NEEDED].
The current development build automatically obtains an application session; revise
this section when the release authentication flow changes.

## Test usage recording and coaching

1. Start a fresh conversation on the enabled website.
2. If available in the test account, select a stronger model with a lighter
   alternative available in the website's model picker.
3. Type a nonsensitive prompt, for example: "Rewrite 'send me the report today'
   as a polite workplace request."
4. Allow the draft check to finish and send the prompt if no coaching UI appears.
5. When a recommendation is shown, exercise the available switch, open-another-
   website, continue, or dismiss action as appropriate.
6. Open Touchgrass and inspect its usage summary to confirm that the activity was
   recorded.

Coaching is conditional. Cooldowns, recent context, the selected model, account
model availability and classification can legitimately result in no recommendation.
No single test prompt is guaranteed to produce an offer. The in-page coach can
operate with the extension panel closed after permission and onboarding.

## Test export analysis

If this feature is included in the submitted build, use
[VERIFIED_UI_PATH_TO_EXPORT_UPLOAD] to select a small conversation export in a
supported format. Use a purpose-created test export, not personal history.
Observe job progress and the resulting analysis through the extension UI.

Supported formats tested in this release: [VERIFIED_EXPORT_FORMATS].

Backend processing uses Daytona for temporary execution and Factory Droid for
the parsing/analysis workflow. The operator must keep these services available
and funded during review; reviewers do not need provider API keys.

## Remote configuration and limitations

The backend supplies selector JSON and structured coaching results. The browser
executes packaged extension logic; parsing/analysis code generated in the backend
workflow runs server-side. Website integrations can be affected by third-party
interface changes. Suggestions and environmental figures are estimates, not
guaranteed outcomes or direct measurements of individual requests.

Review support: [SUPPORT_EMAIL].

## Operator checklist — do not paste this section into the test field

- Run the instructions with a fresh install of the exact uploaded ZIP.
- Fill in the real upload navigation and supported formats; do not promise a path
  that has not been checked in the release UI.
- Supply a dedicated test identity for any Touchgrass login introduced before
  release. Do not disable production controls for review.
- Ensure disclosures mentioned above actually exist in the submitted UI.
- Keep the Railway deployment, model connections, quotas and job execution ready.
