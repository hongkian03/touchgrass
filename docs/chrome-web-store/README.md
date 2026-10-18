# Touchgrass publishing copy

Drafted against the current repository on October 18, 2026. These files do not
publish an item, change the extension, or create a public privacy-policy URL.

| File | Use |
| --- | --- |
| [privacy-policy.md](privacy-policy.md) | Public privacy-policy page after completing the missing details |
| [store-listing.md](store-listing.md) | Store descriptions, single purpose, screenshot captions and listing fields |
| [privacy-disclosures.md](privacy-disclosures.md) | Permission justifications and data-use form guidance |
| [reviewer-instructions.md](reviewer-instructions.md) | Private instructions for Chrome reviewers |
| [in-product-disclosure.md](in-product-disclosure.md) | Proposed onboarding/consent text; requires UI implementation |
| [support.md](support.md) | Support-page and FAQ copy |

## Complete before publication

Replace `[OPERATOR_NAME]`, `[PRIVACY_EMAIL]`, `[SUPPORT_EMAIL]`, `[EFFECTIVE_DATE]`,
`[PRIVACY_POLICY_URL]`, `[SUPPORT_URL]`, and any other bracketed fields. Choose an
operator/contact your team can actually maintain; these cannot be inferred from
the GitHub repository owner's name. Remove the draft notices from public pages
only after the outstanding items below are resolved.

Verify the deployed coaching retention setting before replacing
`[COACHING_RETENTION_DAYS]`. The code defaults to seven days, but the Railway
environment can override it. Cleanup runs on application startup and certain
requests; there is no exact-time deletion guarantee. Job directories, redacted
workspaces, repaired-page inputs, analysis results and job records currently have
no scheduled expiry. Do not claim that all information is deleted after seven
days or immediately after a job.

Confirm hosting/provider retention, backup retention and account settings before
filling the remaining retention fields. Do not claim that providers never retain
or train on data unless the relevant contracts and account settings support it.
Confirm the draft commitments about no sale, advertising, or unrelated model
training reflect the operator's actual practices.

## Code and operational release work still required

- Remove the shared Groq key from distributable browser code; proxy those calls
  through authenticated, usage-limited backend routes or use explicit user keys.
- Protect automatic session creation, paid jobs, job/results access and adapter
  publishing; enforce ownership and usage limits.
- Add prominent disclosure and affirmative consent before online coaching and
  automatic page-snapshot repair. Site access permission alone does not describe
  the information sent to AI providers. The proposed consent text is not yet UI.
- Audit the existing UI for claims such as "local" or "private": local history
  includes prompt text, and online features transmit content.
- Implement and test the deletion process the team will offer. Settings → Reset
  currently clears core usage/score state but preserves the name and enabled
  platforms, and does not clear all extension storage or server records. A server
  coaching-history deletion endpoint exists; it is not a complete job-data
  deletion system or an already-wired settings button.
- Review and bound job-data retention. Redaction is not a guarantee that a file
  contains no personal information; repair validation can include draft text.
- Audit production host permissions, localhost access, and web-accessible resource
  matches. Use the final manifest to complete the permission fields.
- Test each advertised feature and provider in the exact release ZIP. Remove
  unsupported claims, placeholders and unpublished features from the listing.

## Publish the policy page

Host the completed policy on a public HTTPS page that opens without login, for
example on your project website. A local Markdown file is not a public URL.
Use that URL in the Chrome Web Store privacy field and in the extension's consent
UI. Keep the policy, store disclosures and application behavior consistent.

The proposed privacy form selections require a final data-flow review; do not
automatically select every checkbox or certify practices that are not implemented.

## References

- [Chrome user-data and privacy guidance](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Chrome listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Remote hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
