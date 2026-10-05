# Private configuration

Keep API tokens, RPC credentials, wallet keypairs and Android signing keys out of Git.
Use local `.env` or `.dev.vars` files for deployment input, Cloudflare Worker
secrets for server credentials and GitHub Actions secrets for Android signing.
The root ignore rules cover these private files across the repository. Example
environment files contain empty values or placeholders only.

The Credential scan workflow checks reachable Git history on pushes and pull
requests to `main`, using a checksum-pinned Gitleaks release and redacted output.
Its allowlist covers public chain identifiers, a documentation placeholder and
the retired public Supabase publishable-token format. Service-role keys and
private credentials remain subject to scanning.

Before pushing locally, run Gitleaks 8.30.1 from the repository root:

```bash
gitleaks git --config .gitleaks.toml --redact --log-opts=--all .
```

Ignore rules do not remove files already tracked by Git. If a real credential is
ever committed, revoke or rotate it at its provider first. Deleting the current
file does not remove the credential from old commits, clones or forks.
