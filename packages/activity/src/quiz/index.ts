// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-activity/quiz` — rules of the Quiz Budokai: question banks, selection, scoring,
 * round state machine, bounded rewards and signed settlement receipts. Runtime class `pure`.
 *
 * The embedded lexicon bank lives in `@aphrody/shenron-activity/quiz/lexicon` so that importing the
 * rules does not pull the lexicon data.
 */
export type { PresentedQuestion, QuizBank, QuizChoice, QuizQuestion } from "./types";
export { createBank, foldText, mergeBanks, QuizBankError, validateQuestion } from "./bank";
export {
  buildLexiconBank,
  DEFAULT_EXCLUDED_TERM_IDS,
  type LexiconBankOptions,
  type LexiconTermInput,
} from "./lexicon-bank";
export {
  buildRelationBank,
  RELATION_CATEGORY,
  RelationEntitySchema,
  RelationFactSchema,
  RELATIONS,
  type Relation,
  type RelationBankOptions,
  type RelationEntity,
  type RelationFact,
} from "./relations";
export { presentQuestion, selectQuestions, type SelectionOptions } from "./selection";
export {
  rankTallies,
  SCORING,
  scoreAnswer,
  type PlayerTally,
  type RankedTally,
  type ScoreInput,
} from "./scoring";
export {
  DEFAULT_SESSION_LIMITS,
  QuizSession,
  type QuizSessionInit,
  type QuizSessionLimits,
  type SessionEvent,
  type SessionParticipant,
  type SubmitError,
  type SubmitResult,
} from "./session";
export {
  applyDailyBudget,
  computeDailyQuizReward,
  computeRoundRewards,
  DEFAULT_REWARD_POLICY,
  HARD_LIMITS,
  RULE_REWARD_REASONS,
  validateRewardPolicy,
  type BudgetedLine,
  type RewardCandidate,
  type RewardLine,
  type RewardPolicy,
  type RuleRewardReason,
} from "./rewards";
export {
  buildReceipt,
  canonicalJson,
  idempotencyKey,
  MIN_SECRET_BYTES,
  RECEIPT_SKEW_MS,
  RECEIPT_TTL_MS,
  RECEIPT_VERSION,
  ReceiptEntrySchema,
  receiptBoundsIssues,
  SettlementReceiptSchema,
  signReceipt,
  SignedReceiptSchema,
  verifyReceipt,
  type BuildReceiptInput,
  type ReceiptEntry,
  type ReceiptFailure,
  type SettlementReceipt,
  type SignedReceipt,
  type VerifyOptions,
  type VerifyResult,
} from "./receipt";
