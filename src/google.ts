import { GoogleAuth, JWT, OAuth2Client } from 'google-auth-library';
import { google, admin_directory_v1 } from 'googleapis';
import { DIRECTORY_SCOPES } from './constants.js';

export type DirectoryAuth = JWT | OAuth2Client;

export type DirectoryUser = {
  id: string;
  email: string;
  givenName: string;
  familyName: string;
  displayName: string;
  active: boolean;
};

export type DirectoryGroup = {
  id: string;
  email: string;
  name: string;
  memberEmails: string[];
};

export async function createDirectoryAuth(opts: {
  keyFile?: string;
  adminEmail: string;
  serviceAccountEmail?: string;
}): Promise<DirectoryAuth> {
  if (opts.keyFile) {
    return new JWT({
      keyFile: opts.keyFile,
      scopes: DIRECTORY_SCOPES,
      subject: opts.adminEmail,
    });
  }
  return delegatedClientFromWorkloadIdentity(opts.adminEmail, opts.serviceAccountEmail);
}

async function delegatedClientFromWorkloadIdentity(
  adminEmail: string,
  serviceAccountEmail?: string,
): Promise<OAuth2Client> {
  const adc = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const source = await adc.getClient();
  const saEmail = serviceAccountEmail || (await adc.getCredentials()).client_email || (await metadataServiceAccountEmail());
  if (!saEmail) {
    throw new Error('Could not resolve GCP service account email. Set GOOGLE_SERVICE_ACCOUNT_EMAIL.');
  }

  const now = Math.floor(Date.now() / 1000);
  const signed = await source.request<{ signedJwt: string }>({
    url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:signJwt`,
    method: 'POST',
    data: {
      payload: JSON.stringify({
        iss: saEmail,
        sub: adminEmail,
        scope: DIRECTORY_SCOPES.join(' '),
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    },
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signed.data.signedJwt,
    }),
  });
  const tokenBody = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !tokenBody.access_token) {
    throw new Error(`DWD token exchange failed: ${JSON.stringify(tokenBody)}`);
  }

  const delegated = new OAuth2Client();
  delegated.setCredentials({ access_token: tokenBody.access_token });
  return delegated;
}

async function metadataServiceAccountEmail(): Promise<string | undefined> {
  try {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    if (!res.ok) {
      return undefined;
    }
    return (await res.text()).trim();
  } catch {
    return undefined;
  }
}

function directoryClient(auth: DirectoryAuth): admin_directory_v1.Admin {
  return google.admin({ version: 'directory_v1', auth });
}

export async function listUsers(auth: DirectoryAuth): Promise<DirectoryUser[]> {
  const admin = directoryClient(auth);
  const users: DirectoryUser[] = [];
  let pageToken: string | undefined;

  do {
    const res = await admin.users.list({
      customer: 'my_customer',
      maxResults: 200,
      pageToken,
      orderBy: 'email',
    });
    for (const user of res.data.users ?? []) {
      if (!user.id || !user.primaryEmail) {
        continue;
      }
      users.push({
        id: user.id,
        email: user.primaryEmail.toLowerCase(),
        givenName: user.name?.givenName ?? '',
        familyName: user.name?.familyName ?? '',
        displayName: user.name?.fullName ?? user.primaryEmail,
        active: user.suspended !== true,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return users;
}

export async function listGroups(auth: DirectoryAuth, groupEmails: string[]): Promise<DirectoryGroup[]> {
  const admin = directoryClient(auth);

  if (groupEmails.length > 0) {
    const groups: DirectoryGroup[] = [];
    for (const email of groupEmails) {
      const res = await admin.groups.get({ groupKey: email });
      if (!res.data.id || !res.data.email) {
        continue;
      }
      const groupEmail = res.data.email.toLowerCase();
      groups.push({
        id: res.data.id,
        email: groupEmail,
        name: res.data.name ?? groupEmail,
        memberEmails: await listGroupMemberEmails(admin, groupEmail),
      });
    }
    return groups;
  }

  const groups: DirectoryGroup[] = [];
  let pageToken: string | undefined;
  do {
    const res = await admin.groups.list({
      customer: 'my_customer',
      maxResults: 200,
      pageToken,
    });
    for (const group of res.data.groups ?? []) {
      if (!group.id || !group.email) {
        continue;
      }
      const email = group.email.toLowerCase();
      groups.push({
        id: group.id,
        email,
        name: group.name ?? email,
        memberEmails: await listGroupMemberEmails(admin, email),
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return groups;
}

async function listGroupMemberEmails(
  admin: admin_directory_v1.Admin,
  groupEmail: string,
): Promise<string[]> {
  const emails: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await admin.members.list({
      groupKey: groupEmail,
      maxResults: 200,
      pageToken,
    });
    for (const member of res.data.members ?? []) {
      if (member.type === 'USER' && member.email) {
        emails.push(member.email.toLowerCase());
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return emails;
}
