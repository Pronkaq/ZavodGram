import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import AuthPage from './pages/AuthPage';
import ChatApp from './components/ChatApp';
import AdminPage from './pages/AdminPage';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'radial-gradient(1100px 600px at 15% 15%, rgba(255,255,255,0.14), transparent 58%), linear-gradient(160deg, #0f1319, #1b2028)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.28)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, fontFamily: 'monospace', color: '#F4F7FB', marginBottom: 16, animation: 'pulse 1.5s infinite', backdropFilter: 'blur(22px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 12px 22px rgba(0,0,0,0.24)' }}>Z</div>
          <div style={{ color: '#CDD2DC', fontSize: 14 }}>Загрузка...</div>
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }`}</style>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (window.location.pathname.startsWith('/admin')) {
    return <AdminPage />;
  }

  return (
    <ChatProvider>
      <ChatApp />
    </ChatProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
