/**
 * Sync shared helpers across Knowledge Retention Backend actions.
 *
 * Copies the KnowledgeRetentionUtils block from get_runtime_state into every
 * other non-admin action, keeping each action's own ACTION_SLUG.
 *
 * 1. Fetch every KR Backend action source via Langdock tools.
 * 2. Run this script with data.input.actions = { slug: source, ... }.
 * 3. Write each updates[slug] back via Langdock.
 * 4. Run verify-helpers.js on a fresh full fetch.
 *
 * data.input = {
 *   actions: { [slug]: sourceString, ... },
 *   canonicalSlug?: "get_runtime_state",
 *   adminSlugs?: ["admin_describe_schema", "admin_query_records"]
 * }
 */

const HELPER_START = 'const KnowledgeRetentionUtils = {';
const HELPER_END = '\n};\n';
const SLUG_RE = /ACTION_SLUG: '([a-z_]+)',/;

/** Must match the live Knowledge Retention Backend. Update when you add/remove an action. */
const REQUIRED_ACTION_SLUGS = [
  'get_runtime_state',
  'create_interview',
  'save_discovery',
  'save_topics_and_questions',
  'setup_interview_folder',
  'save_consent',
  'save_answer',
  'revise_answer',
  'save_topic_summary',
  'get_answers',
  'get_discovery',
  'finalize_interview',
  'upload_document',
  'save_feedback',
  'abandon_interview',
  'admin_describe_schema',
  'admin_query_records',
];

function extractHelper(source) {
  const start = source.indexOf(HELPER_START);
  if (start < 0) return null;
  const end = source.indexOf(HELPER_END, start);
  if (end < 0) return null;
  return {
    text: source.slice(start, end + HELPER_END.length),
    start,
    end: end + HELPER_END.length,
  };
}

function syncHelpers(input) {
  const actions = (input && input.actions) || {};
  const canonicalSlug = (input && input.canonicalSlug) || 'get_runtime_state';
  const adminSlugs = new Set(
    (input && input.adminSlugs) || ['admin_describe_schema', 'admin_query_records'],
  );

  const blockers = [];
  const report = [];
  const updates = {};

  for (const slug of REQUIRED_ACTION_SLUGS) {
    if (typeof actions[slug] !== 'string' || !actions[slug]) {
      blockers.push(`Missing required action source: ${slug} (fetch the full live Knowledge Retention Backend)`);
    }
  }
  for (const slug of Object.keys(actions)) {
    if (REQUIRED_ACTION_SLUGS.indexOf(slug) < 0) {
      blockers.push(`Unexpected action slug "${slug}" — not in the known KR Backend set; update REQUIRED_ACTION_SLUGS if you added it on purpose`);
    }
  }
  if (blockers.length) {
    return { ok: false, canonicalSlug, canonicalBytes: 0, updates: {}, report, blockers };
  }

  const canonicalSource = actions[canonicalSlug];
  const canonBlock = extractHelper(canonicalSource);
  if (!canonBlock) {
    return {
      ok: false,
      canonicalSlug,
      canonicalBytes: 0,
      updates: {},
      report: [],
      blockers: [`${canonicalSlug} has no KnowledgeRetentionUtils block`],
    };
  }

  const canonSlugMatch = canonBlock.text.match(SLUG_RE);
  if (!canonSlugMatch) {
    blockers.push(`${canonicalSlug}: helper has no ACTION_SLUG line`);
  } else if (canonSlugMatch[1] !== canonicalSlug) {
    blockers.push(
      `${canonicalSlug}: ACTION_SLUG is "${canonSlugMatch[1]}" but expected "${canonicalSlug}"`,
    );
  }

  const slugs = Object.keys(actions).sort();
  for (const slug of slugs) {
    if (slug === canonicalSlug) {
      report.push({ slug, status: 'canonical' });
      continue;
    }
    if (adminSlugs.has(slug) || slug.indexOf('admin_') === 0) {
      report.push({ slug, status: 'skipped', detail: 'admin action — do not sync employee helper' });
      continue;
    }

    const source = actions[slug];
    const block = extractHelper(source);
    if (!block) {
      blockers.push(`${slug}: no KnowledgeRetentionUtils block`);
      report.push({ slug, status: 'error', detail: 'no helper block' });
      continue;
    }

    const mine = block.text.match(SLUG_RE);
    if (!mine) {
      blockers.push(`${slug}: helper has no ACTION_SLUG`);
      report.push({ slug, status: 'error', detail: 'no ACTION_SLUG' });
      continue;
    }
    if (mine[1] !== slug) {
      blockers.push(`${slug}: ACTION_SLUG is "${mine[1]}" (fix during sync)`);
    }

    const replacement = canonBlock.text.replace(SLUG_RE, `ACTION_SLUG: '${slug}',`);
    if (replacement === block.text) {
      report.push({ slug, status: 'identical' });
      continue;
    }

    updates[slug] = source.slice(0, block.start) + replacement + source.slice(block.end);
    report.push({ slug, status: 'synced', detail: `bytes ${block.text.length} → ${replacement.length}` });
  }

  return {
    ok: blockers.length === 0,
    canonicalSlug,
    canonicalBytes: canonBlock.text.length,
    updates,
    report,
    blockers,
  };
}

if (typeof data !== 'undefined' && data && data.input) {
  return syncHelpers(data.input);
}
