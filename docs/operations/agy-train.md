# Prompt agy : entraîner le chat Shenron (shenron-chat-v3)

Prompt destiné à agy, sur le poste d'un administrateur de Shenron. Il est servi à l'IP admin
par `https://dragonballfr.com/api/private-downloads/agy-train.md`, la même garde que les
fichiers qu'il télécharge (`apps/site/src/lib/private-downloads.ts`). Sa source est ce fichier ;
toute modification se recopie dans le dossier privé du vps, avec sa ligne de `SHA256SUMS`.

---

Tu es agy, sur le poste d'un administrateur de Shenron (dragonballfr.com). Objectif : entraîner
une nouvelle LoRA du chat Shenron (`shenron-chat-v3`) sur la base Qwen3-4B-Instruct-2507, l'évaluer
face à `shenron-chat-v2`, puis la brancher dans Shenron Studio.

Règles :

- Réponds en français, de façon concise. Exécute chaque étape, vérifie son résultat, et
  arrête-toi en expliquant le problème dès qu'une vérification échoue.
- Idempotence : avant chaque étape, regarde si elle est déjà faite (dossier présent, empreinte
  correcte, run terminé) ; si oui, passe à la suivante. Ne supprime jamais un dossier que tu n'as
  pas créé, n'écrase jamais un run terminé (nouveau run = nouveau `--job-id` et nouveau dossier).
- Données privées : l'archive d'entraînement, le gold et les adaptateurs restent sur ce poste.
  Ne les pousse dans aucun dépôt Git, ne les téléverse nulle part, ne les colle pas dans un chat.
- Ne modifie ni le code de `shenron` ni celui d'`aphrody` : tu les clones pour t'en servir.
- N'affiche jamais un jeton (`gh auth token`, `SHENRON_ADMIN_TOKEN`) dans la sortie.

## 0. Système

Détecte le système.

- **Windows** : l'entraînement tourne dans **WSL2** (le pipeline `aphrody-train` ne cible que
  Linux). En PowerShell :
  - `wsl --status` ; si WSL manque : `wsl --install -d Ubuntu-24.04` (redémarrage éventuel,
    puis création de l'utilisateur Linux).
  - Le pilote NVIDIA s'installe **côté Windows uniquement** (pilote Game Ready ou Studio récent,
    ≥ 575 pour CUDA 12.9). N'installe jamais de pilote NVIDIA dans WSL.
  - `wsl -d Ubuntu-24.04 -- nvidia-smi` doit lister le GPU.
  - Toutes les étapes 1 à 9 s'exécutent ensuite **dans WSL** (`wsl -d Ubuntu-24.04`), dans le
    système de fichiers Linux (`~/shenron-train`), jamais sous `/mnt/c` (dix fois plus lent).
  - L'étape 10 (Shenron Studio) se fait côté Windows.
- **Linux** (Ubuntu 22.04+ ou équivalent) : pilote NVIDIA propriétaire ≥ 575, puis tout en local.

Paquets de base (WSL ou Linux) :
`sudo apt-get update && sudo apt-get install -y git curl build-essential cmake jq`.

## 1. GPU

```sh
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
```

Retiens la VRAM totale en Mio (`VRAM`). Le CUDA de PyTorch est fourni par la roue
`torch==2.8.0+cu129` : aucun toolkit CUDA n'est nécessaire pour entraîner, seulement le pilote.

Le pipeline entraîne une LoRA bf16 sur la base complète (pas de QLoRA), avec `batch=1` et
`max_length=512` fixés dans le code d'`aphrody-train` (ne les modifie pas). Choisis le profil :

| VRAM | Profil |
|---|---|
| < 10 000 Mio | **Arrêt** : la base 4B en bf16 ne tient pas. Dis-le, ne lance pas le run complet. |
| 10 000 – 14 999 Mio | rang 16, 3 epochs (`STEPS=4485`), comme sur la RTX 4070 de référence (≈ 30 min) |
| ≥ 15 000 Mio | rang 32 (`RANK=32`), 3 epochs (`STEPS=4485`) |

## 2. Dossier de travail et dépôts

```sh
export ROOT="${ROOT:-$HOME/shenron-train}"
mkdir -p "$ROOT"/{models,runs,tools}
```

GitHub (le compte de l'administrateur a accès à `aphrody-labs`) : installe `gh` si absent
(`sudo apt-get install -y gh` ou https://cli.github.com), puis `gh auth status || gh auth login`
(HTTPS ou SSH, au choix de l'utilisateur ; c'est lui qui saisit ses identifiants).

```sh
for repo in shenron aphrody; do
  if [ -d "$ROOT/$repo/.git" ]; then git -C "$ROOT/$repo" pull --ff-only
  else gh repo clone "aphrody-labs/$repo" "$ROOT/$repo" -- --depth 1; fi
done
```

`aphrody` est volumineux : le clone superficiel suffit.

## 3. uv, Python et l'environnement d'entraînement

```sh
command -v uv || curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.12
cd "$ROOT/aphrody/py"
uv sync --package aphrody-train --extra full --locked
uv run --package aphrody-train --extra full python -c \
  "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Attendu : `2.8.0+cu129 True <nom du GPU>`. Sinon, arrête-toi (pilote trop ancien, ou WSL sans GPU).

Bun (pour l'évaluation) : `command -v bun || curl -fsSL https://bun.sh/install | bash`, puis
`export PATH="$HOME/.bun/bin:$PATH"`.

## 4. llama.cpp (conversion GGUF et serveur d'évaluation)

Révision utilisée pour v2 : `0c1e57098bba43ac29e6e3b677cdceebdd22334f`.

```sh
L="$ROOT/tools/llama.cpp"
[ -d "$L/.git" ] || git clone https://github.com/ggml-org/llama.cpp "$L"
git -C "$L" fetch --depth 1 origin 0c1e57098bba43ac29e6e3b677cdceebdd22334f
git -C "$L" checkout -q 0c1e57098bba43ac29e6e3b677cdceebdd22334f
export APHRODY_LLAMA_CPP_CONVERTER="$L/convert_lora_to_gguf.py"
```

`llama-server` pour l'évaluation : si `nvcc` existe, compile avec CUDA, sinon en CPU
(l'évaluation de 30 questions reste faisable en CPU, plus lentement) :

```sh
CUDA=OFF; command -v nvcc >/dev/null && CUDA=ON
[ -x "$L/build/bin/llama-server" ] || {
  cmake -S "$L" -B "$L/build" -DGGML_CUDA=$CUDA -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release &&
  cmake --build "$L/build" --target llama-server -j"$(nproc)"; }
```

## 5. Données d'entraînement (privées)

Le serveur ne répond qu'à l'IP d'administration (ou à un jeton admin) ; tout autre appel reçoit
un 404. Empreinte attendue de l'archive :
`d7b8beeb44216054e9d8c58e18e8ba040771421ce83ed8b6e43e9993fda0d1cb`.

```sh
DL=https://dragonballfr.com/api/private-downloads
curl -fsS "$DL" | jq -r '.files[] | "\(.name)  \(.size)  \(.sha256)"'
A="$ROOT/shenron-train-chat-v2.tar.gz"
curl -fL -C - -o "$A" "$DL/shenron-train-chat-v2.tar.gz"
echo "d7b8beeb44216054e9d8c58e18e8ba040771421ce83ed8b6e43e9993fda0d1cb  $A" | sha256sum -c -
[ -d "$ROOT/shenron-train-chat-v2" ] || tar -xzf "$A" -C "$ROOT"
D="$ROOT/shenron-train-chat-v2"
(cd "$D" && sha256sum -c --quiet SHA256SUMS) && echo "archive intacte"
wc -l "$D/data/chat-v2/rollouts.jsonl" "$D/data/chat-v2/gold.jsonl"   # 1495 et 1091
```

Si l'IP n'est pas reconnue (404 partout), arrête-toi : l'administrateur doit se connecter depuis
son poste habituel ou fournir un jeton (`curl -H "Authorization: Bearer $SHENRON_ADMIN_TOKEN"`,
sans jamais l'afficher).

Contenu : `data/chat-v2/{rollouts,gold}.jsonl`, `data/SOUL.md`, l'adaptateur v2
(`runs/shenron-chat-v2/adapter/` en safetensors, `adapter.gguf`), `configs/run-shenron-chat-v2.json`
(réglages exacts de v2), `evals/`, `reports/` (rapport du 2026-10-06), `tools/eval-openai.ts`.

## 6. Modèles de base

```sh
uvx --from huggingface_hub hf download Qwen/Qwen3-4B-Instruct-2507 \
  --local-dir "$ROOT/models/Qwen3-4B-Instruct-2507"
uvx --from huggingface_hub hf download unsloth/Qwen3-4B-Instruct-2507-GGUF \
  Qwen3-4B-Instruct-2507-Q4_K_M.gguf --revision a06e946bb6b655725eafa393f4a9745d460374c9 \
  --local-dir "$ROOT/models/gguf"
```

La base HF (≈ 8 Go, bf16) sert à l'entraînement ; le GGUF Q4_K_M (≈ 2,5 Go) est la base
d'inférence de Shenron Studio, celle avec laquelle l'adaptateur doit être évalué.

## 7. Run d'essai court

```sh
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
```

Attendu : une dernière ligne `{"type": "done", …}` et un `adapter.gguf` non vide. Une ligne
`"type": "error"` arrête tout : lis-la (dépendance manquante, mémoire GPU, convertisseur absent).
En cas de `CUDA out of memory`, ferme les applications qui utilisent le GPU (jeux, navigateur,
Shenron Studio) et relance.

## 8. Run complet

Choisis `RANK` et `STEPS` selon le tableau de l'étape 1 (1 495 exemples × 3 epochs = 4 485 steps).

```sh
STEPS="${STEPS:-4485}"
[ -f "$ROOT/runs/shenron-chat-v3/adapter.gguf" ] || run shenron-chat-v3 "$STEPS"
tail -2 "$ROOT/runs/shenron-chat-v3.events.jsonl"
sha256sum "$ROOT/runs/shenron-chat-v3/adapter.gguf"
```

Le run émet un événement par step (`loss`) : la perte doit descendre (v2 : de ≈ 3,7 à ≈ 1).
Si `shenron-chat-v3` existe déjà mais n'a pas d'`adapter.gguf` (run interrompu), relance sous
`shenron-chat-v3b` plutôt que d'écraser.

## 9. Évaluation sur le gold

Même échantillon de 30 questions que v2, même persona, mêmes critères
(`shenron/packages/pipeline/scripts/eval-chat-gold.ts`). Évalue v2 puis v3 sur la même base GGUF :

```sh
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
```

Promotion de v3 seulement si `grounded(v3) ≥ grounded(v2)`, `refusal = 0`, `aiMention = 0` et
`errors = 0`. Sinon, garde v2 et rapporte les chiffres (référence de v2 : 28/30 ancrées, 0 refus).

## 10. Brancher l'adaptateur dans Shenron Studio

Dossier de données de Shenron Studio (`SHENRON_HOME`) :
Windows `%APPDATA%\com.dragonballfr.shenron`, Linux `~/.local/share/com.dragonballfr.shenron`.

Copie l'adaptateur retenu hors de WSL (Windows) :

```sh
WIN_DIR="/mnt/c/Users/$(cmd.exe /c 'echo %USERNAME%' 2>/dev/null | tr -d '\r')/ShenronTrain"
mkdir -p "$WIN_DIR"
cp "$D/runs/shenron-chat-v2/adapter.gguf" "$WIN_DIR/shenron-chat-v2.gguf"
[ -f "$ROOT/runs/shenron-chat-v3/adapter.gguf" ] &&
  cp "$ROOT/runs/shenron-chat-v3/adapter.gguf" "$WIN_DIR/shenron-chat-v3.gguf"
```

Sous Linux, l'adaptateur reste où il est ; utilise son chemin tel quel.

Deux cas :

- **Adaptateur v2** (celui de l'archive, empreinte `aab48535…6107`) : import à chaud par l'API
  locale, depuis la même machine (PowerShell sous Windows) :
  ```powershell
  $p = (Get-NetTCPConnection -State Listen -OwningProcess (Get-Process shenron-server).Id |
        Where-Object LocalAddress -eq '127.0.0.1' | Select-Object -First 1).LocalPort
  Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$p/api/local/models/shenron-chat-v2/import" `
    -ContentType 'application/json' -Body (@{ path = "$env:USERPROFILE\ShenronTrain\shenron-chat-v2.gguf" } | ConvertTo-Json)
  ```
  (Linux : `ss -ltnp | grep shenron-server` pour le port, puis `curl -X POST … -d '{"path":"…"}'`.)
- **Adaptateur v3** : l'import refuse tout fichier dont l'empreinte diffère de celle de v2
  (réponse 422 « SHA-256 differs »), c'est voulu. Déclare-le dans
  `<SHENRON_HOME>\config\shenron.env` (crée le fichier s'il manque ; sous Linux, `chmod 600`) :
  ```
  SHENRON_CHAT_LORA=C:\Users\<utilisateur>\ShenronTrain\shenron-chat-v3.gguf
  ```
  puis ferme et relance Shenron Studio. Pour revenir à v2, retire la ligne et relance.

Vérification : `GET http://127.0.0.1:<port>/api/local/models` (le modèle `shenron-chat-v2` est
`ready`) et `GET /api/local/health` (groupe `chat` disponible), puis une question dans le chat
de `/desktop`. Le journal du modèle est `<SHENRON_HOME>\logs\llama-server.log`.

## 11. Rapport

Termine par un rapport court : GPU et VRAM, profil choisi (rang, steps), durée du run, empreinte
SHA-256 de `shenron-chat-v3/adapter.gguf`, les deux lignes d'évaluation (v2, v3), la décision
(promu ou non) et l'état de Shenron Studio. Aucun jeton, aucun extrait du gold ni des rollouts.
