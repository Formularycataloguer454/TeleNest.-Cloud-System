import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  User, Shield, HardDrive, Bell, Eye, LogOut, 
  ChevronRight, ExternalLink, Info, Check, RefreshCw, Trash2
} from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const SettingsView = ({ addNotification, showConfirm }: { 
    addNotification: (title: string, message: string, type: 'info'|'success'|'warning') => void,
    showConfirm: (message: string, onConfirm: () => void) => void
}) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ size: '0 KB', count: 0 });
  const [isClearing, setIsClearing] = useState(false);
  const [archiveStatus, setArchiveStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [appSettings, setAppSettings] = useState({
    autoDeleteTrash: true,
    trashRetentionDays: 3,
    thumbnailQuality: "high",
    theme: "dark",
    maxConcurrentUploads: 3
  });

  const fetchSettings = async () => {
    try {
      const res = await axios.get('http://localhost:3001/api/settings');
      setAppSettings(res.data);
      localStorage.setItem('telenest_datasaver', String(res.data.dataSaverMode));
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  };

  const updateSetting = async (key: string, value: any) => {
    const newSettings = { ...appSettings, [key]: value };
    setAppSettings(newSettings);
    if (key === 'dataSaverMode') localStorage.setItem('telenest_datasaver', String(value));
    try {
      await axios.post('http://localhost:3001/api/settings', newSettings);
      showToast('Setting updated!');
      addNotification('Setting Updated', `The "${key}" preference has been saved successfully.`, 'success');
    } catch (err) {
      showToast('Failed to update setting', 'error');
      addNotification('System Error', 'Could not save application settings. Please try again.', 'warning');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchStats = () => {
    axios.get('http://localhost:3001/api/workspace/folders')
      .then(res => {
        let totalBytes = 0;
        let totalCount = 0;
        Object.keys(res.data).forEach(k => {
          if (['Images', 'Videos', 'Documents', 'Audio', 'Downloads'].includes(k) || res.data[k].type === 'custom') {
            totalBytes += res.data[k].size || 0;
            totalCount += res.data[k].count || 0;
          }
        });
        
        const formatSize = (bytes: number) => {
          if (bytes === 0) return '0 KB';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        };
        setStats({ size: formatSize(totalBytes), count: totalCount });
      });
  };

  const handleRefreshStats = async () => {
    setIsRefreshing(true);
    try {
      await axios.post('http://localhost:3001/api/workspace/refresh-stats');
      fetchStats();
      showToast('Statistics synchronized successfully!');
      addNotification('Storage Synced', 'Cloud nodes have been scanned and stats updated.', 'success');
    } catch (err) {
      showToast('Failed to refresh stats', 'error');
      addNotification('Sync Error', 'Could not synchronize cloud storage stats.', 'warning');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Fetch User Profile
    axios.get('http://localhost:3001/api/auth/status')
      .then(res => {
        if (res.data.authorized) setUser(res.data.user);
        setLoading(false);
      });

    fetchStats();
    fetchSettings();
  }, []);

  const handleLogout = async () => {
    showConfirm('Are you sure you want to log out?', async () => {
        try {
            await axios.post('http://localhost:3001/api/auth/logout');
            window.location.href = '/';
        } catch (err) {
            showToast('Failed to logout', 'error');
        }
    });
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      await axios.post('http://localhost:3001/api/workspace/clear-thumbnails');
      showToast('Thumbnails cleared! They will regenerate on next view.');
      addNotification('Cache Cleared', 'Thumbnail cache has been optimized successfully.', 'info');
    } catch (err) {
      showToast('Failed to clear thumbnails', 'error');
      addNotification('Cache Error', 'Failed to clear local thumbnail storage.', 'warning');
    } finally {
      setIsClearing(false);
    }
  };

  const handleArchiveAll = async () => {
    setArchiveStatus('loading');
    try {
      await axios.post('http://localhost:3001/api/workspace/folders/archive-all');
      setArchiveStatus('done');
      showToast('All channels moved to Archive!');
      addNotification('Channels Archived', 'All system folders have been moved to your Telegram Archive.', 'success');
    } catch (err) {
      setArchiveStatus('idle');
      showToast('Archival failed', 'error');
      addNotification('Archival Failed', 'Could not move channels to the archive.', 'warning');
    }
  };

  const handleWipeData = () => {
    setShowWipeModal(true);
  };

  const confirmWipe = async () => {
    setShowWipeModal(false);
    setLoading(true);
    showToast('Initiating Nuclear Option...', 'error');
    
    try {
      addNotification('Nuclear Action', 'Initiating full data wipe across all cloud nodes...', 'warning');
      await axios.post('http://localhost:3001/api/workspace/wipe-data');
      window.location.href = '/';
    } catch (err) {
      setLoading(false);
      showToast('Wipe failed', 'error');
      addNotification('Wipe Error', 'Nuclear option failed to execute properly.', 'warning');
    }
  };

  const sections = [
    {
      title: "Account & Profile",
      icon: <User size={20} color="var(--tg-blue)" />,
      items: [
        { label: "Profile Name", value: user?.firstName || "Loading...", sub: "As seen on Telegram" },
        { label: "Username", value: user?.username ? `@${user.username}` : "Not set", sub: "Your unique handle" },
        { label: "Telegram ID", value: user?.id || "Unknown", sub: "Internal user identification" },
      ]
    },
    {
      title: "Application Preferences",
      icon: <Eye size={20} color="var(--accent-purple)" />,
      items: [
        { 
          label: "Auto-Delete Trash", 
          sub: "Automatically remove files from Trash after retention period",
          control: (
            <div 
              onClick={() => updateSetting('autoDeleteTrash', !appSettings.autoDeleteTrash)}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: appSettings.autoDeleteTrash ? 'var(--tg-blue)' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', transition: '0.3s' }}
            >
              <div style={{ position: 'absolute', top: '2px', left: appSettings.autoDeleteTrash ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: '0.3s' }} />
            </div>
          )
        },
        { 
          label: "Data Saver Mode", 
          sub: "View compressed images in preview to save data",
          control: (
            <div 
              onClick={() => updateSetting('dataSaverMode', !appSettings.dataSaverMode)}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: appSettings.dataSaverMode ? 'var(--tg-blue)' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', transition: '0.3s' }}
            >
              <div style={{ position: 'absolute', top: '2px', left: appSettings.dataSaverMode ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: '0.3s' }} />
            </div>
          )
        },
        { 
          label: "Trash Retention (Days)", 
          sub: "Files will be permanently deleted after this many days",
          control: (
            <input 
              type="number" 
              value={appSettings.trashRetentionDays} 
              onChange={(e) => updateSetting('trashRetentionDays', parseInt(e.target.value))}
              style={{ width: '60px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '6px', textAlign: 'center' }} 
            />
          )
        },
        { 
          label: "Thumbnail Quality", 
          sub: "Lower quality saves server disk space and bandwidth",
          control: (
            <select 
              value={appSettings.thumbnailQuality} 
              onChange={(e) => updateSetting('thumbnailQuality', e.target.value)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '6px', outline: 'none' }}
            >
              <option value="low">Low (Fast)</option>
              <option value="high">High (Premium)</option>
            </select>
          )
        }
      ]
    },
    {
      title: "Storage & Performance",
      icon: <HardDrive size={20} color="#FACC15" />,
      items: [
        { label: "Total Space Used", value: stats.size, sub: `${stats.count} files across all nodes` },
        { label: "Synchronize & Recalculate", 
          action: handleRefreshStats, 
          actionLabel: isRefreshing ? "Refreshing..." : "Sync Now", 
          sub: "Recount files and recalculate total storage size" 
        },
        { label: "Archive All Channels", 
          action: handleArchiveAll, 
          actionLabel: archiveStatus === 'loading' ? 'Archiving...' : archiveStatus === 'done' ? 'Archived' : 'Archive Now', 
          sub: "Move all TeleNest channels to your Telegram Archive" 
        },
        { label: "Thumbnail Optimization", action: handleClearCache, actionLabel: isClearing ? "Optimizing..." : "Fix Thumbnails", sub: "Clear local thumbnails and force re-sync" },
      ]
    },
    {
      title: "Privacy & Security",
      icon: <Shield size={20} color="#10b981" />,
      items: [
        { label: "Wipe All Data", 
          action: handleWipeData, 
          actionLabel: "Wipe Data", 
          sub: "Permanently DELETE all channels and files from Telegram" 
        },
        { label: "Concurrent Uploads", 
          sub: "Max number of files allowed to upload simultaneously",
          control: (
            <input 
              type="number" 
              value={appSettings.maxConcurrentUploads} 
              onChange={(e) => updateSetting('maxConcurrentUploads', parseInt(e.target.value))}
              style={{ width: '60px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#fff', padding: '4px 8px', borderRadius: '6px', textAlign: 'center' }} 
            />
          )
        }
      ]
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '100px' }}
    >
      <header style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.8rem', fontWeight: 800, marginBottom: '8px' }} className="text-gradient">Settings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Manage your account, storage, and application preferences.</p>
      </header>

      {/* Profile Header Card */}
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '32px', border: '1px solid var(--tg-blue)' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--tg-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 800, color: '#fff', border: '4px solid rgba(255,255,255,0.1)' }}>
            {user?.firstName?.charAt(0) || 'U'}
          </div>
          <div style={{ position: 'absolute', bottom: '0', right: '0', background: '#10b981', width: '24px', height: '24px', borderRadius: '50%', border: '3px solid #111' }}></div>
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '4px' }}>{user?.firstName || 'User'}</h2>
          <p style={{ color: 'var(--tg-blue)', fontWeight: 600, fontSize: '1rem', marginBottom: '12px' }}>{user?.username ? `@${user.username}` : 'Private Account'}</p>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={14} color="#10b981" /> Verified Session
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} color="var(--tg-blue)" /> ID: {user?.id}
            </div>
          </div>
        </div>
        <button onClick={handleLogout} className="btn-icon" style={{ height: '50px', width: '50px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <LogOut size={24} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {sections.map((section, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px' }}>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>{section.icon}</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{section.title}</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
              {section.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>{item.label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', maxWidth: '80%' }}>{item.sub}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {item.value && <span style={{ fontSize: '0.85rem', color: 'var(--tg-blue)', fontWeight: 700 }}>{item.value}</span>}
                    {item.control && item.control}
                    {item.action && (
                        <button 
                            onClick={item.action} 
                            disabled={isClearing || isRefreshing}
                            className="btn-icon" 
                            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem', background: 'rgba(42, 171, 238, 0.1)', color: 'var(--tg-blue)', border: '1px solid var(--tg-blue)' }}
                        >
                            {item.actionLabel}
                        </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ marginTop: '40px', textAlign: 'center', opacity: 0.3 }}>
        <p style={{ fontSize: '0.8rem' }}>TeleNest Cloud Storage v2.4.0 • Built with Security in Mind</p>
      </div>

      {/* Wipe Data Confirmation Modal */}
      {showWipeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-panel"
            style={{ maxWidth: '500px', padding: '40px', textAlign: 'center', border: '1px solid #ef4444' }}
          >
            <div style={{ width: '80px', height: '80px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Trash2 size={40} color="#ef4444" />
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '16px', color: '#ef4444' }}>Nuclear Option</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '32px' }}>
              This will permanently <strong>DELETE</strong> all your files and channels from Telegram. 
              This action <strong>CANNOT BE UNDONE</strong>. Are you absolutely sure?
            </p>
            <div style={{ display: 'flex', gap: '16px' }}>
              <button 
                onClick={() => setShowWipeModal(false)}
                className="btn-icon"
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '16px', borderRadius: '12px', width: 'auto' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmWipe}
                className="btn-icon"
                style={{ flex: 1, background: '#ef4444', color: '#fff', padding: '16px', borderRadius: '12px', width: 'auto', fontWeight: 700 }}
              >
                Wipe Everything
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          style={{
            position: 'fixed',
            bottom: '40px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 600
          }}
        >
          {toast.type === 'error' ? <X size={20} /> : <Check size={20} />}
          {toast.message}
        </motion.div>
      )}
    </motion.div>
  );
};

export default SettingsView;
