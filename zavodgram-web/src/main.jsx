import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import AuthPage from './pages/AuthPage';
import ChatApp from './components/ChatApp';
import AdminPage from './pages/AdminPage';
import './styles/redesign.css';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="zg-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 16 }}>
        <div className="zg-glass-card" style={{ textAlign: 'center', padding: '30px 34px', minWidth: 240 }}>
          <div style={{ width: 70, height: 70, background: 'linear-gradient(135deg, #4A9EE5, #7C6BDE)', borderRadius: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 700, fontFamily: 'monospace', color: '#fff', marginBottom: 16, animation: 'pulse 1.5s infinite' }}>Z</div>
          <div style={{ color: '#8b95ad', fontSize: 14 }}>Загрузка интерфейса...</div>
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
