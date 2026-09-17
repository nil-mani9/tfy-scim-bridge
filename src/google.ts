import { JWT } from 'google-auth-library';
import { google, admin_directory_v1 } from 'googleapis';
import { DIRECTORY_SCOPES } from './constants.js';

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

export function createDirectoryAuth(keyFile: string, adminEmail: string): JWT {
  return new JWT({
    keyFile,
    scopes: DIRECTORY_SCOPES,
    subject: adminEmail,
  });
}

function directoryClient(auth: JWT): admin_directory_v1.Admin {
  return google.admin({ version: 'directory_v1', auth });
}

export async function listUsers(auth: JWT): Promise<DirectoryUser[]> {
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

export async function listGroups(auth: JWT, groupEmails: string[]): Promise<DirectoryGroup[]> {
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
