// SPDX-License-Identifier: Apache-2.0
/** Typed batched decisions: one provider request per named question batch, validated answers, confidence abstention. */
import { TypeSafeClient } from "@typesafe-ai/sdk";
import type {
  AnswerFor,
  ChoiceCriteria,
  ChoiceQuestion,
  Entry,
  LocalOptions,
  NoulQuestion,
  Options,
  Provider,
  ProviderOptions,
  Question,
  Questions,
  RemoteOptions,
  Request,
  Result,
  ScoreCriteria,
  ScoreQuestion,
  Selections,
  ValueFor,
} from "./types";

export type * from "./types";

const DEFAULT_TIMEOUT = 10_000;

export function noul(instructions?: Entry, criteria?: NoulQuestion["criteria"]): NoulQuestion {
  return { type: "noul", instructions, criteria: criteria ?? null };
}
export function choice<const C extends ChoiceCriteria>(
  instructions: Entry,
  criteria: C,
): ChoiceQuestion<C> {
  if (Object.keys(criteria).length < 2) throw new RangeError("choice needs at least two outcomes");
  return { type: "choice", instructions, criteria };
}
export function score<const C extends ScoreCriteria>(
  instructions: Entry,
  criteria: C,
): ScoreQuestion<C> {
  return { type: "score", instructions, criteria };
}

export function confidenceThreshold(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new RangeError("confidence threshold must be within [0, 1]");
  return value;
}

function integer(name: string, value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new RangeError(`${name} must be an integer in [${min}, ${max}]`);
  return value;
}

function validate(request: Request, result: unknown): Result {
  const r = result as Result | null;
  if (!r || typeof r !== "object" || typeof r.model !== "string" || !r.answers)
    throw new TypeError("Provider returned a malformed decision result");
  for (const [name, question] of Object.entries(request.questions)) {
    const answer = (r.answers as Record<string, Record<string, unknown> | undefined>)[name];
    if (!answer || answer.type !== question.type)
      throw new TypeError(`Provider answer "${name}" is missing or has the wrong type`);
    if (question.type === "choice") {
      const labels = Object.keys(question.criteria);
      if (typeof answer.choice !== "string" || !labels.includes(answer.choice))
        throw new TypeError(`Provider answer "${name}" selects an unknown outcome`);
      if (typeof answer.confidence !== "number" || !(answer.confidence >= 0 && answer.confidence <= 1))
        throw new TypeError(`Provider answer "${name}" has an invalid confidence`);
    } else if (question.type === "noul") {
      if (typeof answer.noul !== "number" || !(answer.noul >= 0 && answer.noul <= 1))
        throw new TypeError(`Provider answer "${name}" has an invalid probability`);
    } else if (typeof answer.score !== "number" || !Number.isFinite(answer.score)) {
      throw new TypeError(`Provider answer "${name}" has an invalid score`);
    }
  }
  return { ...r, usage: r.usage ?? null };
}

export async function inspect<const Q extends Questions>(
  request: Request<Q>,
  options: Options = {},
): Promise<Result<Q>> {
  if (Object.keys(request.questions).length === 0) throw new RangeError("questions are empty");
  const timeout = integer("timeout", options.timeout ?? DEFAULT_TIMEOUT, 1, 120_000);
  const maxRetries = integer("maxRetries", options.maxRetries ?? 0, 0, 3);
  const provider = options.provider ?? remote({ model: request.model });
  const deadline = AbortSignal.timeout(timeout);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  let failure: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    signal.throwIfAborted();
    try {
      const raw = await provider.systemOne(request, { signal, timeout, retry: { maxRetries } });
      signal.throwIfAborted();
      return validate(request, raw) as Result<Q>;
    } catch (error) {
      failure = error;
      if (signal.aborted) break;
    }
  }
  throw failure;
}
export const systemOne = inspect;

export function selections<const Q extends Questions>(
  request: Request<Q>,
  result: Result<Q>,
  minimumConfidence: number,
): Selections<Q> {
  confidenceThreshold(minimumConfidence);
  const out: Record<string, string | null> = {};
  for (const [name, question] of Object.entries(request.questions)) {
    if (question.type !== "choice") continue;
    const answer = (result.answers as Record<string, AnswerFor<ChoiceQuestion>>)[name];
    out[name] = answer && answer.confidence >= minimumConfidence ? answer.choice : null;
  }
  return out as Selections<Q>;
}

export function value<const Q extends Question>(
  answer: AnswerFor<Q>,
  question: Q,
  threshold = 0.5,
): ValueFor<Q> {
  const a = answer as Record<string, unknown>;
  if (question.type === "noul") return ((a.noul as number) > threshold) as ValueFor<Q>;
  if (question.type === "choice") return a.choice as ValueFor<Q>;
  return a.score as ValueFor<Q>;
}

export async function decide<const Q extends Questions>(
  request: Request<Q>,
  options: Options = {},
): Promise<{ readonly [K in keyof Q]: ValueFor<Q[K]> }> {
  const result = await inspect(request, options);
  return Object.fromEntries(
    Object.entries(request.questions).map(([name, question]) => [
      name,
      value((result.answers as Record<string, never>)[name], question, options.threshold),
    ]),
  ) as { readonly [K in keyof Q]: ValueFor<Q[K]> };
}

export async function ask<const Q extends Question>(
  state: Entry,
  question: Q,
  options: Options = {},
): Promise<ValueFor<Q>> {
  const out = await decide({ state, questions: { answer: question } }, options);
  return out.answer as ValueFor<Q>;
}

/** TypeSafe AI transport; the key comes from TYPESAFE_API_KEY, never from a request. */
export function remote(options: RemoteOptions = {}): Provider {
  if (options.client) return options.client;
  let client: TypeSafeClient | undefined;
  return {
    systemOne(request, provider) {
      client ??= new TypeSafeClient({
        ...(options.baseURL ? { baseURL: options.baseURL } : {}),
        ...(provider ? { timeout: provider.timeout, retry: provider.retry } : {}),
        logLevel: "off",
      });
      const model = request.model ?? options.model;
      return client.systemOne(
        {
          state: request.state as never,
          questions: request.questions as never,
          ...(model ? { model } : {}),
        },
        { signal: provider?.signal },
      );
    },
  };
}

/** Deterministic code behind the provider contract; answers pass the same validation. */
export function code(
  evaluate: (request: Request, options: ProviderOptions) => unknown | PromiseLike<unknown>,
): Provider {
  return {
    systemOne: (request, options) =>
      evaluate(
        request,
        options ?? { signal: new AbortController().signal, timeout: DEFAULT_TIMEOUT, retry: { maxRetries: 0 } },
      ),
  };
}

function localAnswer(question: Question, raw: unknown) {
  if (question.type === "noul") {
    const p = Math.min(1, Math.max(0, Number(raw)));
    return { type: "noul" as const, noul: p };
  }
  if (question.type === "choice") {
    const labels = Object.keys(question.criteria);
    const label = String(raw);
    if (!labels.includes(label)) throw new TypeError("Local model selected an unknown outcome");
    return {
      type: "choice" as const,
      choice: label,
      confidence: 1,
      probabilities: Object.fromEntries(labels.map((l) => [l, Number(l === label)])),
    };
  }
  const s = Number(raw);
  return {
    type: "score" as const,
    score: s,
    confidence: 1,
    legend: Object.fromEntries(question.criteria.map((c, i) => [String(i), c])),
    probabilities: Object.fromEntries(question.criteria.map((_, i) => [String(i), Number(i === Math.round(s))])),
  };
}

/** Strict JSON output from an existing completion context. Probabilities are model outputs, not calibrated scores. */
export function local(options: LocalOptions): Provider {
  const maxTokens = integer("maxTokens", options.maxTokens ?? 1024, 1, 4096);
  let tail: Promise<unknown> = Promise.resolve();
  return {
    systemOne(request, provider) {
      const run = async () => {
        const prompt = `Answer as strict JSON mapping each question name to its answer (noul: a probability, choice: an outcome name, score: an integer index).\nState: ${JSON.stringify(request.state)}\nQuestions: ${JSON.stringify(request.questions)}\nJSON:`;
        const text = await options.context.complete(prompt, { maxTokens, temperature: 0, signal: provider?.signal });
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
        return {
          model: options.model,
          usage: null,
          answers: Object.fromEntries(
            Object.entries(request.questions).map(([name, q]) => [name, localAnswer(q, parsed[name])]),
          ),
        };
      };
      const next = tail.then(run, run);
      tail = next.catch(() => undefined);
      return next;
    },
  };
}

export const Yolo = Object.assign(ask, {
  ask, decide, inspect, systemOne, noul, choice, score, value, remote, code, local, confidenceThreshold, selections,
});
export default Yolo;
