// SPDX-License-Identifier: MIT
// Ambient types of the Bun fork "bun:yolo" module (packages/bun-types/yolo.d.ts upstream), absent from the published @aphrody/bun-types 1.4.4.
declare module "bun:yolo" {
  export type JSONValue =
    | string
    | number
    | boolean
    | null
    | readonly JSONValue[]
    | { readonly [key: string]: JSONValue };
  export type Entry = string | null | readonly JSONValue[] | { readonly [key: string]: JSONValue };
  export interface NoulQuestion {
    readonly type: "noul";
    readonly instructions?: Entry;
    readonly criteria?: { readonly true?: Entry; readonly false?: Entry } | null;
  }
  export type ChoiceCriteria = Readonly<Record<string, Entry>>;
  export interface ChoiceQuestion<C extends ChoiceCriteria = ChoiceCriteria> {
    readonly type: "choice";
    readonly instructions?: Entry;
    readonly criteria: C;
  }
  export type ScoreCriteria = readonly [Entry, Entry, ...Entry[]];
  export interface ScoreQuestion<C extends ScoreCriteria = ScoreCriteria> {
    readonly type: "score";
    readonly instructions?: Entry;
    readonly criteria: C;
  }
  export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
  export type Questions = Readonly<Record<string, Question>>;
  export type ValueFor<Q extends Question> = Q extends NoulQuestion
    ? boolean
    : Q extends ChoiceQuestion<infer C>
      ? keyof C & string
      : number;
  export type AnswerFor<Q extends Question> = Q extends NoulQuestion
    ? { readonly type: "noul"; readonly noul: number }
    : Q extends ChoiceQuestion<infer C>
      ? {
          readonly type: "choice";
          readonly choice: keyof C & string;
          readonly confidence: number;
          readonly probabilities: { readonly [K in keyof C]: number };
        }
      : {
          readonly type: "score";
          readonly score: number;
          readonly confidence: number;
          readonly legend: Readonly<Record<string, Entry>>;
          readonly probabilities: Readonly<Record<string, number>>;
        };
  export interface Request<Q extends Questions = Questions> {
    readonly state: Entry;
    readonly questions: Q;
    readonly model?: string;
  }
  export interface Result<Q extends Questions = Questions> {
    readonly model: string;
    readonly answers: { readonly [K in keyof Q]: AnswerFor<Q[K]> };
    /** Null when the local backend does not expose token accounting. */
    readonly usage: { readonly input_tokens: number; readonly output_tokens: number } | null;
  }
  export interface ProviderOptions {
    readonly signal: AbortSignal;
    readonly timeout: number;
    readonly retry: { readonly maxRetries: number };
  }
  /** Application-owned structured decision transport. */
  export interface Provider {
    systemOne(request: Request, options?: ProviderOptions): PromiseLike<unknown>;
  }
  export interface Options {
    /** Default: native remote HTTP provider. No model or weights are downloaded. */
    provider?: Provider;
    signal?: AbortSignal;
    /** Total deadline, including serialization and retries. Sync work rejects after returning past the deadline. Integer 1..120000; default 10000 ms. */
    timeout?: number;
    /** Additional attempts, integer 0..3; default 0. Forwarded to SDK clients. */
    maxRetries?: number;
    /** A Noul becomes true only when its probability is greater than this value. Default 0.5. */
    threshold?: number;
  }
  export function noul(instructions?: Entry, criteria?: NoulQuestion["criteria"]): NoulQuestion;
  export function choice<const C extends ChoiceCriteria>(
    instructions: Entry,
    criteria: C,
  ): ChoiceQuestion<C>;
  export function score<const C extends ScoreCriteria>(
    instructions: Entry,
    criteria: C,
  ): ScoreQuestion<C>;
  /** One provider request for the whole named batch; validates every answer in Rust. */
  export function inspect<const Q extends Questions>(
    request: Request<Q>,
    options?: Options,
  ): Promise<Result<Q>>;
  export const systemOne: typeof inspect;
  /** Validate a confidence threshold natively before starting a provider request. */
  export function confidenceThreshold(value: number): number;
  export type Selections<Q extends Questions> = {
    readonly [K in keyof Q as Q[K] extends ChoiceQuestion ? K : never]: ValueFor<Q[K]> | null;
  };
  /** Choice winners at or above the threshold; null means abstention. Raw answers stay unchanged. */
  export function selections<const Q extends Questions>(
    request: Request<Q>,
    result: Result<Q>,
    minimumConfidence: number,
  ): Selections<Q>;
  export function decide<const Q extends Questions>(
    request: Request<Q>,
    options?: Options,
  ): Promise<{ readonly [K in keyof Q]: ValueFor<Q[K]> }>;
  export function ask<const Q extends Question>(
    state: Entry,
    question: Q,
    options?: Options,
  ): Promise<ValueFor<Q>>;
  export function value<const Q extends Question>(
    answer: AnswerFor<Q>,
    question: Q,
    threshold?: number,
  ): ValueFor<Q>;
  export interface RemoteOptions {
    /** Native HTTP when omitted. The SDK owns transport/retries when supplied. */
    client?: Provider;
    /** HTTPS endpoint root; HTTP is accepted only for loopback tests or local servers. */
    baseURL?: string;
    model?: string;
  }
  export function remote(options?: RemoteOptions): Provider;
  /** Deterministic code uses the same native answer validation as model providers. */
  export function code(
    evaluate: (request: Request, options: ProviderOptions) => unknown | PromiseLike<unknown>,
  ): Provider;
  export interface LocalContext {
    complete(
      prompt: string,
      options?: { maxTokens?: number; temperature?: number; signal?: AbortSignal },
    ): Promise<string>;
  }
  export interface LocalOptions {
    /** Existing bun-llama context; caller owns its lifetime. Adapters share one active call per context until complete() settles, including after cancellation. */
    context: LocalContext;
    model: string;
    /** Generated token bound, integer 1..4096; default 1024. */
    maxTokens?: number;
  }
  /** Strict JSON output, validated by Rust. Local probabilities are model outputs, not calibrated remote scores. */
  export function local(options: LocalOptions): Provider;
  export const Yolo: typeof ask & {
    readonly ask: typeof ask;
    readonly decide: typeof decide;
    readonly inspect: typeof inspect;
    readonly systemOne: typeof inspect;
    readonly noul: typeof noul;
    readonly choice: typeof choice;
    readonly score: typeof score;
    readonly value: typeof value;
    readonly remote: typeof remote;
    readonly code: typeof code;
    readonly local: typeof local;
    readonly confidenceThreshold: typeof confidenceThreshold;
    readonly selections: typeof selections;
  };
  export default Yolo;
}

declare module "bun:Yolo" {
  export * from "bun:yolo";
  export { default } from "bun:yolo";
}
