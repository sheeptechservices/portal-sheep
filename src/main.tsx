import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/main.css';

const path = window.location.pathname;
const isAceite = path.startsWith('/aceite/');

// A raiz do site é o próprio sistema (login + admin). O portal de aceite fica
// em /aceite/ e carrega num chunk separado.
const AdminApp = lazy(() => import('./admin/AdminApp'));
const AceitePortal = lazy(() => import('./portal/AceitePortal'));

const Fallback = (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 28, height: 28, border: '3px solid #E3E4DE', borderTopColor: '#00C9A7', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={Fallback}>
      {isAceite ? <AceitePortal /> : <AdminApp />}
    </Suspense>
  </StrictMode>
);
