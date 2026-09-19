import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const checkpoints = [
  ['A', 'Shared contracts'],
  ['B', 'Real provider options'],
  ['C', 'Real Databricks choice'],
  ['D', 'Verified provider handoff'],
  ['E', 'Trip monitoring'],
  ['F', 'Cancellation recovery'],
  ['G', 'Full demo'],
];
const people = [
  ['akshar', 'Akshar', 'aksharkakkad-web'],
  ['mahin', 'Mahin', 'Mahin-W'],
  ['rishit', 'Rishit', 'rishit020'],
];
const marker = /<!-- checkpoint-state: ([A-Za-z0-9+/=]+) -->/;

export function readState(input) {
  const result = {};
  for (const [key] of people) {
    const value = input[key];
    if (!Array.isArray(value) || value.some((item) => !checkpoints.some(([letter]) => letter === item)) || new Set(value).size !== value.length) {
      throw new Error(`Invalid checkpoint list for ${key}`);
    }
    result[key] = [...value].sort();
  }
  return result;
}

function names(keys) {
  const labels = keys.map((key) => people.find(([person]) => person === key)[1]);
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  if (labels.length === 3) return `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
  return labels[0] ?? 'nobody';
}

export function buildBoard(input) {
  const state = readState(input);
  const rows = checkpoints.map(([letter, title]) => {
    const ready = people.filter(([key]) => state[key].includes(letter)).map(([key]) => key);
    const waiting = people.filter(([key]) => !state[key].includes(letter)).map(([key]) => key);
    const progress = people.map(([key, name]) => `${name} ${ready.includes(key) ? '✅' : '⬜'}`).join(' · ');
    const next = waiting.length ? `Waiting on ${names(waiting)}` : 'Team sync now (10 minutes)';
    return `| ${letter} — ${title} | ${progress} | ${next} |`;
  });
  const encoded = Buffer.from(JSON.stringify(state)).toString('base64');
  return [
    '# Beacon checkpoint board',
    '',
    'An agent marks its own track ready in `checkpoints/<person>.json`. After that change lands on `main` and CI passes, this board updates and mentions the team. ✅ means that person marked their work ready; it does not prove a live sponsor integration by itself.',
    '',
    '| Checkpoint | Each track | What happens next |',
    '| --- | --- | --- |',
    ...rows,
    '',
    'When all three are ready for the same checkpoint, do a 10-minute integration sync. See [checkpoint instructions](https://github.com/aksharkakkad-web/VTHacks/blob/main/docs/CHECKPOINTS.md).',
    '',
    `<!-- checkpoint-state: ${encoded} -->`,
  ].join('\n');
}

export function previousState(body) {
  const encoded = body.match(marker)?.[1];
  if (!encoded) return null;
  try {
    return readState(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')));
  } catch {
    return null;
  }
}

export function buildChangeComment(beforeInput, afterInput) {
  const before = readState(beforeInput);
  const after = readState(afterInput);
  const changes = [];
  for (const [letter] of checkpoints) {
    const added = people.filter(([key]) => !before[key].includes(letter) && after[key].includes(letter));
    const removed = people.filter(([key]) => before[key].includes(letter) && !after[key].includes(letter));
    for (const [, , handle] of added) {
      const waiting = people.filter(([key]) => !after[key].includes(letter)).map(([key]) => key);
      changes.push(`@${handle} is ready for ${letter}; ${waiting.length ? `waiting on ${names(waiting)}` : 'everyone is ready'}.`);
    }
    for (const [, name, handle] of removed) changes.push(`@${handle} (${name}) reopened ${letter}.`);
    const wasReady = people.every(([key]) => before[key].includes(letter));
    const isReady = people.every(([key]) => after[key].includes(letter));
    if (!wasReady && isReady) changes.push(`**${letter} is ready — 10-minute team sync now.**`);
  }
  if (!changes.length) return null;
  return ['Checkpoint update:', '', ...changes.map((change) => `- ${change}`), '', 'Heads up @aksharkakkad-web @Mahin-W @rishit020 — see the board above.'].join('\n');
}

async function github(method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !process.env.GITHUB_TOKEN) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  const input = {};
  for (const [key] of people) input[key] = JSON.parse(await readFile(`checkpoints/${key}.json`, 'utf8'));
  const state = readState(input);
  const path = `/repos/${repository}/issues`;
  const issues = await github('GET', `${path}?state=open&per_page=100`);
  const issue = issues.find((item) => !item.pull_request && item.title === 'Beacon checkpoint board');
  const body = buildBoard(state);
  if (!issue) {
    const created = await github('POST', path, {
      title: 'Beacon checkpoint board',
      body,
      assignees: people.map(([, , handle]) => handle),
    });
    console.log(`Created checkpoint board #${created.number}`);
    return;
  }
  const prior = previousState(issue.body ?? '');
  const comment = prior ? buildChangeComment(prior, state) : null;
  if (comment) {
    await github('POST', `${path}/${issue.number}/comments`, { body: comment });
    console.log(`Updated checkpoint board #${issue.number}`);
  } else {
    console.log(`Checkpoint board #${issue.number}: no new milestone`);
  }
  if (issue.body !== body) await github('PATCH', `${path}/${issue.number}`, { body });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
