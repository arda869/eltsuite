import type { Account, Org, OrgClass, OrgInvite, OrgLogEntry, DriveFolder, Teacher } from '../../lib/admin';

// What every page of the admin areas is given.
export type Go = (to: { org?: string; tab?: string; replace?: boolean; [k: string]: string | boolean | undefined }) => void;
export type OrgData = {
  org: Org;
  orgs: Org[];
  owner: boolean; // the owner of ELT Suite, looking in from Super Admin
  classes: OrgClass[];
  accounts: Record<string, Account>;
  invites: OrgInvite[];
  log: OrgLogEntry[];
  folders: DriveFolder[];
  pics: Record<string, string>;
  me: { uid: string; name: string };
  note: (what: string, detail?: string) => void; // adds a line to the activity log
  allTeachers: Teacher[];
  allAccounts: Record<string, Account>;
  loading: boolean;
};
export type SuperData = { teachers: Teacher[]; accounts: Record<string, Account>; orgs: Org[]; classes: OrgClass[]; invites: OrgInvite[]; loading: boolean };
