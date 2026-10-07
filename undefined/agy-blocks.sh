nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader

export ROOT="${ROOT:-$HOME/shenron-train}"
mkdir -p "$ROOT"/{models,runs,tools}

for repo in shenron aphrody; do
  if [ -d "$ROOT/$repo/.git" ]; then git -C "$ROOT/$repo" pull --ff-only
  else gh repo clone "aphrody-labs/$repo" "$ROOT/$repo" -- --depth 1; fi
done

command -v uv || curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.12
cd "$ROOT/aphrody/py"
uv sync --package aphrody-train --extra full --locked
uv run --package aphrody-train --extra full python -c \
  "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"

L="$ROOT/tools/llama.cpp"
[ -d "$L/.git" ] || git clone https://github.com/ggml-org/llama.cpp "$L"
git -C "$L" fetch --depth 1 origin 0c1e57098bba43ac29e6e3b677cdceebdd22334f
git -C "$L" checkout -q 0c1e57098bba43ac29e6e3b677cdceebdd22334f
export APHRODY_LLAMA_CPP_CONVERTER="$L/convert_lora_to_gguf.py"

CUDA=OFF; command -v nvcc >/dev/null && CUDA=ON
[ -x "$L/build/bin/llama-server" ] || {
  cmake -S "$L" -B "$L/build" -DGGML_CUDA=$CUDA -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release &&
  cmake --build "$L/build" --target llama-server -j"$(nproc)"; }

DL=https://dragonballfr.com/api/private-downloads
curl -fsS "$DL" | jq -r '.files[] | "\(.name)  \(.size)  \(.sha256)"'
A="$ROOT/shenron-train-chat-v2.tar.gz"
curl -fL -C - -o "$A" "$DL/shenron-train-chat-v2.tar.gz"
echo "d7b8beeb44216054e9d8c58e18e8ba040771421ce83ed8b6e43e9993fda0d1cb  $A" | sha256sum -c -
[ -d "$ROOT/shenron-train-chat-v2" ] || tar -xzf "$A" -C "$ROOT"
D="$ROOT/shenron-train-chat-v2"
(cd "$D" && sha256sum -c --quiet SHA256SUMS) && echo "archive intacte"
wc -l "$D/data/chat-v2/rollouts.jsonl" "$D/data/chat-v2/gold.jsonl"   # 1495 et 1091

uvx --from huggingface_hub hf download Qwen/Qwen3-4B-Instruct-2507 \
  --local-dir "$ROOT/models/Qwen3-4B-Instruct-2507"
uvx --from huggingface_hub hf download unsloth/Qwen3-4B-Instruct-2507-GGUF \
  Qwen3-4B-Instruct-2507-Q4_K_M.gguf --revision a06e946bb6b655725eafa393f4a9745d460374c9 \
  --local-dir "$ROOT/models/gguf"

cd "$ROOT/aphrody/py"
RANK="${RANK:-16}"
TARGETS=q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj
run() { # $1 = job id, $2 = steps
  APHRODY_LORA_RANK="$RANK" APHRODY_LORA_TARGETS="$TARGETS" \
  uv run --package aphrody-train --extra full python -m aphrody_train.lora \
    --job-id "$1" \
    --rollout-dir "$D/data/chat-v2" \
    --gold-file   "$D/data/chat-v2/gold.jsonl" \
    --base-model  "$ROOT/models/Qwen3-4B-Instruct-2507" \
    --output-dir  "$ROOT/runs/$1" \
    --steps "$2" | tee "$ROOT/runs/$1.events.jsonl"
}
[ -f "$ROOT/runs/shenron-chat-smoke/adapter.gguf" ] || run shenron-chat-smoke 20
tail -1 "$ROOT/runs/shenron-chat-smoke.events.jsonl"

STEPS="${STEPS:-4485}"
[ -f "$ROOT/runs/shenron-chat-v3/adapter.gguf" ] || run shenron-chat-v3 "$STEPS"
tail -2 "$ROOT/runs/shenron-chat-v3.events.jsonl"
sha256sum "$ROOT/runs/shenron-chat-v3/adapter.gguf"

B="$ROOT/models/gguf/Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
evaluate() { # $1 = label, $2 = adapter.gguf
  "$L/build/bin/llama-server" -m "$B" --lora "$2" -ngl 99 -c 4096 \
    --host 127.0.0.1 --port 8090 > "$ROOT/runs/llama-$1.log" 2>&1 &
  pid=$!
  for _ in $(seq 120); do curl -sf http://127.0.0.1:8090/health >/dev/null && break; sleep 1; done
  bun "$D/tools/eval-openai.ts" --shenron "$ROOT/shenron" \
    --gold "$D/data/chat-v2/gold.jsonl" --soul "$D/data/SOUL.md" \
    --base-url http://127.0.0.1:8090/v1 --limit 30 --label "$1" \
    --out "$ROOT/runs/eval-$1.json"
  kill "$pid"; wait "$pid" 2>/dev/null
}
[ -f "$ROOT/runs/eval-lora-v2.json" ] || evaluate lora-v2 "$D/runs/shenron-chat-v2/adapter.gguf"
[ -f "$ROOT/runs/eval-lora-v3.json" ] || evaluate lora-v3 "$ROOT/runs/shenron-chat-v3/adapter.gguf"
jq -c '{label,asked,grounded,refusal,aiMention,errors,meanLatencyMs}' "$ROOT"/runs/eval-lora-v*.json

WIN_DIR="/mnt/c/Users/$(cmd.exe /c 'echo %USERNAME%' 2>/dev/null | tr -d '\r')/ShenronTrain"
mkdir -p "$WIN_DIR"
cp "$D/runs/shenron-chat-v2/adapter.gguf" "$WIN_DIR/shenron-chat-v2.gguf"
[ -f "$ROOT/runs/shenron-chat-v3/adapter.gguf" ] &&
  cp "$ROOT/runs/shenron-chat-v3/adapter.gguf" "$WIN_DIR/shenron-chat-v3.gguf"
