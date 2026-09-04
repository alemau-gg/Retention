/**
 * Verify Knowledge Retention Backend action sources before calling a change done.
 *
 * Checks helper drift, missing helper methods, forbidden modules, ACTION_SLUG,
 * and that code only reads declared manifest inputs/auth fields.
 *
 * You must pass the FULL live action set + live manifest from Langdock.
 * A partial set cannot return ok: true.
 *
 * data.input = {
 *   actions: { [slug]: sourceString, ... },
 *   manifest: { actions: [...], authFields: [...] },
 *   authTest?: string
 * }
 */

const HELPER_START = 'const KnowledgeRetentionUtils = {';
const HELPER_END = '\n};\n';
const FORBIDDEN = ['require(', 'import ', 'module.exports', 'exports.'];

/** Must match the live Knowledge Retention Backend. Update when you add/remove an action. */
const REQUIRED_ACTION_SLUGS = [
  'get_runtime_state',
  'create_interview',
  'save_discovery',
  'save_topics_and_questions',
  'set_up_interview_folder',
  'save_consent',
  'save_answer',
  'revise_answer',
  'save_topic_summary',
  'generate_topic_document',
  'get_answers',
  'get_discovery',
  'finalize_interview',
  'upload_document',
  'save_feedback',
  'abandon_interview',
  'admin_describe_schema',
  'admin_query_records',
  'read_supporting_document',
];

function helperBlock(source) {
  const start = source.indexOf(HELPER_START);
  if (start < 0) return null;
  const end = source.indexOf(HELPER_END, start);
  if (end < 0) return null;
  return { text: source.slice(start, end + HELPER_END.length), start, end: end + HELPER_END.length };
}

/** Blank comments/strings so identifier scans ignore prose; keep newlines. */
function stripLiterals(source) {
  const out = [];
  const blank = (ch) => out.push(ch === '\n' ? '\n' : ' ');
  const keep = (ch) => out.push(ch);
  let i = 0;
  let prevMeaningful = '';

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') blank(source[i++]);
      continue;
    }
    if (ch === '/' && next === '*') {
      blank(source[i++]);
      blank(source[i++]);
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) blank(source[i++]);
      if (i < source.length) {
        blank(source[i++]);
        blank(source[i++]);
      }
      continue;
    }
    if (ch === '/' && /^$|[(,=:[!&|?{};+\-*%~^]$/.test(prevMeaningful)) {
      blank(source[i++]);
      let inClass = false;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') {
          blank(source[i++]);
          if (i < source.length) blank(source[i++]);
          continue;
        }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
          blank(source[i++]);
          break;
        } else if (c === '\n') break;
        blank(source[i++]);
      }
      while (i < source.length && /[gimsuy]/.test(source[i])) blank(source[i++]);
      prevMeaningful = ')';
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      blank(source[i++]);
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') blank(source[i++]);
        if (i < source.length) blank(source[i++]);
      }
      if (i < source.length) blank(source[i++]);
      prevMeaningful = quote;
      continue;
    }
    if (ch === '`') {
      blank(source[i++]);
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') {
          blank(source[i++]);
          if (i < source.length) blank(source[i++]);
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          keep(source[i++]);
          keep(source[i++]);
          let depth = 1;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            if (depth > 0 && i < source.length) keep(source[i++]);
          }
          continue;
        }
        blank(source[i++]);
      }
      if (i < source.length) blank(source[i++]);
      prevMeaningful = '`';
      continue;
    }

    if (!/\s/.test(ch)) prevMeaningful = ch;
    keep(source[i++]);
  }
  return out.join('');
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function helperMethodNames(blockText) {
  const names = new Set();
  const re = /^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*[:(]/gm;
  let m;
  while ((m = re.exec(blockText))) names.add(m[1]);
  return names;
}

function verifyHelpers(input) {
  const actions = (input && input.actions) || {};
  const manifest = (input && input.manifest) || null;
  const authTest = (input && input.authTest) || '';
  const adminSlugs = new Set(
    (input && input.adminSlugs) || ['admin_describe_schema', 'admin_query_records'],
  );
  const canonicalSlug = (input && input.canonicalSlug) || 'get_runtime_state';

  const blockers = [];
  const risks = [];
  const passed = [];

  if (!manifest || !Array.isArray(manifest.actions) || !Array.isArray(manifest.authFields)) {
    return {
      ok: false,
      passed: [],
      risks: [],
      blockers: ['manifest must include actions[] and authFields[] — use the live Knowledge Retention Backend manifest from Langdock'],
      summary: 'invalid input',
    };
  }

  const manifestSlugs = manifest.actions.map((a) => a.slug).sort();
  const requiredSorted = REQUIRED_ACTION_SLUGS.slice().sort();
  if (manifestSlugs.join(',') !== requiredSorted.join(',')) {
    const missing = REQUIRED_ACTION_SLUGS.filter((s) => manifestSlugs.indexOf(s) < 0);
    const extra = manifestSlugs.filter((s) => REQUIRED_ACTION_SLUGS.indexOf(s) < 0);
    if (missing.length) blockers.push(`Live manifest missing expected actions: ${missing.join(', ')} (update REQUIRED_ACTION_SLUGS in this script if the backend intentionally changed)`);
    if (extra.length) blockers.push(`Live manifest has unexpected actions: ${extra.join(', ')} (update REQUIRED_ACTION_SLUGS in this script if you added them on purpose)`);
  }

  for (const slug of REQUIRED_ACTION_SLUGS) {
    if (typeof actions[slug] !== 'string' || !actions[slug]) {
      blockers.push(`Missing required action source: ${slug} — fetch the full live Knowledge Retention Backend`);
    }
  }
  for (const slug of Object.keys(actions)) {
    if (REQUIRED_ACTION_SLUGS.indexOf(slug) < 0) {
      blockers.push(`Unexpected action source "${slug}" — not in the known KR Backend set`);
    }
  }

  if (blockers.length) {
    return {
      ok: false,
      passed,
      risks,
      blockers,
      summary: `${blockers.length} blocker(s). Do not treat the backend change as done.`,
    };
  }

  const authSlugs = new Set(manifest.authFields.map((f) => f.slug));
  const actionSlugs = Object.keys(actions);
  const helperFingerprints = new Map(); // normalized helper → [slugs]

  for (const slug of actionSlugs.sort()) {
    const source = actions[slug];
    const isAdmin = adminSlugs.has(slug) || slug.indexOf('admin_') === 0;
    const clean = stripLiterals(source);

    for (const token of FORBIDDEN) {
      const idx = clean.indexOf(token);
      if (idx > -1) {
        blockers.push(`[no-modules] ${slug}:${lineOf(source, idx)} uses "${token.trim()}"`);
      }
    }

    const block = helperBlock(source);
    if (!block) {
      if (!isAdmin) blockers.push(`[helper-block] ${slug} has no KnowledgeRetentionUtils block`);
      continue;
    }

    const defined = helperMethodNames(block.text);
    const seenKeys = new Map();
    const keyRe = /^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*[:(]/gm;
    let km;
    while ((km = keyRe.exec(block.text))) {
      seenKeys.set(km[1], (seenKeys.get(km[1]) || 0) + 1);
    }
    for (const [key, count] of seenKeys) {
      if (count > 1) blockers.push(`[duplicate-key] ${slug}: helper defines "${key}" ${count} times`);
    }

    const callRe = /KnowledgeRetentionUtils\.([A-Za-z_$][\w$]*)/g;
    let cm;
    while ((cm = callRe.exec(clean))) {
      if (!defined.has(cm[1])) {
        blockers.push(
          `[missing-helper] ${slug}:${lineOf(clean, cm.index)} calls KnowledgeRetentionUtils.${cm[1]} which this file does not define`,
        );
      }
    }

    const slugMatch = block.text.match(/ACTION_SLUG: '([a-z_]+)',/);
    if (!isAdmin) {
      if (!slugMatch) {
        blockers.push(`[action-slug] ${slug}: helper missing ACTION_SLUG`);
      } else if (slugMatch[1] !== slug) {
        blockers.push(`[action-slug] ${slug}: ACTION_SLUG is "${slugMatch[1]}"`);
      }

      const normalized = block.text.replace(/ACTION_SLUG: '[a-z_]+',/, "ACTION_SLUG: 'X',");
      if (!helperFingerprints.has(normalized)) helperFingerprints.set(normalized, []);
      helperFingerprints.get(normalized).push(slug);
    }

    const manifestAction = manifest.actions.find((a) => a.slug === slug);
    if (manifestAction) {
      const declared = new Set((manifestAction.inputFields || []).map((f) => f.slug));
      const inputRe = /data\.input\.([A-Za-z_$][\w$]*)/g;
      let im;
      while ((im = inputRe.exec(clean))) {
        if (!declared.has(im[1])) {
          blockers.push(
            `[manifest-input] ${slug}:${lineOf(clean, im.index)} reads data.input.${im[1]} which is not declared`,
          );
        }
      }
    }

    const authRe = /data\.auth\.([A-Za-z_$][\w$]*)/g;
    let am;
    while ((am = authRe.exec(clean))) {
      if (!authSlugs.has(am[1])) {
        blockers.push(
          `[manifest-auth] ${slug}:${lineOf(clean, am.index)} reads data.auth.${am[1]} (have: ${[...authSlugs].join(', ')})`,
        );
      }
    }

    // Must-keep helper methods historically wiped by a trimmed sync
    if (!isAdmin) {
      for (const must of [
        'graph',
        'graphToken',
        'interviewFolderPath',
        'answeredQuestionCount',
        'computeState',
        'failureMessage',
        'dv',
        'STATUS',
        'SCHEMA',
        'MESSAGES',
      ]) {
        if (!defined.has(must)) {
          blockers.push(`[trimmed-helper] ${slug}: helper missing required member "${must}"`);
        }
      }
    }
  }

  if (helperFingerprints.size > 1) {
    const parts = [];
    for (const [, files] of helperFingerprints) {
      parts.push(`${files.length}: ${files.join(', ')}`);
    }
    blockers.push(
      `[helper-drift] non-admin actions carry ${helperFingerprints.size} different helper blocks → ${parts.join(' | ')}`,
    );
  } else if (helperFingerprints.size === 1) {
    const n = [...helperFingerprints.values()][0].length;
    passed.push(`helper block byte-identical across ${n} non-admin actions (ACTION_SLUG aside)`);
  }

  if (typeof actions[canonicalSlug] === 'string') {
    passed.push(`canonical ${canonicalSlug} present`);
  } else {
    blockers.push(`canonical actions.${canonicalSlug} missing`);
  }

  if (authTest) {
    const cleanAuth = stripLiterals(authTest);
    const authRe = /(?:data\.auth|auth)\.([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = authRe.exec(cleanAuth))) {
      if (m[1] === 'auth') continue;
      if (!authSlugs.has(m[1])) {
        risks.push(`[authtest-auth] authTest reads auth.${m[1]} which is not a manifest authField`);
      }
    }
  }

  const ok = blockers.length === 0;
  return {
    ok,
    passed,
    risks,
    blockers,
    summary: ok
      ? `All static checks passed (${actionSlugs.length} actions). Run Langdock action Test on changed paths before closing.`
      : `${blockers.length} blocker(s). Do not treat the backend change as done.`,
  };
}

if (typeof data !== 'undefined' && data && data.input) {
  return verifyHelpers(data.input);
}
