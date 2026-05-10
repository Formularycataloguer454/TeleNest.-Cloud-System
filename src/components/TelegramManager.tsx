import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  MessageCircle, Shield, Activity, RefreshCw, Trash2, LogOut, 
  Smartphone, Globe, Key, Database, Zap, Archive, Users, Hash, Megaphone, ShieldCheck, Crown
} from 'lucide-react';
import axios from 'axios';

const TelegramManager = ({ showConfirm, showToast }: { 
    showConfirm: (message: string, onConfirm: () => void) => void,
    showToast: (message: string, type?: 'success' | 'error') => void
}) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ping, setPing] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const [chats, setChats] = useState<any>({ users: [], groups: [], channels: [] });
  const [loadingChats, setLoadingChats] = useState(true);

  const fetchStatus = () => {
    const start = Date.now();
    axios.get('http://localhost:3001/api/auth/status')
      .then(res => {
        if (res.data.authorized) {
          setUser(res.data.user);
          setPing(Date.now() - start);
          fetchChats();
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        showToast('Failed to connect to Telegram server', 'error');
      });
  };

  const fetchChats = () => {
    setLoadingChats(true);
    axios.get('http://localhost:3001/api/telegram/dialogs')
      .then(res => {
        setChats(res.data.chats);
        setLoadingChats(false);
      })
      .catch(() => {
        setLoadingChats(false);
      });
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    showConfirm('Are you sure you want to log out?', async () => {
        setIsProcessing('logout');
        try {
            await axios.post('http://localhost:3001/api/auth/logout');
            window.location.href = '/';
        } catch (err) {
            showToast('Failed to logout', 'error');
            setIsProcessing(null);
        }
    });
  };

  const handleAction = async (action: string, endpoint: string, confirmMsg: string) => {
    showConfirm(confirmMsg, async () => {
        setIsProcessing(action);
        try {
          await axios.post(`http://localhost:3001/api/workspace/${endpoint}`);
          if (endpoint === 'wipe-data') {
            window.location.href = '/';
            return;
          }
          showToast(`Action '${action}' completed successfully!`);
        } catch (err) {
          showToast(`Failed to complete action`, 'error');
        } finally {
          setIsProcessing(null);
        }
    });
  };

  const handleChatAction = async (chatId: string, action: 'leave' | 'delete', name: string) => {
    showConfirm(`${action === 'leave' ? 'Leave' : 'Delete'} "${name}"? This cannot be undone.`, async () => {
        setIsProcessing(`chat-${chatId}`);
        try {
          await axios.post('http://localhost:3001/api/telegram/chats/action', { chatId, action });
          fetchChats();
          showToast(`${action === 'leave' ? 'Left' : 'Deleted'} ${name} successfully!`);
        } catch (err) {
          showToast(`Failed to ${action} chat`, 'error');
        } finally {
          setIsProcessing(null);
        }
    });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '20px' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(42, 171, 238, 0.1)', borderTopColor: 'var(--tg-blue)', borderRadius: '50%' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Connecting to Telegram...</p>
      </div>
    );
  }

  const renderChatList = (chatArray: any[], icon: any, color: string, title: string) => (
    <div className="glass-panel" style={{ padding: '24px', maxHeight: '500px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px', marginBottom: '16px' }}>
        {icon}
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{title} ({chatArray.length})</h3>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '8px' }}>
        {chatArray.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', marginTop: '20px' }}>No chats found</p>
        ) : (
          chatArray.slice(0, 50).map((chat: any) => (
            <div key={chat.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid transparent', transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{chat.name}</span>
                  {chat.isCreator && <Crown size={14} color="#facc15" title="Owner" />}
                  {chat.isAdmin && !chat.isCreator && <ShieldCheck size={14} color="var(--tg-blue)" title="Admin" />}
                </div>
                {chat.unread > 0 && <span style={{ background: color, color: '#000', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800 }}>{chat.unread}</span>}
              </div>
              
              {!chat.id.startsWith('-') && !chat.id.startsWith('100') ? null : ( // Only show actions for groups/channels
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button 
                    disabled={!!isProcessing}
                    onClick={() => handleChatAction(chat.id, 'leave', chat.name)}
                    style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <LogOut size={12} /> Leave
                  </button>
                  {chat.isCreator && (
                    <button 
                      disabled={!!isProcessing}
                      onClick={() => handleChatAction(chat.id, 'delete', chat.name)}
                      style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ paddingBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
        <div style={{ background: 'rgba(42, 171, 238, 0.15)', padding: '12px', borderRadius: '16px', color: 'var(--tg-blue)' }}>
          <MessageCircle size={32} />
        </div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0 }} className="text-gradient">Telegram Control</h1>
      </div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '40px', fontSize: '1.1rem' }}>Manage your connected Telegram account and TeleNest cloud configuration.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        
        {/* Profile Card */}
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px' }}>
            <Shield size={24} color="var(--tg-blue)" />
            <h2 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 700 }}>Account Identity</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--tg-blue), #ca8a04)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src={user ? `https://api.dicebear.com/7.x/initials/svg?seed=${user.firstName}` : ""} alt="User" style={{ width: '100%', height: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 4px 0' }}>{user?.firstName} {user?.lastName}</h3>
              <p style={{ color: 'var(--tg-blue)', fontWeight: 500, margin: '0 0 8px 0', fontSize: '1rem' }}>@{user?.username || 'No Username'}</p>
              <div style={{ display: 'inline-block', padding: '4px 12px', background: 'rgba(255,255,255,0.1)', borderRadius: '20px', fontSize: '0.85rem', color: '#ccc' }}>
                ID: {user?.id}
              </div>
            </div>
          </div>
        </div>

        {/* Network Health */}
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px' }}>
            <Activity size={24} color="#10b981" />
            <h2 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 700 }}>Connection Health</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}><Zap size={18} /> API Latency</div>
              <div style={{ fontWeight: 700, color: (ping && ping < 200) ? '#10b981' : '#facc15' }}>{ping ? `${ping}ms` : 'Measuring...'}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}><Key size={18} /> Auth Token</div>
              <div style={{ fontWeight: 700, color: '#10b981' }}>Valid & Secured</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}><Globe size={18} /> Data Center</div>
              <div style={{ fontWeight: 700 }}>Optimal (Auto)</div>
            </div>
          </div>
        </div>

      </div>

      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>Your Telegram Chats</h2>
      
      {loadingChats ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div className="spinner" style={{ width: '30px', height: '30px', border: '3px solid rgba(42, 171, 238, 0.1)', borderTopColor: 'var(--tg-blue)', borderRadius: '50%' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '40px' }}>
          {renderChatList(chats.users, <Users size={20} color="#3b82f6" />, 'var(--tg-blue)', 'Private Chats')}
          {renderChatList(chats.groups, <Hash size={20} color="#10b981" />, '#10b981', 'Groups')}
          {renderChatList(chats.channels, <Megaphone size={20} color="#facc15" />, '#facc15', 'Channels')}
        </div>
      )}

      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>Advanced Operations</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        
        {/* Sync Cache */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <RefreshCw size={24} color="var(--tg-blue)" />
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Sync Cloud Nodes</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', flex: 1, margin: 0 }}>Force refresh all storage channels and fetch latest sizes directly from Telegram.</p>
          <button 
            disabled={!!isProcessing}
            onClick={() => handleAction('Sync Cache', 'refresh-stats', 'Force refresh all storage nodes? This may take a few seconds.')}
            className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}
          >
            {isProcessing === 'Sync Cache' ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        {/* Clear Thumbnails */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Smartphone size={24} color="#facc15" />
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Clear Media Cache</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', flex: 1, margin: 0 }}>Free up local server space by deleting cached thumbnails and media fragments.</p>
          <button 
            disabled={!!isProcessing}
            onClick={() => handleAction('Clear Cache', 'clear-thumbnails', 'Delete all cached images? They will be re-downloaded when viewed.')}
            className="btn-primary" style={{ width: '100%', justifyContent: 'center', background: 'rgba(250, 204, 21, 0.1)', color: '#facc15', border: '1px solid rgba(250, 204, 21, 0.3)' }}
          >
            {isProcessing === 'Clear Cache' ? 'Clearing...' : 'Clear Cache'}
          </button>
        </div>

        {/* Archive Channels */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Archive size={24} color="#f97316" />
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Archive All Nodes</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', flex: 1, margin: 0 }}>Moves all your TeleNest storage channels into your Telegram Archive folder.</p>
          <button 
            disabled={!!isProcessing}
            onClick={() => handleAction('Archive', 'folders/archive-all', 'Archive all TeleNest channels in your Telegram app?')}
            className="btn-primary" style={{ width: '100%', justifyContent: 'center', background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)' }}
          >
            {isProcessing === 'Archive' ? 'Archiving...' : 'Archive Channels'}
          </button>
        </div>

        {/* Danger Zone: Wipe Data */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Trash2 size={24} color="#ef4444" />
            <h3 style={{ fontSize: '1.1rem', margin: 0, color: '#ef4444' }}>Nuclear Wipe</h3>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', flex: 1, margin: 0 }}>Permanently delete all TeleNest channels and files from your Telegram account.</p>
          <button 
            disabled={!!isProcessing}
            onClick={() => handleAction('Wipe', 'wipe-data', 'DANGER: This will permanently delete ALL your files and folders from Telegram. Proceed?')}
            className="btn-primary" style={{ width: '100%', justifyContent: 'center', background: '#ef4444', color: '#fff', border: 'none' }}
          >
            {isProcessing === 'Wipe' ? 'Wiping...' : 'Destroy All Data'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: '40px', padding: '24px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--glass-border)' }}>
        <div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem' }}>Sign Out of TeleNest</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Disconnect your Telegram account from this local server.</p>
        </div>
        <button 
          onClick={handleLogout}
          disabled={!!isProcessing}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '12px', background: 'transparent', border: '1px solid var(--text-secondary)', color: '#fff', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <LogOut size={18} /> {isProcessing === 'logout' ? 'Logging out...' : 'Sign Out'}
        </button>
      </div>
      
    </motion.div>
  );
};

export default TelegramManager;
