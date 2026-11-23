import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/main.css';
import { telaSobDemanda } from './lib/novaVersao';
import { AvisoNovaVersao } from './components/AvisoNovaVersao';

// Três entradas, escolhidas pelo caminho e não por um roteador: `/p/<token>` é
// a página de acompanhamento do cliente, `/senha/<token>` é o convite de criar
// a própria senha, e o resto é o portal.
//
// A escolha acontece aqui, antes de qualquer `import`, para o cliente não
// baixar o código do portal - o `lazy` só carrega o que a rota pediu. Não é a
// tranca (essa é o servidor, que exige sessão em tudo), mas é o que garante
// que a tela de entrada do portal não existe para quem abre o link público.
const AdminApp = telaSobDemanda(() => import('./admin/AdminApp'));
const ProjetoPublico = telaSobDemanda(() => import('./publico/ProjetoPublico'));
const CriarSenha = telaSobDemanda(() => import('./publico/CriarSenha'));
const VitrinePublica = telaSobDemanda(() => import('./publico/VitrinePublica'));
const PropostaPublica = telaSobDemanda(() => import('./publico/PropostaPublica'));
const ChamadosDoCliente = telaSobDemanda(() => import('./publico/ChamadosDoCliente'));

const publico = /^\/p\/([0-9a-f]{32})\/?$/.exec(window.location.pathname);
// `/v/<token>` é a vitrine de profissionais: a seleção de uma vaga mostrada a
// um cliente, sem login e sem identificação de quem está ali.
const vitrine = /^\/v\/([0-9a-f]{32})\/?$/.exec(window.location.pathname);
// `/proposta/<token>` é a apresentação de uma proposta, mandada por link no
// lugar do PDF.
const proposta = /^\/proposta\/([0-9a-f]{32})\/?$/.exec(window.location.pathname);
// `/chamados/<token>` é o painel de chamados do cliente: abrir e acompanhar os
// chamados de um projeto, sem login.
const chamados = /^\/chamados\/([0-9a-f]{32})\/?$/.exec(window.location.pathname);
// O token do convite é base64url de 32 bytes - 43 caracteres do alfabeto dele.
const convite = /^\/senha\/([A-Za-z0-9_-]{20,})\/?$/.exec(window.location.pathname);

const Fallback = (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 28, height: 28, border: '3px solid #E3E4DE', borderTopColor: '#121316', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={Fallback}>
      {publico ? <ProjetoPublico token={publico[1]} />
        : vitrine ? <VitrinePublica token={vitrine[1]} />
          : proposta ? <PropostaPublica token={proposta[1]} />
          : chamados ? <ChamadosDoCliente token={chamados[1]} />
            : convite ? <CriarSenha token={convite[1]} />
              : <AdminApp />}
    </Suspense>
    {/* Fora do Suspense: o aviso de versão nova vale em qualquer entrada. */}
    <AvisoNovaVersao />
  </StrictMode>
);
