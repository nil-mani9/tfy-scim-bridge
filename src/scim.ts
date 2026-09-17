import { GROUP_SCHEMA, PATCH_SCHEMA, USER_SCHEMA } from './constants.js';

export type ScimUser = {
  id?: string;
  userName: string;
  displayName?: string;
  active?: boolean;
  externalId?: string;
  emails?: { value: string; type?: string; primary?: boolean }[];
  name?: { givenName?: string; familyName?: string; formatted?: string };
};

export type ScimGroup = {
  id?: string;
  displayName: string;
  externalId?: string;
  members?: { value: string; display?: string }[];
};

type ListResponse<T> = {
  totalResults?: number;
  Resources?: T[];
};

export class ScimClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async listUsers(): Promise<ScimUser[]> {
    return this.listAll<ScimUser>('/Users');
  }

  async listGroups(): Promise<ScimGroup[]> {
    return this.listAll<ScimGroup>('/Groups');
  }

  async createUser(user: ScimUser): Promise<ScimUser> {
    return this.request<ScimUser>('POST', '/Users', {
      schemas: [USER_SCHEMA],
      ...user,
    });
  }

  async patchUserActive(id: string, active: boolean): Promise<void> {
    await this.request('PATCH', `/Users/${id}`, {
      schemas: [PATCH_SCHEMA],
      Operations: [{ op: 'replace', path: 'active', value: active }],
    });
  }

  async createGroup(group: ScimGroup): Promise<ScimGroup> {
    return this.request<ScimGroup>('POST', '/Groups', {
      schemas: [GROUP_SCHEMA],
      ...group,
    });
  }

  async replaceGroup(id: string, group: ScimGroup): Promise<ScimGroup> {
    return this.request<ScimGroup>('PUT', `/Groups/${id}`, {
      schemas: [GROUP_SCHEMA],
      id,
      ...group,
    });
  }

  private async listAll<T>(path: string): Promise<T[]> {
    const resources: T[] = [];
    let startIndex = 1;
    const count = 100;

    for (;;) {
      const data = await this.request<ListResponse<T>>(
        'GET',
        `${path}?startIndex=${startIndex}&count=${count}`,
      );
      const page = data.Resources ?? [];
      resources.push(...page);
      const total = data.totalResults ?? resources.length;
      if (resources.length >= total || page.length === 0) {
        break;
      }
      startIndex += page.length;
    }

    return resources;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/scim+json',
        'Content-Type': 'application/scim+json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`SCIM ${method} ${path} failed (${res.status}): ${text}`);
    }
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }
}
