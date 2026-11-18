# O bot do WhatsApp: Node 22 e o Claude Code, rodando como usuário comum.

# ── O whisper.cpp, compilado à parte ─────────────────────────────────────────
# Transcreve a mensagem de voz na própria máquina, sem custo. Compilado aqui e
# levado só o executável para a imagem final: as ferramentas de compilação
# ficam para trás. Versão fixa, para uma montagem nova não mudar o modelo de
# baixo do bot.
FROM node:22-slim AS whisper
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
ARG WHISPER_VERSAO=v1.9.5
RUN git clone --depth 1 --branch "$WHISPER_VERSAO" https://github.com/ggml-org/whisper.cpp /src \
  && cmake -S /src -B /src/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
       -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
  && cmake --build /src/build --config Release -j "$(nproc)" --target whisper-cli \
  && cp /src/build/bin/whisper-cli /whisper-cli
# O modelo "small" comprimido (q5_1, 190 MB): acerta bem português e cabe nos
# dois processadores da VPS. O "base" é mais rápido e erra mais.
RUN curl -fsSL -o /modelo.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin

# ── O bot ────────────────────────────────────────────────────────────────────
FROM node:22-slim

# poppler-utils: a ferramenta de leitura do Claude Code usa o pdftoppm para
# abrir PDF grande página por página. Sem ele, só PDF pequeno abre.
# ffmpeg: a voz do WhatsApp vem em OGG/Opus, que o whisper.cpp não lê; o
# ffmpeg passa para WAV antes.
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code \
  && npm cache clean --force

COPY --from=whisper /whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper /modelo.bin /opt/whisper/modelo.bin

WORKDIR /app
COPY index.mjs documentos.mjs mensagem-grupo.mjs transcricao.mjs anexos-mcp.mjs whatsapp-mcp.mjs agenda-mcp.mjs ./
RUN mkdir -p /app/trabalho /dados && chown -R node:node /app /dados

USER node
# As conversas do Claude Code moram no volume: sem isso, cada versão nova do
# bot apagaria a memória de todas elas.
ENV HOME=/home/node \
    CLAUDE_CONFIG_DIR=/dados/claude \
    DADOS_DIR=/dados \
    TRABALHO_DIR=/app/trabalho \
    PORT=3000 \
    WHISPER_MODELO=/opt/whisper/modelo.bin

EXPOSE 3000
CMD ["node", "index.mjs"]
