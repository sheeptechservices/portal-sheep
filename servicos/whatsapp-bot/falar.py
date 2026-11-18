# Texto em fala, com o Kokoro, na própria máquina: sem internet, sem chave e
# sem custo. Chamado pelo `voz.mjs` do bot, uma vez por áudio.
#
# Uso: echo "texto" | python falar.py --voz pm_alex --saida /caminho/fala.wav
#
# O texto vem pela entrada padrão (um texto que comece com hífen não vira
# opção). Vai em pedaços de frase em frase, porque o modelo tem um teto de
# fonemas por vez, e os pedaços são emendados com uma pausa curta.
import argparse
import os
import re
import sys
import wave

import numpy as np
from kokoro_onnx import Kokoro

MODELOS = os.environ.get('KOKORO_MODELOS', '/opt/kokoro/modelos')
PEDACO_MAX = 300
PAUSA_S = 0.18


def pedacos(texto):
    frases = [f.strip() for f in re.split(r'(?<=[.!?;:])\s+|\n+', texto) if f.strip()]
    atual = ''
    for f in frases:
        if atual and len(atual) + 1 + len(f) > PEDACO_MAX:
            yield atual
            atual = f
        else:
            atual = f'{atual} {f}'.strip()
    if atual:
        yield atual


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--voz', default='pm_alex')
    p.add_argument('--saida', required=True)
    p.add_argument('--velocidade', type=float, default=1.0)
    a = p.parse_args()

    texto = sys.stdin.read().strip()
    if not texto:
        sys.exit('texto vazio')
    kokoro = Kokoro(os.path.join(MODELOS, 'kokoro-v1.0.onnx'), os.path.join(MODELOS, 'voices-v1.0.bin'))
    partes = []
    taxa = 24000
    for trecho in pedacos(texto):
        amostras, taxa = kokoro.create(trecho, voice=a.voz, speed=a.velocidade, lang='pt-br')
        partes.append(amostras)
        partes.append(np.zeros(int(taxa * PAUSA_S), dtype=np.float32))
    som = np.concatenate(partes)
    pcm = (np.clip(som, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(a.saida, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taxa)
        w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    main()
