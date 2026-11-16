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
export type Selections<Q extends Questions> = {
  readonly [K in keyof Q as Q[K] extends ChoiceQuestion ? K : never]: ValueFor<Q[K]> | null;
};
export interface Options {
  /** Default: the remote TypeSafe provider. */
  provider?: Provider;
  signal?: AbortSignal;
  /** Total deadline in ms, integer 1..120000; default 10000. */
  timeout?: number;
  /** Additional attempts, integer 0..3; default 0. */
  maxRetries?: number;
  /** A noul becomes true only when its probability is greater than this value. Default 0.5. */
  threshold?: number;
}
export interface RemoteOptions {
  /** Supplied client owns transport and retries; otherwise a TypeSafeClient is built from the environment. */
  client?: Provider;
  baseURL?: string;
  model?: string;
}
export interface LocalContext {
  complete(
    prompt: string,
    options?: { maxTokens?: number; temperature?: number; signal?: AbortSignal },
  ): Promise<string>;
}
export interface LocalOptions {
  context: LocalContext;
  model: string;
  /** Generated token bound, integer 1..4096; default 1024. */
  maxTokens?: number;
}
