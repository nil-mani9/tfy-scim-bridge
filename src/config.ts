export type BridgeConfig = {
  googleKeyFile?: string;
  googleAdminEmail: string;
  googleServiceAccountEmail?: string;
  googleGroupEmails: string[];
  scimBaseUrl: string;
  scimToken: string;
  pollIntervalMs: number;
  dryRun: boolean;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function optionalList(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function loadConfig(): BridgeConfig {
  const pollSeconds = Number(process.env.POLL_INTERVAL_SECONDS ?? '300');
  return {
    googleKeyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || undefined,
    googleAdminEmail: required('GOOGLE_ADMIN_EMAIL'),
    googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || undefined,
    googleGroupEmails: optionalList('GOOGLE_GROUP_EMAILS'),
    scimBaseUrl: required('SCIM_BASE_URL').replace(/\/$/, ''),
    scimToken: required('SCIM_TOKEN'),
    pollIntervalMs: Number.isFinite(pollSeconds) ? pollSeconds * 1000 : 300_000,
    dryRun: process.env.DRY_RUN === 'true',
  };
}
