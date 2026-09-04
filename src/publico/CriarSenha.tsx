// ─────────────────────────────────────────────────────────────────────────────
//  A tela de criar a própria senha, aberta pelo link do convite.
//
//  É a única tela do portal que alguém alcança sem estar dentro dele, e por
//  isso ela não mostra nada além do necessário: de quem é o convite - para a
//  pessoa saber que está no lugar certo - e o campo da senha.
//
//  Quem prova a identidade aqui é a caixa de e-mail: o token só existe na
//  mensagem que foi para o endereço cadastrado. Ele vale 24 horas, morre no
//  primeiro uso, e o servidor reconfere a elegibilidade na hora de gastá-lo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { CampoSenha } from '../components/CampoSenha';
import { IconAlert, IconCheck, IconSpinner } from '../components/icons';

/** O mesmo mínimo que o servidor exige. Aqui ele só evita a ida ao servidor
 *  para ouvir o óbvio - quem decide continua sendo ele. */
const SENHA_MINIMA = 8;

/** A mesma chave que o portal usa: criada a senha, a sessão já vem junto e a
 *  pessoa entra sem digitar nada de novo. */
const SESSION_KEY = 'dux_admin_token';

type Estado =
  | { fase: 'conferindo' }
  | { fase: 'invalido'; erro: string }
  | { fase: 'pronto'; nome: string; email: string }
  | { fase: 'gravando'; nome: string; email: string };

export default function CriarSenha({ token }: { token: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'conferindo' });
  /** Já havia alguém entrado nesta janela. O convite continua valendo - quem
   *  manda aqui é o token, não a sessão -, mas criar a senha troca a conta da
   *  janela, e isso precisa ser dito antes e não depois. */
  const [sessaoAberta] = useState(() => !!localStorage.getItem(SESSION_KEY));
  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  // De quem é o convite. A resposta não diz *por que* um link não vale - só que
  // não vale: a diferença entre "expirado" e "inexistente" é informação para
  // quem estiver testando links.
  useEffect(() => {
    let vivo = true;
    fetch('/api/admin-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'senha-token-info', token }),
    })
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) { setEstado({ fase: 'invalido', erro: d.error ?? 'Este link não vale mais.' }); return; }
        setEstado({ fase: 'pronto', nome: d.nome, email: d.email });
      })
      .catch(() => { if (vivo) setEstado({ fase: 'invalido', erro: 'Não foi possível abrir o convite. Tente de novo.' }); });
    return () => { vivo = false; };
  }, [token]);

  const curta = senha.length > 0 && senha.length < SENHA_MINIMA;
  const diferentes = repetida.length > 0 && senha !== repetida;
  const podeGravar = senha.length >= SENHA_MINIMA && senha === repetida;

  async function gravar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeGravar || estado.fase !== 'pronto') return;
    setErro(null);
    setEstado({ fase: 'gravando', nome: estado.nome, email: estado.email });
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'senha-token-usar', token, senha }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(d.error ?? 'Não foi possível gravar a senha.');
        setEstado({ fase: 'pronto', nome: estado.nome, email: estado.email });
        return;
      }
      // A sessão vem junto: entrar de novo logo depois de criar a senha seria
      // pedir a mesma prova duas vezes.
      localStorage.setItem(SESSION_KEY, d.token);
      window.location.replace('/');
    } catch {
      setErro('Erro de conexão. Tente novamente.');
      setEstado({ fase: 'pronto', nome: estado.nome, email: estado.email });
    }
  }

  return (
    <div className="login-tela">
      <div className="login-coluna">
        <div className="login-bloco">
          <div className="login-lockup">
            <img src="/logo-lockup.png" alt="Sheep Technology" className="login-lockup-marca" />
          </div>

          {estado.fase === 'conferindo' && (
            <>
              <h1 className="login-titulo">Um instante</h1>
              <p className="login-chamada"><IconSpinner size={13} /> Conferindo o seu convite…</p>
            </>
          )}

          {estado.fase === 'invalido' && (
            <>
              <h1 className="login-titulo">Link vencido</h1>
              <p className="login-aviso" role="alert">
                <IconAlert size={13} /> {estado.erro}
              </p>
              <p className="login-chamada" style={{ marginTop: 12 }}>
                Cada convite vale 24 horas e só pode ser usado uma vez. Peça um novo a quem
                te deu acesso.
              </p>
            </>
          )}

          {(estado.fase === 'pronto' || estado.fase === 'gravando') && (
            <>
              <h1 className="login-titulo">Crie sua senha</h1>
              <p className="login-chamada">
                Olá, {estado.nome.split(' ')[0]}. Ela vale para entrar com{' '}
                <strong>{estado.email}</strong>.
              </p>

              {sessaoAberta && (
                <p className="login-aviso" style={{ marginTop: 14 }}>
                  <IconAlert size={13} /> Esta janela já está entrada como outra pessoa. Ao
                  criar a senha, ela passa a ser de {estado.email}.
                </p>
              )}

              <form className="login-senha" onSubmit={gravar} style={{ paddingTop: 18 }}>
                <CampoSenha valor={senha} onMudar={setSenha} erro={curta} autoFocus
                  placeholder={`Sua senha (ao menos ${SENHA_MINIMA} caracteres)`}
                  autoComplete="new-password" />
                <CampoSenha valor={repetida} onMudar={setRepetida} erro={diferentes}
                  placeholder="Repita a senha" autoComplete="new-password" />

                <button type="submit" className="login-senha-botao"
                  disabled={!podeGravar || estado.fase === 'gravando'}>
                  {estado.fase === 'gravando'
                    ? <><IconSpinner size={13} /> Gravando…</>
                    : <><IconCheck size={13} /> Criar senha e entrar</>}
                </button>

                {diferentes && <p className="login-erro">As duas senhas não são iguais.</p>}
                {erro && <p className="login-erro" role="alert">{erro}</p>}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
