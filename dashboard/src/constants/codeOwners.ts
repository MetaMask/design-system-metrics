/** CODEOWNERS teams excluded from eng-facing adoption scoreboards. */
export const MOBILE_EXCLUDED_OWNERS = new Set([
  'design-system-engineers',
  'mobile-admins',
  'supply-chain',
  'qa',
]);

export const EXTENSION_EXCLUDED_OWNERS = new Set([
  'howardbraham',
  'dbrans',
  'qa',
  'wallet-integrations',
  'extension-platform',
  'extension-privacy-reviewers',
  'extension-security-team',
  'policy-reviewers',
  'design-system-engineers',
]);

export function normalizeOwner(owner: string): string {
  return owner.replace('@MetaMask/', '').replace(/^@/, '').toLowerCase();
}

export function formatOwnerLabel(owner: string): string {
  return owner.replace('@MetaMask/', '').replace(/^@/, '');
}

export function excludedOwnersForProject(project: string): Set<string> {
  return project === 'mobile' ? MOBILE_EXCLUDED_OWNERS : EXTENSION_EXCLUDED_OWNERS;
}
