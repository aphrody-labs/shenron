// Files imported with `with { type: "text" }` (Bun embeds them in the compiled binary).
declare module "*.jsonl" {
  const text: string;
  export default text;
}
