# O bot do WhatsApp: Node 22 e o Claude Code, rodando como usuário comum.
FROM node:22-slim

# poppler-utils: a ferramenta de leitura do Claude Code usa o pdftoppm para
# abrir PDF grande página por página. Sem ele, só PDF pequeno abre.
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code \
  && npm cache clean --force

WORKDIR /app
COPY index.mjs documentos.mjs ./
RUN mkdir -p /app/trabalho /dados && chown -R node:node /app /dados

USER node
# As conversas do Claude Code moram no volume: sem isso, cada versão nova do
# bot apagaria a memória de todas elas.
ENV HOME=/home/node \
    CLAUDE_CONFIG_DIR=/dados/claude \
    DADOS_DIR=/dados \
    TRABALHO_DIR=/app/trabalho \
    PORT=3000

EXPOSE 3000
CMD ["node", "index.mjs"]
