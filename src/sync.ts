import { listGroups, listUsers, type DirectoryAuth, type DirectoryGroup, type DirectoryUser } from './google.js';
import type { BridgeConfig } from './config.js';
import { toTeamName, sameMembers } from './names.js';
import { ScimClient, type ScimUser } from './scim.js';

export async function runSync(auth: DirectoryAuth, scim: ScimClient, config: BridgeConfig): Promise<void> {
  const googleGroups = await listGroups(auth, config.googleGroupEmails);
  const googleUsers = await usersForSync(auth, googleGroups, config.googleGroupEmails.length > 0);
  const scimUsers = await scim.listUsers();
  const scimGroups = await scim.listGroups();

  const usersByEmail = new Map(scimUsers.filter((u) => u.userName).map((u) => [u.userName.toLowerCase(), u]));
  const groupsByExternalId = new Map(
    scimGroups.filter((g) => g.externalId).map((g) => [g.externalId as string, g]),
  );

  console.log(`Google users=${googleUsers.length} groups=${googleGroups.length}`);
  console.log(`SCIM users=${scimUsers.length} groups=${scimGroups.length}`);

  const emailToScimId = new Map<string, string>();

  for (const user of googleUsers) {
    const existing = usersByEmail.get(user.email);
    if (!existing?.id) {
      log('create user', user.email, config.dryRun);
      if (!config.dryRun) {
        const created = await scim.createUser(toScimUser(user));
        if (created.id) {
          emailToScimId.set(user.email, created.id);
        }
      }
      continue;
    }
    emailToScimId.set(user.email, existing.id);
    const currentActive = existing.active !== false;
    if (currentActive !== user.active) {
      log(`${user.active ? 'activate' : 'deactivate'} user`, user.email, config.dryRun);
      if (!config.dryRun) {
        await scim.patchUserActive(existing.id, user.active);
      }
    }
  }

  for (const group of googleGroups) {
    const displayName = toTeamName(group.email);
    const members = group.memberEmails
      .map((email) => {
        const id = emailToScimId.get(email);
        return id ? { value: id, display: email } : undefined;
      })
      .filter((m): m is { value: string; display: string } => Boolean(m));

    const existing = groupsByExternalId.get(group.id);
    const desiredMemberIds = members.map((m) => m.value).sort();
    const currentMemberIds = (existing?.members ?? []).map((m) => m.value).sort();

    if (!existing?.id) {
      log('create group', `${group.email} -> ${displayName}`, config.dryRun);
      if (!config.dryRun) {
        await scim.createGroup({
          displayName,
          externalId: group.id,
          members,
        });
      }
      continue;
    }

    if (!sameMembers(desiredMemberIds, currentMemberIds)) {
      log('update group members', group.email, config.dryRun);
      if (!config.dryRun) {
        await scim.replaceGroup(existing.id, {
          displayName: existing.displayName,
          externalId: group.id,
          members,
        });
      }
    }
  }
}

async function usersForSync(
  auth: DirectoryAuth,
  groups: DirectoryGroup[],
  filtered: boolean,
): Promise<DirectoryUser[]> {
  if (!filtered) {
    return listUsers(auth);
  }
  const memberEmails = new Set(groups.flatMap((group) => group.memberEmails));
  const all = await listUsers(auth);
  return all.filter((user) => memberEmails.has(user.email));
}

function toScimUser(user: DirectoryUser): ScimUser {
  return {
    userName: user.email,
    displayName: user.displayName,
    active: user.active,
    externalId: user.id,
    emails: [{ value: user.email, type: 'work', primary: true }],
    name: {
      givenName: user.givenName,
      familyName: user.familyName,
      formatted: user.displayName,
    },
  };
}

function log(action: string, target: string, dryRun: boolean): void {
  console.log(`${dryRun ? '[dry-run] ' : ''}${action}: ${target}`);
}
