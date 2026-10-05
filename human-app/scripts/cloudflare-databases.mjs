export function databaseId(db) {
  const identifier = db.uuid || db.id;
  if (!identifier) throw new Error(`Missing Cloudflare D1 ID for ${db.name}`);
  return identifier;
}

export function loginCookieName(prefix, values, overrides) {
  if (Object.hasOwn(overrides, "AUTH_COOKIE_NAME")) {
    if (!values.AUTH_COOKIE_NAME) throw new Error("AUTH_COOKIE_NAME must not be empty");
    return values.AUTH_COOKIE_NAME;
  }
  return prefix === "human" ? "baw_human_session" : "site_session";
}

export function findLoginDatabase(databases, authName, wrangler) {
  const candidates = databases.filter((db) =>
    authName
      ? db.name === authName
      : [
          "buildawallet-auth",
          "buildawallet-email-auth",
          "buildawallet",
          "buildawallet-production",
        ].includes(db.name),
  );
  const authMatches = [];
  for (const db of candidates) {
    const result = wrangler(
      [
        "d1",
        "execute",
        databaseId(db),
        "--remote",
        "--json",
        "--command",
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('auth_sessions','auth_email_accounts','human_sessions','human_email_accounts')",
      ],
      true,
    );
    const names = result.flatMap((item) => item.results ?? []).map((row) => row.name);
    for (const prefix of ["auth", "human"]) {
      if (!names.includes(`${prefix}_sessions`) || !names.includes(`${prefix}_email_accounts`))
        continue;
      const columns = wrangler(
        [
          "d1",
          "execute",
          databaseId(db),
          "--remote",
          "--json",
          "--command",
          `PRAGMA table_info(${prefix}_sessions)`,
        ],
        true,
      )
        .flatMap((item) => item.results ?? [])
        .map((row) => row.name);
      if (
        columns.includes("email_hash") &&
        columns.includes("token_hash") &&
        columns.includes("expires_at")
      ) {
        const accountColumns = wrangler(
          [
            "d1",
            "execute",
            databaseId(db),
            "--remote",
            "--json",
            "--command",
            `PRAGMA table_info(${prefix}_email_accounts)`,
          ],
          true,
        )
          .flatMap((item) => item.results ?? [])
          .map((row) => row.name);
        if (accountColumns.includes("email_hash") && accountColumns.includes("verified_at"))
          authMatches.push({ db, prefix });
      }
    }
  }
  if (authMatches.length !== 1)
    throw new Error(
      "Cannot identify one existing Login D1 database. Set AUTH_DATABASE_NAME in human-app/.env to the database used by your Login Worker. This deploy does not create or reset login tables.",
    );
  return authMatches[0];
}
