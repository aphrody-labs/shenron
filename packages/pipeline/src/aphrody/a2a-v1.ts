// SPDX-License-Identifier: Apache-2.0
/**
 * A2A 1.0 face of the Shenron hub (`a2a.ts`, legacy dialect inside): the JSON-RPC methods
 * `SendMessage`, `GetTask` and `ListTasks` with the 1.0 payloads (ProtoJSON `Task`, `Message`,
 * `Part`, `TASK_STATE_*`), and the 1.0 fields of the Agent Card (`supportedInterfaces`). A 1.0
 * client such as `@aphrody/a2a` discovers `/.well-known/agent-card.json` and talks to `/api/a2a`;
 * older peers keep `message/send`, `tasks/get`, `tasks/update`.
 *
 * Routing of `SendMessage`: `message.metadata.target` (or `targetAgent`, `aphrody_peer`), then
 * `params.metadata.target`, then an `@target:` prefix in the text (`@rag: who trained Goku?`),
 * else `broadcast`. A message carrying `taskId` is a peer's reply to that task.
 */

import type {
  A2AArtifact,
  A2AMessage,
  A2APart,
  A2ATarget,
  A2ATask,
  A2ATaskStatus,
  JSONRPCResponse,
} from "./a2a";

export const A2A_V1_PROTOCOL_VERSION = "1.0";
export const A2A_V1_METHODS: ReadonlySet<string> = new Set(["SendMessage", "GetTask", "ListTasks"]);

/** A2A 1.0 error codes used here (specification §5.4). */
export const A2A_V1_ERRORS = {
  taskNotFound: -32001,
  invalidParams: -32602,
} as const;

type Json = Record<string, unknown>;

const STATE: Readonly<Record<A2ATaskStatus, string>> = {
  submitted: "TASK_STATE_SUBMITTED",
  working: "TASK_STATE_WORKING",
  input_required: "TASK_STATE_INPUT_REQUIRED",
  completed: "TASK_STATE_COMPLETED",
  failed: "TASK_STATE_FAILED",
  canceled: "TASK_STATE_CANCELED",
};

const LEGACY_STATE: Readonly<Record<string, A2ATaskStatus>> = Object.fromEntries(
  Object.entries(STATE).map(([legacy, v1]) => [v1, legacy as A2ATaskStatus]),
);

export function toV1State(status: A2ATaskStatus): string {
  return STATE[status] ?? "TASK_STATE_UNSPECIFIED";
}

export function toV1Part(part: A2APart): Json {
  if (part.type === "text") return { text: part.text };
  if (part.type === "data") return { data: part.data };
  const file: Json = {};
  if (part.file.uri) file.url = part.file.uri;
  else if (part.file.bytesBase64) file.raw = part.file.bytesBase64;
  else file.text = "";
  if (part.file.name) file.filename = part.file.name;
  if (part.file.mimeType) file.mediaType = part.file.mimeType;
  return file;
}

/** A 1.0 part (`{text}`, `{data}`, `{url}`, `{raw}`) in the hub's legacy shape. */
export function fromV1Part(raw: unknown): A2APart | null {
  if (!raw || typeof raw !== "object") return null;
  const part = raw as Json;
  if (typeof part.text === "string") return { type: "text", text: part.text };
  if ("data" in part) {
    const data = part.data;
    return {
      type: "data",
      data:
        data && typeof data === "object" && !Array.isArray(data) ? (data as Json) : { value: data },
    };
  }
  if (typeof part.url === "string" || typeof part.raw === "string") {
    return {
      type: "file",
      file: {
        name: typeof part.filename === "string" ? part.filename : "file",
        mimeType: typeof part.mediaType === "string" ? part.mediaType : undefined,
        uri: typeof part.url === "string" ? part.url : undefined,
        bytesBase64: typeof part.raw === "string" ? part.raw : undefined,
      },
    };
  }
  // Legacy parts sent to a 1.0 method are accepted as they are.
  const kind = part.type ?? part.kind;
  if (kind === "text" || kind === "data" || kind === "file") return part as unknown as A2APart;
  return null;
}

function toV1Message(message: A2AMessage, task: A2ATask, index: number): Json {
  return {
    messageId: `${task.id}-m${index}`,
    contextId: contextIdOf(task),
    taskId: task.id,
    role: message.role === "user" ? "ROLE_USER" : "ROLE_AGENT",
    parts: message.parts.map(toV1Part),
    ...(message.metadata ? { metadata: message.metadata } : {}),
  };
}

function toV1Artifact(artifact: A2AArtifact, index: number): Json {
  const parts: Json[] = [];
  if (typeof artifact.content === "string") parts.push({ text: artifact.content });
  if (artifact.data !== undefined) parts.push({ data: artifact.data as Json });
  if (artifact.uri) parts.push({ url: artifact.uri });
  if (parts.length === 0) parts.push({ text: "" });
  return {
    artifactId: `${artifact.name || "artifact"}-${index}`,
    name: artifact.name,
    parts,
    metadata: { type: artifact.type },
  };
}

function contextIdOf(task: A2ATask): string {
  const context = task.metadata?.contextId;
  return typeof context === "string" && context ? context : task.id;
}

/** The hub task as an A2A 1.0 `Task`; `historyLength` keeps the last messages only. */
export function toV1Task(task: A2ATask, historyLength?: number): Json {
  const artifacts = task.artifacts.map(toV1Artifact);
  if (artifacts.length === 0 && task.resultMarkdown) {
    artifacts.push({
      artifactId: "result-0",
      name: "result",
      parts: [{ text: task.resultMarkdown }],
    });
  }
  const history = task.history.map((message, index) => toV1Message(message, task, index));
  const kept =
    historyLength === undefined ? history : historyLength <= 0 ? [] : history.slice(-historyLength);
  const last = history.at(-1);
  return {
    id: task.id,
    contextId: contextIdOf(task),
    status: {
      state: toV1State(task.status),
      timestamp: task.updatedAt,
      ...(last && last.role === "ROLE_AGENT" ? { message: last } : {}),
    },
    artifacts,
    history: kept,
    metadata: {
      target: task.target,
      ...(task.verdict ? { verdict: task.verdict } : {}),
      createdAt: task.createdAt,
    },
  };
}

const TARGET_PREFIX = /^\s*@([a-z_]+)\s*:\s*/i;

/**
 * A 1.0 `SendMessageRequest` as the hub's legacy `message/send` params, or an error message.
 * `targets` lists the routable targets.
 */
export function v1SendToLegacy(
  params: unknown,
  targets: readonly A2ATarget[],
): { params: Json } | { error: string } {
  if (!params || typeof params !== "object") return { error: "params.message is required" };
  const p = params as Json;
  const message = p.message as Json | undefined;
  if (!message || typeof message !== "object" || !Array.isArray(message.parts)) {
    return { error: "params.message.parts is required" };
  }
  const parts = (message.parts as unknown[]).map(fromV1Part);
  if (parts.length === 0 || parts.some((part) => part === null)) {
    return { error: "every part must carry text, data, url or raw" };
  }
  const legacyParts = parts as A2APart[];
  const meta = (
    message.metadata && typeof message.metadata === "object" ? message.metadata : {}
  ) as Json;
  const requestMeta = (p.metadata && typeof p.metadata === "object" ? p.metadata : {}) as Json;
  let target = [meta.target, meta.targetAgent, meta.aphrody_peer, requestMeta.target].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const first = legacyParts.find((part) => part.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!target && first) {
    const match = TARGET_PREFIX.exec(first.text);
    if (match && (targets as readonly string[]).includes(match[1]!.toLowerCase())) {
      target = match[1]!.toLowerCase();
      first.text = first.text.slice(match[0].length);
    }
  }
  const state =
    typeof meta.status === "string" ? (LEGACY_STATE[meta.status] ?? meta.status) : undefined;
  return {
    params: {
      target: target ?? "broadcast",
      ...(typeof message.taskId === "string" ? { taskId: message.taskId } : {}),
      message: {
        role: "user",
        parts: legacyParts,
        contextId: typeof message.contextId === "string" ? message.contextId : undefined,
        metadata: {
          ...meta,
          sourceAgent: typeof meta.sourceAgent === "string" ? meta.sourceAgent : "a2a-v1-client",
          ...(state ? { status: state } : {}),
        },
      },
    },
  };
}

export function v1Error(
  id: string | number | null,
  code: number,
  message: string,
): JSONRPCResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
