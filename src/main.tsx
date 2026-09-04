import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/main.css';

// Três entradas, escolhidas pelo caminho e não por um roteador: `/p/<token>` é
// a página de acompanhamento do cliente, `/senha/<token>` é o convite de criar
// a própria senha, e o resto é o portal.
//
// A escolha acontece aqui, antes de qualquer `import`, para o cliente não
// baixar o código do portal - o `lazy` só carrega o que a rota pediu. Não é a
// tranca (essa é o servidor, que exige sessão em tudo), mas é o que garante
// que a tela de entrada do portal não existe para quem abre o link público.
const AdminApp = lazy(() => import('./admin/AdminApp'));
const ProjetoPublico = lazy(() => import('./publico/ProjetoPublico'));
const CriarSenha = lazy(() => import('./publico/CriarSenha'));

const publico = /^\/p\/([0-9a-f]{32})\/?$/.exec(window.location.pathname);
// O token do convite é base64url de 32 bytes - 43 caracteres do alfabeto dele.
const convite = /^\/senha\/([A-Za-z0-9_-]{20,})\/?$/.exec(window.location.pathname);

const Fallback = (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 28, height: 28, border: '3px solid #E3E4DE', borderTopColor: '#00C9A7', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={Fallback}>
      {publico ? <ProjetoPublico token={publico[1]} />
        : convite ? <CriarSenha token={convite[1]} />
          : <AdminApp />}
    </Suspense>
  </StrictMode>
);
