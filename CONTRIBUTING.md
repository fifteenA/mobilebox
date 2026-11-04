# Contributing

Fixes to the docs and examples are welcome. For a problem with the hosted service, email hello@mobilebox.dev or open an issue.

- Keep examples dependency-free (Python stdlib, Node 24 `fetch`, bash + curl + jq) and short enough to read in one go.
- Every example must delete the phones it creates, also on failure.
- Run an example you changed against production with your own key, and update [examples/RUNS.md](examples/RUNS.md).
- Before opening a PR: `npm ci && npm run lint && npm run check:mcp`.
- Never commit a key. CI scans every commit.

Contributions are released under the [MIT license](LICENSE).
