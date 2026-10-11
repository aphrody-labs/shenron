import { splitTriples, parseJsonl, soulTone, teacherMessages, antigravityChat, rejectReason } from './packages/pipeline/scripts/build-chat-rollouts.ts';
import { readFileSync } from 'fs';

const triples = parseJsonl(readFileSync('/root/.aphrody/workspaces/dbfr/training/triples.jsonl', 'utf8'));
const split = splitTriples(triples);
const c = split.candidates[0];
console.log('Query:', c.query);
console.log('Positive length:', c.positive.length);
const msgs = teacherMessages(soulTone(''), c.query, c.positive);
const res = await antigravityChat(msgs);
console.log('Teacher res:', JSON.stringify(res));
const reject = rejectReason(res.answer, c.positive);
console.log('Reject reason:', reject);
