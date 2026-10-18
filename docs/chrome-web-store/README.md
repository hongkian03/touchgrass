# Touchgrass publishing copy

Drafted against the current repository on October 18, 2026. These files do not
publish an item, change the extension, or create a public privacy-policy URL.

| File | Use |
| --- | --- |
| [privacy-policy.md](privacy-policy.md) | Completed policy source, prepared for GitHub Pages |
| [store-listing.md](store-listing.md) | Store descriptions, single purpose, screenshot captions and listing fields |
| [privacy-disclosures.md](privacy-disclosures.md) | Permission justifications and data-use form guidance |
| [reviewer-instructions.md](reviewer-instructions.md) | Private instructions for Chrome reviewers |
| [in-product-disclosure.md](in-product-disclosure.md) | Proposed onboarding/consent text; requires UI implementation |
| [support.md](support.md) | Support-page and FAQ copy |

## Complete before publication

The privacy policy names Kian Hong as operator and hrggyg@gmail.com as the
privacy contact, using the local Git identity with the operator's authorization.
Its effective date is October 18, 2026. The operator confirmed unchanged retention
settings: seven days for coaching metadata, no enabled application-volume
backups, and default Railway log handling. Other submission documents still
contain placeholders; complete those separately before using them.

Keep the policy synchronized if `METADATA_RETENTION_DAYS` changes in Railway.
Cleanup runs on application startup and certain
requests; there is no exact-time deletion guarantee. Job directories, redacted
workspaces, repaired-page inputs, analysis results and job records currently have
no scheduled expiry. Do not claim that all information is deleted after seven
days or immediately after a job.

Review hosting/provider retention and backup settings whenever they change.
Do not claim that providers never retain
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

The prepared workflow is
[Publish privacy policy](../../.github/workflows/privacy-pages.yml). It builds
only the policy, rather than publishing the repository's entire documentation
folder. It runs manually and has not been run or published by this change.

1. Commit and push the policy, this guide and workflow to `main` after review.
2. Open the repository on GitHub → **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Open **Actions → Publish privacy policy → Run workflow** and select `main`.
5. Wait for success and open the deployment URL shown by the workflow. With the
   current repository name and no custom domain, the expected URL is
   **https://hongkian03.github.io/touchgrass/**.
6. Confirm it opens without signing in, then put that URL in the Chrome Web Store
   privacy-policy field and the extension's consent UI.

Repository admin/maintainer access and a GitHub plan supporting Pages for the
repository's visibility are required. If an existing Pages site or custom domain
is configured, reconcile it before deploying: this workflow replaces the site's
published content with the privacy-policy site. GitHub Pages also receives
ordinary connection information when users visit the policy.

Future policy edits require another manual workflow run. Keep the policy, store
disclosures and application behavior consistent. A completed policy does not
implement the release work listed above.

The proposed privacy form selections require a final data-flow review; do not
automatically select every checkbox or certify practices that are not implemented.

## References

- [Chrome user-data and privacy guidance](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Chrome listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Remote hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
