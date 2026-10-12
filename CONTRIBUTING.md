# Contributing

- **No direct collaborators.** All work lands via Issues and Pull Requests.
- **Bugs and issues are triaged by the maintainer (AI-assisted) before anything is merged or released.** Open an issue first; unsolicited PRs without a linked issue may be closed.
- PRs must: describe the problem, keep the diff minimal, pass `npm run build` in `extension/`, and never include secrets, keys (`.pem`), or binaries (`.crx`).
- Releases and signing (`.crx`, `updates.xml`) are done only by the maintainer via `scripts/release.sh`.
