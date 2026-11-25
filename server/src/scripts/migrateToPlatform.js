/**
 * Move the existing companies onto the platform.   npm run migrate:platform
 *
 *   npm run migrate:platform                 dry run (the default): prints every change, writes nothing
 *   npm run migrate:platform -- --apply      makes the changes
 *   options: --source <key>   company whose roles seed the shared templates (default logi-force)
 *            --csv <file>     also write the unmatched-roles report as CSV
 *
 * Safe to run any number of times: every step checks what is already there.
 *
 *   1. Role templates from code (config/defaultRoles.js): missing ones are
 *      created, existing ones are left exactly as they are.
 *   2. Role templates from the source company's roles (logi-force; its real
 *      database comes from its Tenant record, or from legacyTenants.js): every
 *      role that isn't the admin role and has no template of the same name yet
 *      becomes a template (platform-only and unknown permissions dropped).
 *   3. A Tenant record, status 'active' with every module, for each company in
 *      the old hardcoded list (platform/scripts/legacyTenants.js) that has none.
 *      Existing records are not changed here.
 *   4. In each company database:
 *      - the admin role (isSystemRole true) is updated in place: templateKey
 *        'tenant_admin', managedBy 'platform', isSystemRole false. Same _id, so
 *        users keep it. A separate role already linked to tenant_admin is
 *        removed if nobody uses it; if somebody does, the company is skipped
 *        and reported.
 *      - every other role whose name equals a template key, ignoring case and
 *        extra whitespace, is linked to it (templateKey, managedBy 'platform').
 *        Its permissions are NOT changed here: `npm run platform:sync-roles`
 *        does that afterwards and shows the difference first.
 *      - roles that match no template (or more than one candidate) are left
 *        alone and listed in the unmatched report.
 *      The company's roleTemplateKeys gain 'tenant_admin' and every linked
 *      template, and lose 'admin'.
 *   5. The retired 'admin' template is deleted once no company lists it.
 *   6. Your platform account from PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_NAME:
 *      created without a password, and emailed a set-password link to
 *      PLATFORM_CONSOLE_URL/set-password/<token>. An account that already has a
 *      password is left alone; one without gets a new link only when its last
 *      link has expired.
 *
 * Every platform change is written to platform_audit_logs as actor 'system';
 * company role changes as one 'tenant.rolesMigrated' entry per company.
 *
 * Writes nothing without --apply: company databases are opened with
 * autoIndex/autoCreate off. (Opening the platform models lets Mongoose check
 * the platform collections' indexes, as every platform script does.)
 *
 * Never prints a URI, a password or a token.
 */
const fs = require('fs');
const { PERMISSIONS, MODULES, isPlatformPermission } = require('../config/permissions');
const { ROLE_TEMPLATES, RETIRED_TEMPLATE_KEYS, TENANT_ADMIN_TEMPLATE } = require('../config/defaultRoles');

const TENANT_ADMIN_KEY = TENANT_ADMIN_TEMPLATE.key;
const DEFAULT_SOURCE_KEY = 'logi-force';
const SYSTEM_ACTOR = Object.freeze({ userId: null, email: 'system' });
const TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,40}$/; // models/RoleTemplate.js
const USAGE = 'Usage: npm run migrate:platform -- [--dry-run | --apply] [--source <company key>] [--csv <file>]';

// ── Pure helpers ──

/** ' Ops   Team ' → 'ops team'. How role names are compared with template keys. */
const normalizeRoleName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** A role name as a template key ('Night Shift' → 'night_shift'), or null if it can't be one. */
const templateKeyFromRoleName = (name) => {
  const key = normalizeRoleName(name).replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  return TEMPLATE_KEY_PATTERN.test(key) ? key : null;
};

const isKnownPermission = (key) => Object.prototype.hasOwnProperty.call(PERMISSIONS, key);
const idStr = (id) => (id == null ? null : String(id));
const uniq = (values) => [...new Set(values)];

/** The old all-powerful admin: the system role. */
const isAdminRole = (role) => role.isSystemRole === true;

/**
 * Step 2: which of the source company's roles become new templates.
 *
 * @param {object[]} sourceRoles  the source company's roles (lean)
 * @param {string[]} templateKeys keys that exist (or will, from step 1)
 * @returns {{ create: object[], skipped: {roleName: string, reason: string}[], links: Map<string, string> }}
 *   links: source role _id → the key of the template made from it
 */
const planSourceTemplates = ({ sourceRoles, templateKeys }) => {
  const byNormKey = new Map(templateKeys.map((k) => [normalizeRoleName(k), k]));
  const create = [];
  const skipped = [];
  const links = new Map();
  const candidates = [];

  for (const role of sourceRoles) {
    if (isAdminRole(role) || role.templateKey === TENANT_ADMIN_KEY) continue; // becomes tenant_admin in step 4
    if (role.templateKey && templateKeys.includes(role.templateKey)) continue; // already linked to a template
    if (byNormKey.has(normalizeRoleName(role.name))) continue; // a template of that name exists: matched in step 4
    const key = templateKeyFromRoleName(role.name);
    if (!key) {
      skipped.push({ roleName: role.name, reason: 'its name cannot be turned into a template key (letters, digits, _)' });
      continue;
    }
    if (RETIRED_TEMPLATE_KEYS.includes(key)) {
      skipped.push({ roleName: role.name, reason: `"${key}" is a retired template key` });
      continue;
    }
    if (templateKeys.includes(key)) {
      skipped.push({ roleName: role.name, reason: `a template "${key}" exists, but its name differs from the role's` });
      continue;
    }
    candidates.push({ role, key });
  }

  const counts = candidates.reduce((m, c) => m.set(c.key, (m.get(c.key) || 0) + 1), new Map());
  for (const { role, key } of candidates) {
    if (counts.get(key) > 1) {
      const others = candidates.filter((c) => c.key === key).map((c) => `"${c.role.name}"`).join(', ');
      skipped.push({ roleName: role.name, reason: `several roles (${others}) would become template "${key}"` });
      continue;
    }
    const permissions = uniq(role.permissions || []);
    const kept = permissions.filter((p) => isKnownPermission(p) && !isPlatformPermission(p));
    create.push({
      key,
      displayName: (role.displayName || role.name).trim(),
      description: role.description || undefined,
      permissions: kept,
      assignableByTenant: true,
      dropped: permissions.filter((p) => !kept.includes(p)),
      sourceRoleName: role.name,
    });
    links.set(idStr(role._id), key);
  }
  return { create, skipped, links };
};

/**
 * Step 4 for one company. Pure.
 *
 * @param {object}   args
 * @param {object[]} args.roles          every role in the company (lean)
 * @param {Map<string, number>} args.userCounts  role _id → number of users
 * @param {object[]} args.templates      { key, displayName } of every template after steps 1–2
 * @param {Map<string, string>} [args.sourceLinks]  role _id → template key (source company only)
 * @param {string[]} args.roleTemplateKeys  the company's current Tenant.roleTemplateKeys
 */
const planCompanyRoles = ({ roles, userCounts, templates, sourceLinks = new Map(), roleTemplateKeys = [] }) => {
  const users = (role) => userCounts.get(idStr(role._id)) || 0;
  const templateKeys = templates.map((t) => t.key);
  const plan = {
    adminUpdate: null,
    removeRoles: [],
    links: [],
    alreadyLinked: [],
    unmatched: [],
    blockers: [],
    notes: [],
    roleTemplateKeys: { before: [...roleTemplateKeys], after: [] },
  };

  // ── The admin role ──
  const systemRoles = roles.filter(isAdminRole);
  const handled = new Set();
  if (systemRoles.length > 1) {
    plan.blockers.push(`${systemRoles.length} system roles (${systemRoles.map((r) => `"${r.name}"`).join(', ')}); `
      + 'expected one admin role. Nothing changed for the admin; decide which one becomes tenant_admin.');
    systemRoles.forEach((r) => handled.add(idStr(r._id)));
  } else if (systemRoles.length === 1) {
    const [admin] = systemRoles;
    handled.add(idStr(admin._id));
    const rivals = roles.filter((r) => r !== admin && (r.templateKey === TENANT_ADMIN_KEY || r.name === TENANT_ADMIN_KEY));
    const used = rivals.filter((r) => users(r) > 0);
    if (used.length) {
      plan.blockers.push(`role(s) ${used.map((r) => `"${r.name}" (${users(r)} user(s))`).join(', ')} already `
        + `${used.length > 1 ? 'are' : 'is'} the company's tenant_admin and in use. The admin role "${admin.name}" was `
        + 'not changed. Move those users to the admin role (or the other way round) and run again.');
      rivals.forEach((r) => handled.add(idStr(r._id)));
    } else {
      for (const r of rivals) {
        plan.removeRoles.push({ id: r._id, name: r.name, reason: 'an unused tenant_admin role (e.g. from an earlier role sync); '
          + `the admin role "${admin.name}" takes its place` });
        handled.add(idStr(r._id));
      }
      plan.adminUpdate = {
        id: admin._id,
        name: admin.name,
        users: users(admin),
        from: { templateKey: admin.templateKey ?? null, managedBy: admin.managedBy ?? null, isSystemRole: true },
        set: { templateKey: TENANT_ADMIN_KEY, managedBy: 'platform', isSystemRole: false },
      };
    }
  } else {
    const linked = roles.filter((r) => r.templateKey === TENANT_ADMIN_KEY);
    linked.forEach((r) => handled.add(idStr(r._id)));
    if (linked.length === 1) plan.notes.push(`admin already migrated: role "${linked[0].name}" is tenant_admin`);
    else if (linked.length > 1) plan.blockers.push(`${linked.length} roles are linked to tenant_admin; keep one`);
    else plan.notes.push('no admin role found; the role sync will create tenant_admin (no user is on it yet)');
  }

  // ── Every other role ──
  const linkedNow = new Map(); // template key → role names already linked to it
  const candidates = [];
  for (const role of roles) {
    if (handled.has(idStr(role._id))) continue;
    if (role.templateKey && templateKeys.includes(role.templateKey) && role.templateKey !== TENANT_ADMIN_KEY) {
      plan.alreadyLinked.push({ name: role.name, templateKey: role.templateKey });
      linkedNow.set(role.templateKey, [...(linkedNow.get(role.templateKey) || []), role.name]);
      continue;
    }
    candidates.push(role);
  }

  const matchFor = (role) => {
    const sourceKey = sourceLinks.get(idStr(role._id));
    if (sourceKey) return sourceKey;
    const n = normalizeRoleName(role.name);
    return templates.find((t) => normalizeRoleName(t.key) === n)?.key || null;
  };
  const suggestionFor = (role) => {
    const names = [role.name, role.displayName].filter(Boolean).map(normalizeRoleName);
    const loose = (s) => s.replace(/[\s_-]+/g, '');
    const hits = templates.filter((t) => t.key !== TENANT_ADMIN_KEY && names.some((n) =>
      n === normalizeRoleName(t.displayName) || loose(n) === loose(normalizeRoleName(t.key))));
    return hits.length ? hits.map((t) => t.key).join(' or ') : null;
  };

  const matched = candidates.map((role) => ({ role, key: matchFor(role) }));
  const perKey = matched.reduce((m, { key }) => (key ? m.set(key, (m.get(key) || 0) + 1) : m), new Map());

  for (const { role, key } of matched) {
    const row = {
      roleName: role.name,
      displayName: role.displayName || '',
      permissions: [...(role.permissions || [])],
      users: users(role),
      isActive: role.isActive !== false,
      managedBy: role.managedBy ?? null,
    };
    if (!key) {
      plan.unmatched.push({ ...row, reason: 'no template with this name', suggestion: suggestionFor(role) });
    } else if (key === TENANT_ADMIN_KEY) {
      plan.unmatched.push({ ...row, reason: 'named like the admin template, but it is not the admin role', suggestion: null });
    } else if (perKey.get(key) > 1 || linkedNow.has(key)) {
      const others = [
        ...matched.filter((m) => m.key === key && m.role !== role).map((m) => `"${m.role.name}"`),
        ...(linkedNow.get(key) || []).map((n) => `"${n}" (already linked)`),
      ];
      plan.unmatched.push({ ...row, reason: `template "${key}" also matches ${others.join(', ')}`, suggestion: key });
    } else {
      plan.links.push({
        id: role._id,
        name: role.name,
        templateKey: key,
        users: row.users,
        from: { templateKey: role.templateKey ?? null, managedBy: role.managedBy ?? null },
      });
    }
  }

  const adminLinked = Boolean(plan.adminUpdate) || plan.notes.some((n) => n.startsWith('admin already migrated'));
  plan.roleTemplateKeys.after = uniq([
    ...roleTemplateKeys.filter((k) => !RETIRED_TEMPLATE_KEYS.includes(k)),
    ...(adminLinked || plan.blockers.length === 0 ? [TENANT_ADMIN_KEY] : []),
    ...plan.links.map((l) => l.templateKey),
    ...plan.alreadyLinked.map((l) => l.templateKey),
  ]);
  return plan;
};

// ── Planning (reads only) ──

const listChanges = (before, after) => ({
  added: after.filter((k) => !before.includes(k)),
  removed: before.filter((k) => !after.includes(k)),
});

/**
 * Build the whole plan. Reads the platform DB and every company DB; writes nothing.
 *
 * deps: { models, openCompany(record) → {Role, User, close}, legacyTenants,
 *         resolveLegacyTenant, platformAccount: {email, name}, newId() }
 */
const buildPlan = async (deps, { sourceKey = DEFAULT_SOURCE_KEY } = {}) => {
  const { Tenant, RoleTemplate, PlatformUser } = deps.models;
  const plan = { sourceKey, templates: {}, tenants: {}, companies: [], retire: [], platformUser: null, warnings: [] };

  // Step 1: templates from code
  const existingTemplates = await RoleTemplate.find({}).lean();
  const existingKeys = existingTemplates.map((t) => t.key);
  plan.templates.fromCode = ROLE_TEMPLATES.map((t) => ({
    key: t.key,
    exists: existingKeys.includes(t.key),
    doc: { key: t.key, displayName: t.displayName, description: t.description,
      permissions: [...t.permissions], assignableByTenant: t.assignableByTenant },
  }));
  const keysAfterCode = uniq([...existingKeys, ...ROLE_TEMPLATES.map((t) => t.key)])
    .filter((k) => !RETIRED_TEMPLATE_KEYS.includes(k));

  // Step 3 (planned before 2: the source company's database comes from its record)
  const tenantRecords = await Tenant.find({}).lean();
  const byKey = new Map(tenantRecords.map((t) => [t.key, t]));
  plan.tenants.existing = [];
  plan.tenants.create = [];
  for (const [rawKey, legacy] of Object.entries(deps.legacyTenants || {})) {
    const key = rawKey.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      const notes = [];
      if (existing.status !== 'active') notes.push(`status is "${existing.status}", left as is`);
      const missing = MODULES.filter((m) => !(existing.enabledModules || []).includes(m));
      if (missing.length) notes.push(`modules not enabled: ${missing.join(', ')} (left as is)`);
      plan.tenants.existing.push({ key, dbName: existing.dbName, status: existing.status, notes });
      continue;
    }
    const live = deps.resolveLegacyTenant(key, legacy);
    if (!live.dbName) {
      plan.warnings.push(`company ${key}: no MongoDB URI is configured for it in this environment, so its database `
        + 'is unknown. Skipped; run with the same env as the server.');
      continue;
    }
    const clash = tenantRecords.find((t) => t.dbName === live.dbName);
    if (clash) {
      plan.warnings.push(`company ${key}: database "${live.dbName}" is already registered to ${clash.key}. Skipped.`);
      continue;
    }
    const record = {
      _id: deps.newId(),
      key,
      name: legacy.name,
      dbName: live.dbName,
      dbUriEnv: live.dbUriEnv,
      status: 'active',
      enabledModules: [...MODULES],
      roleTemplateKeys: ROLE_TEMPLATES.map((t) => t.key),
      limits: { maxUsers: null },
      allowSelfSignup: false,
      createdBy: null,
    };
    plan.tenants.create.push({ record, labelledDbName: legacy.dbName });
    byKey.set(key, record);
  }

  // Companies whose roles are migrated: every registered (or about to be) company
  // except one still being provisioned through the new endpoint.
  const companies = [...byKey.values()]
    .filter((t) => !['provisioning', 'failed'].includes(t.status))
    .sort((a, b) => a.key.localeCompare(b.key));

  const roleData = new Map(); // key → { roles, userCounts } | { error }
  for (const record of companies) {
    let company;
    try {
      company = await deps.openCompany(record);
      const roles = await company.Role.find({}).lean();
      const userCounts = new Map();
      for (const r of roles) userCounts.set(idStr(r._id), await company.User.countDocuments({ roleId: r._id }));
      roleData.set(record.key, { roles, userCounts });
    } catch (err) {
      roleData.set(record.key, { error: deps.redact(err?.message) });
    } finally {
      if (company) await company.close().catch(() => {});
    }
  }

  // Step 2: templates from the source company's roles
  const source = byKey.get(sourceKey);
  const sourceData = roleData.get(sourceKey);
  if (!source) throw new Error(`source company "${sourceKey}" is not registered and not in legacyTenants.js`);
  if (!sourceData || sourceData.error) {
    throw new Error(`cannot read the roles of source company "${sourceKey}": ${sourceData?.error || 'not processed'}`);
  }
  const fromSource = planSourceTemplates({ sourceRoles: sourceData.roles, templateKeys: keysAfterCode });
  plan.templates.fromSource = { dbName: source.dbName, ...fromSource };

  const templatesAfter = [
    ...existingTemplates.filter((t) => !RETIRED_TEMPLATE_KEYS.includes(t.key)).map((t) => ({ key: t.key, displayName: t.displayName })),
    ...plan.templates.fromCode.filter((t) => !t.exists).map((t) => ({ key: t.key, displayName: t.doc.displayName })),
    ...fromSource.create.map((t) => ({ key: t.key, displayName: t.displayName })),
  ];

  // Step 4
  for (const record of companies) {
    const data = roleData.get(record.key);
    if (data.error) {
      plan.companies.push({ tenant: record, error: data.error });
      continue;
    }
    const companyPlan = planCompanyRoles({
      roles: data.roles,
      userCounts: data.userCounts,
      templates: templatesAfter,
      sourceLinks: record.key === sourceKey ? fromSource.links : new Map(),
      roleTemplateKeys: record.roleTemplateKeys || [],
    });
    plan.companies.push({ tenant: record, ...companyPlan });
  }

  // Step 5: retire templates nobody will list any more
  for (const key of RETIRED_TEMPLATE_KEYS) {
    const doc = existingTemplates.find((t) => t.key === key);
    if (!doc) continue;
    const stillListed = plan.companies
      .filter((c) => (c.error ? (c.tenant.roleTemplateKeys || []) : c.roleTemplateKeys.after).includes(key))
      .map((c) => c.tenant.key);
    const otherTenants = tenantRecords.filter((t) => !companies.includes(t) && (t.roleTemplateKeys || []).includes(key));
    plan.retire.push({ key, id: doc._id, blockedBy: [...stillListed, ...otherTenants.map((t) => t.key)] });
  }

  // Step 6: platform account
  const { email, name } = deps.platformAccount;
  if (!email || !name) {
    plan.platformUser = { action: 'skip', reason: 'PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_NAME must both be set' };
  } else {
    const user = await PlatformUser.findOne({ email })
      .select('+passwordHash +passwordSetTokenHash +passwordSetExpires').lean();
    if (!user) plan.platformUser = { action: 'create', email, name };
    else if (user.passwordHash) plan.platformUser = { action: 'skip', email, reason: 'exists and has a password' };
    else if (user.passwordSetTokenHash && user.passwordSetExpires > new Date()) {
      plan.platformUser = { action: 'skip', email, reason: `a set-password link was sent; valid until ${user.passwordSetExpires.toISOString()}` };
    } else plan.platformUser = { action: 'sendLink', email, id: user._id, reason: 'exists without a password; its link is used up or expired' };
  }

  return plan;
};

// ── Printing ──

const fmtList = (values) => (values.length ? values.join(', ') : '-');

const printPlan = (plan, log, { apply }) => {
  const will = apply ? '' : 'would ';
  log(`\n1. Role templates from code (config/defaultRoles.js)`);
  for (const t of plan.templates.fromCode) {
    log(t.exists ? `   = ${t.key}: exists, left as is` : `   + ${t.key}: ${will}create (${t.doc.permissions.length} permission(s))`);
  }

  const src = plan.templates.fromSource;
  log(`\n2. Role templates from ${plan.sourceKey}'s roles (database ${src.dbName})`);
  if (!src.create.length && !src.skipped.length) log('   nothing new: every role already has a template (or is the admin role)');
  for (const t of src.create) {
    log(`   + ${t.key}: ${will}create from role "${t.sourceRoleName}" ("${t.displayName}", ${t.permissions.length} permission(s))`);
    if (t.dropped.length) log(`       dropped (platform-only or unknown): ${t.dropped.join(', ')}`);
  }
  for (const s of src.skipped) log(`   ! "${s.roleName}": not made a template: ${s.reason}`);

  log('\n3. Company records (platform tenants)');
  for (const t of plan.tenants.existing) {
    log(`   = ${t.key}: registered (database ${t.dbName}, ${t.status})${t.notes.length ? `; ${t.notes.join('; ')}` : ''}`);
  }
  for (const { record, labelledDbName } of plan.tenants.create) {
    log(`   + ${record.key}: ${will}create "${record.name}", active, database ${record.dbName} `
      + `(URI from ${record.dbUriEnv || 'MONGODB_BASE_URI'}), all ${record.enabledModules.length} modules`);
    if (labelledDbName && labelledDbName !== record.dbName) {
      log(`       note: labelled "${labelledDbName}" in legacyTenants.js; "${record.dbName}" is the database its URI uses`);
    }
  }
  for (const w of plan.warnings) log(`   ! ${w}`);

  log('\n4. Company roles');
  for (const c of plan.companies) {
    log(`   ${c.tenant.key} (database ${c.tenant.dbName})`);
    if (c.error) {
      log(`     ! cannot read this company's roles: ${c.error}. Skipped.`);
      continue;
    }
    for (const b of c.blockers) log(`     ! ${b}`);
    for (const n of c.notes) log(`     = ${n}`);
    if (c.adminUpdate) {
      const a = c.adminUpdate;
      log(`     ~ admin role "${a.name}" (${a.id}, ${a.users} user(s) keep it): ${will}set `
        + `templateKey ${a.from.templateKey ?? '(none)'} → tenant_admin, managedBy ${a.from.managedBy ?? '(none)'} → platform, `
        + 'isSystemRole true → false');
    }
    for (const r of c.removeRoles) log(`     - role "${r.name}" (${r.id}): ${will}delete: ${r.reason}`);
    for (const l of c.links) {
      log(`     ~ "${l.name}" (${l.users} user(s)): ${will}link to template ${l.templateKey}`
        + `${l.from.managedBy && l.from.managedBy !== 'platform' ? ` (was managedBy ${l.from.managedBy})` : ''}`);
    }
    for (const l of c.alreadyLinked) log(`     = "${l.name}": already linked to ${l.templateKey}`);
    if (c.unmatched.length) log(`     ? ${c.unmatched.length} role(s) left alone, see the unmatched report`);
    const { added, removed } = listChanges(c.roleTemplateKeys.before, c.roleTemplateKeys.after);
    if (added.length || removed.length) {
      log(`     roleTemplateKeys: ${will}add ${fmtList(added)}; remove ${fmtList(removed)}`);
    }
  }

  log('\n5. Retired templates');
  if (!plan.retire.length) log('   nothing to retire');
  for (const r of plan.retire) {
    log(r.blockedBy.length
      ? `   ! ${r.key}: kept, still listed by ${r.blockedBy.join(', ')}`
      : `   - ${r.key}: ${will}delete (no company lists it any more)`);
  }

  log('\n6. Platform account');
  const p = plan.platformUser;
  if (p.action === 'skip') log(`   = ${p.email ? `${p.email}: ` : ''}skipped: ${p.reason}`);
  if (p.action === 'create') log(`   + ${p.email} ("${p.name}", owner): ${will}create without a password and email a set-password link`);
  if (p.action === 'sendLink') log(`   ~ ${p.email}: ${will}email a new set-password link (${p.reason})`);
};

const unmatchedRows = (plan) => plan.companies.flatMap((c) => (c.unmatched || []).map((u) => ({ company: c.tenant.key, ...u })));

const printUnmatched = (plan, log) => {
  const rows = unmatchedRows(plan);
  log(`\nUnmatched custom roles: ${rows.length} (not changed; decide each one)`);
  for (const r of rows) {
    log(`   ${r.company}  "${r.roleName}"${r.displayName && r.displayName !== r.roleName ? ` (shown as "${r.displayName}")` : ''}`
      + `  users: ${r.users}${r.isActive ? '' : '  [inactive]'}`);
    log(`       why: ${r.reason}${r.suggestion ? `; closest template: ${r.suggestion}` : ''}`);
    log(`       permissions (${r.permissions.length}): ${fmtList(r.permissions)}`);
  }
};

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const unmatchedCsv = (plan) => [
  ['company', 'role', 'display name', 'users', 'active', 'reason', 'closest template', 'permissions'].map(csvCell).join(','),
  ...unmatchedRows(plan).map((r) => [r.company, r.roleName, r.displayName, r.users, r.isActive, r.reason,
    r.suggestion || '', r.permissions.join(' ')].map(csvCell).join(',')),
].join('\n');

// ── Applying ──

const applyPlan = async (plan, deps, log) => {
  const { Tenant, RoleTemplate, PlatformAuditLog } = deps.models;
  const audit = (entry) => PlatformAuditLog.record({ actor: SYSTEM_ACTOR, before: null, ...entry });
  const createTemplate = async (doc, how) => {
    if (await RoleTemplate.findOne({ key: doc.key }).lean()) {
      log(`   = ${doc.key}: appeared meanwhile, left as is`);
      return;
    }
    const created = await RoleTemplate.create(doc);
    await audit({ action: 'roleTemplate.create', targetType: 'RoleTemplate', targetId: created._id, targetKey: created.key,
      after: { ...doc, version: created.version, createdBy: how } });
    log(`   + ${doc.key}: created`);
  };

  log('\nApplying...');
  for (const t of plan.templates.fromCode.filter((x) => !x.exists)) await createTemplate(t.doc, 'migrateToPlatform (code)');
  for (const t of plan.templates.fromSource.create) {
    const { dropped, sourceRoleName, ...doc } = t;
    await createTemplate(doc, `migrateToPlatform (role "${sourceRoleName}" of ${plan.sourceKey})`);
  }

  for (const { record } of plan.tenants.create) {
    if (await Tenant.findOne({ key: record.key }).lean()) {
      log(`   = tenant ${record.key}: appeared meanwhile, left as is`);
      continue;
    }
    const { _id, ...fields } = record;
    const doc = await Tenant.create({ _id, ...fields });
    await audit({ action: 'tenant.create', targetType: 'Tenant', targetId: doc._id, targetKey: doc.key, after: doc.toObject() });
    log(`   + tenant ${doc.key}: created`);
  }

  const failed = [];
  for (const c of plan.companies) {
    if (c.error) {
      failed.push(c.tenant.key);
      continue;
    }
    const done = { adminRole: null, removedRoles: [], linkedRoles: [] };
    let company;
    try {
      company = await deps.openCompany(c.tenant);
      const { Role, User } = company;
      if (c.adminUpdate) {
        const res = await Role.updateOne({ _id: c.adminUpdate.id, isSystemRole: true }, { $set: c.adminUpdate.set });
        done.adminRole = { name: c.adminUpdate.name, matched: res.matchedCount ?? res.n ?? null };
      }
      for (const r of c.removeRoles) {
        if ((await User.countDocuments({ roleId: r.id })) > 0) {
          throw new Error(`role "${r.name}" gained users since the plan was made; nothing more changed for this company`);
        }
        // findOneAndDelete, as roles.routes.js does (Role's pre('deleteOne') hook is for the old system role).
        await Role.findOneAndDelete({ _id: r.id, isSystemRole: { $ne: true } });
        done.removedRoles.push(r.name);
      }
      for (const l of c.links) {
        await Role.updateOne({ _id: l.id }, { $set: { templateKey: l.templateKey, managedBy: 'platform' } });
        done.linkedRoles.push({ name: l.name, templateKey: l.templateKey });
      }

      const { added, removed } = listChanges(c.roleTemplateKeys.before, c.roleTemplateKeys.after);
      if (added.length || removed.length) {
        await Tenant.updateOne({ _id: c.tenant._id }, { $set: { roleTemplateKeys: c.roleTemplateKeys.after } });
        await audit({ action: 'tenant.update', targetType: 'Tenant', targetId: c.tenant._id, targetKey: c.tenant.key,
          before: { roleTemplateKeys: c.roleTemplateKeys.before }, after: { roleTemplateKeys: c.roleTemplateKeys.after } });
      }
      log(`   ~ ${c.tenant.key}: admin ${done.adminRole ? 'updated' : 'unchanged'}, ${done.removedRoles.length} removed, `
        + `${done.linkedRoles.length} linked, roleTemplateKeys +${added.length}/-${removed.length}`);
    } catch (err) {
      failed.push(c.tenant.key);
      log(`   ! ${c.tenant.key}: FAILED: ${deps.redact(err?.message)}`);
      done.error = deps.redact(err?.message);
    } finally {
      if (company) await company.close().catch(() => {});
    }
    if (done.adminRole || done.removedRoles.length || done.linkedRoles.length || done.error) {
      await audit({ action: 'tenant.rolesMigrated', targetType: 'Tenant', targetId: c.tenant._id, targetKey: c.tenant.key,
        after: { ...done, unmatched: c.unmatched.map((u) => u.roleName), blockers: c.blockers } });
    }
  }

  for (const r of plan.retire.filter((x) => !x.blockedBy.length)) {
    const listedBy = await Tenant.countDocuments({ roleTemplateKeys: r.key });
    if (listedBy > 0) {
      log(`   ! template ${r.key}: kept, ${listedBy} company(ies) still list it`);
      continue;
    }
    const before = await RoleTemplate.findOne({ _id: r.id }).lean();
    if (!before) continue;
    await RoleTemplate.deleteOne({ _id: r.id });
    await audit({ action: 'roleTemplate.delete', targetType: 'RoleTemplate', targetId: r.id, targetKey: r.key, before });
    log(`   - template ${r.key}: deleted`);
  }

  const p = plan.platformUser;
  if (p.action === 'create' || p.action === 'sendLink') {
    try {
      const id = p.action === 'create'
        ? (await deps.platformUsers.createInvited({ email: p.email, name: p.name, role: 'owner', actor: SYSTEM_ACTOR }))._id
        : p.id;
      const { expiresAt } = await deps.platformUsers.sendLink({ userId: id, actor: SYSTEM_ACTOR });
      log(`   + platform account ${p.email}: ${p.action === 'create' ? 'created; ' : ''}set-password link sent `
        + `(valid until ${expiresAt.toISOString()})`);
    } catch (err) {
      failed.push(`platform account ${p.email}`);
      log(`   ! platform account ${p.email}: FAILED: ${deps.redact(err?.message)}. Run again to retry.`);
    }
  }
  return { failed };
};

/**
 * Checks that must pass before --apply writes anything.
 * @returns {string[]} problems
 */
const preflight = (plan, deps) => {
  const problems = [];
  const p = plan.platformUser;
  if (p.action === 'create' || p.action === 'sendLink') {
    const urlProblem = deps.platformUsers.consoleUrlProblem();
    if (urlProblem) problems.push(urlProblem);
    if (!deps.emailConfigured()) {
      problems.push('Email is not configured (RESEND_API_KEY), so the set-password link cannot be sent.');
    }
  }
  return problems;
};

/** Plan, print, and with apply: true, write. */
const migrate = async (deps, { apply = false, sourceKey = DEFAULT_SOURCE_KEY, csvPath = null, log = console.log } = {}) => {
  log(apply
    ? 'MIGRATION — APPLY: the changes below are written.'
    : 'MIGRATION — DRY RUN: nothing is written. Re-run with --apply to make these changes.');
  log(`Platform database: ${deps.platformDbName}   source company for templates: ${sourceKey}`);

  const plan = await buildPlan(deps, { sourceKey });
  printPlan(plan, log, { apply });
  printUnmatched(plan, log);
  if (csvPath) {
    fs.writeFileSync(csvPath, `${unmatchedCsv(plan)}\n`);
    log(`\nUnmatched-roles report written to ${csvPath}`);
  }

  if (!apply) {
    log('\nDry run: nothing was written.');
    return { plan, failed: [] };
  }

  const problems = preflight(plan, deps);
  if (problems.length) {
    problems.forEach((m) => log(`! ${m}`));
    throw new Error('Nothing was written: fix the problems above and run again.');
  }
  const { failed } = await applyPlan(plan, deps, log);
  log(failed.length ? `\nDone with failures: ${failed.join(', ')}. Fix and run again.` : '\nDone.');
  log('Next: npm run platform:sync-roles -- --all   (dry run; then add --apply) to give the linked roles '
    + 'their templates\' permissions.');
  return { plan, failed };
};

const parseArgs = (argv) => {
  const args = { apply: false, dryRunFlag: false, sourceKey: DEFAULT_SOURCE_KEY, csvPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.dryRunFlag = true;
    else if (arg === '--source' || arg === '--csv') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      if (arg === '--source') args.sourceKey = value.trim().toLowerCase();
      else args.csvPath = value;
      i += 1;
    } else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.apply && args.dryRunFlag) throw new Error('Pass either --dry-run or --apply, not both');
  return args;
};

// ── Command line ──

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n${USAGE}`);
    process.exit(2);
  }
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  (async () => {
    const mongoose = require('mongoose');
    const { connectPlatformDb, closePlatformDb, getPlatformDbName } = require('../platform/db');
    const { getPlatformModels } = require('../platform/models');
    const { openUncachedConnection } = require('../config/connectionManager');
    const { getModelForConnection } = require('../config/modelRegistry');
    const { mapTenantRecord, redactUris } = require('../config/tenants');
    const { tenants: legacyTenants } = require('../platform/scripts/legacyTenants');
    const { resolveLegacyTenant } = require('../platform/scripts/seedPlatform');
    const platformUsers = require('../platform/services/platformUser.service');
    const { isEmailConfigured } = require('../utils/email');

    let code = 0;
    try {
      await connectPlatformDb();
      const deps = {
        models: getPlatformModels(),
        platformDbName: getPlatformDbName(),
        legacyTenants,
        resolveLegacyTenant,
        newId: () => new mongoose.Types.ObjectId(),
        redact: redactUris,
        openCompany: async (record) => {
          const conn = await openUncachedConnection(mapTenantRecord(record));
          return {
            Role: getModelForConnection(conn, 'Role'),
            User: getModelForConnection(conn, 'User'),
            close: () => conn.close(),
          };
        },
        platformAccount: {
          email: platformUsers.normalizeEmail(process.env.PLATFORM_ADMIN_EMAIL),
          name: (process.env.PLATFORM_ADMIN_NAME || '').trim(),
        },
        platformUsers: {
          createInvited: platformUsers.createInvitedPlatformUser,
          sendLink: platformUsers.sendPlatformSetPasswordLink,
          consoleUrlProblem: () => {
            try {
              platformUsers.buildPlatformSetPasswordUrl('0'.repeat(64));
              return null;
            } catch (err) {
              return err.message;
            }
          },
        },
        emailConfigured: isEmailConfigured,
      };
      const { failed } = await migrate(deps, args);
      code = failed.length ? 1 : 0;
    } catch (err) {
      console.error(`Migration failed: ${redactUris(err?.message)}`);
      code = 1;
    }
    await closePlatformDb().catch(() => {});
    process.exit(code);
  })();
}

module.exports = {
  normalizeRoleName,
  templateKeyFromRoleName,
  planSourceTemplates,
  planCompanyRoles,
  buildPlan,
  migrate,
  parseArgs,
  unmatchedCsv,
};
