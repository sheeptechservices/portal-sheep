# O bot do WhatsApp: Node 22 e o Claude Code, rodando como usuário comum.

# ── O whisper.cpp, compilado à parte, e os modelos de voz ────────────────────
# Transcreve a mensagem de voz na própria máquina, sem custo. Compilado aqui e
# levado só o executável para a imagem final: as ferramentas de compilação
# ficam para trás. Versão fixa, para uma montagem nova não mudar o modelo de
# baixo do bot. Os modelos (o do whisper e os do Kokoro) também são baixados
# aqui, onde já há o curl.
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
# O Kokoro, para a resposta em áudio: o modelo inteiro (o comprimido não sai
# mais rápido no processador) e o arquivo das vozes.
RUN mkdir /kokoro \
  && curl -fsSL -o /kokoro/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx \
  && curl -fsSL -o /kokoro/voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

# ── O bot ────────────────────────────────────────────────────────────────────
FROM node:22-slim

# poppler-utils: a ferramenta de leitura do Claude Code usa o pdftoppm para
# abrir PDF grande página por página. Sem ele, só PDF pequeno abre.
# ffmpeg: a voz do WhatsApp vem em OGG/Opus, que o whisper.cpp não lê; o
# ffmpeg passa para WAV antes.
# python3: roda o Kokoro (`falar.py`), num ambiente próprio, para a resposta
# em áudio.
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils ffmpeg python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/kokoro \
  && /opt/kokoro/bin/pip install --no-cache-dir kokoro-onnx==0.6.1

RUN npm install -g @anthropic-ai/claude-code \
  && npm cache clean --force

# chromium e fonts-inter: desenham os gráficos e imprimem o relatório em PDF
# (graficos.mjs), na fonte da marca. O navegador não busca nada fora: tudo o
# que a página precisa vem dentro dela.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-inter \
  && rm -rf /var/lib/apt/lists/*

# tzdata e TZ: o contêiner vive no relógio de Brasília. Em UTC, perto da
# meia-noite o Claude Code já via o dia seguinte, e "amanhã" virava depois de
# amanhã.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata \
  && rm -rf /var/lib/apt/lists/*

COPY --from=whisper /whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper /modelo.bin /opt/whisper/modelo.bin
COPY --from=whisper /kokoro /opt/kokoro/modelos

WORKDIR /app
# As dependências (puppeteer-core e docx, dos gráficos e relatórios) antes do
# código: mudar o código não reinstala nada.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.mjs documentos.mjs mensagem-grupo.mjs transcricao.mjs voz.mjs falar.py graficos.mjs anexos-mcp.mjs whatsapp-mcp.mjs agenda-mcp.mjs relatorios-mcp.mjs preferencias-mcp.mjs vinculos.mjs ./
COPY marca ./marca
RUN mkdir -p /app/trabalho /dados && chown -R node:node /app /dados

USER node
# As conversas do Claude Code moram no volume: sem isso, cada versão nova do
# bot apagaria a memória de todas elas.
ENV HOME=/home/node \
    CLAUDE_CONFIG_DIR=/dados/claude \
    DADOS_DIR=/dados \
    TRABALHO_DIR=/app/trabalho \
    PORT=3000 \
    WHISPER_MODELO=/opt/whisper/modelo.bin \
    CHROMIUM_BIN=/usr/bin/chromium \
    TZ=America/Sao_Paulo

EXPOSE 3000
CMD ["node", "index.mjs"]
