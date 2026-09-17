/** TrueFoundry team names: letter, then alnum/_/-, end alnum, max 50. */
export function toTeamName(groupEmail: string): string {
  const local = groupEmail.split('@')[0] ?? 'group';
  let slug = local.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
  slug = slug.replace(/^-+|-+$/g, '');
  if (!/^[a-zA-Z]/.test(slug)) {
    slug = `g-${slug}`;
  }
  if (slug.length < 3) {
    slug = `${slug}grp`;
  }
  slug = slug.slice(0, 50);
  if (!/[a-zA-Z0-9]$/.test(slug)) {
    slug = `${slug.slice(0, 49)}0`;
  }
  return slug;
}

export function sameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const set = new Set(left);
  return right.every((item) => set.has(item));
}
