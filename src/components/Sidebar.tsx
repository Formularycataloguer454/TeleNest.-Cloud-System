import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Cloud, 
  Home, 
  FolderOpen, 
  Star, 
  Share2, 
  Lock, 
  Trash2,
  Settings,
  HardDrive,
  X
} from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeSection, onSectionChange, isOpen, onClose }) => {
  const [user, setUser] = useState<any>(null);
  const [storageStats, setStorageStats] = useState({ size: '0 KB', count: 0, percentage: 2 });

  useEffect(() => {
    fetch('http://localhost:3001/api/auth/status')
      .then(res => res.json())
      .then(data => {
        if (data.authorized) {
          setUser(data.user);
        }
      })
      .catch(err => console.error("Failed to fetch user status", err));
  }, []);

  useEffect(() => {
    fetch('http://localhost:3001/api/workspace/folders')
      .then(res => res.json())
      .then(data => {
        let totalBytes = 0;
        let totalCount = 0;
        Object.keys(data).forEach(k => {
          // Sum up all actual storage channels (System folders + Custom folders)
          // Exclude virtual views like Favorites and Trash
          if (['Images', 'Videos', 'Documents', 'Audio', 'Downloads'].includes(k) || data[k].type === 'custom') {
            totalBytes += data[k].size || 0;
            totalCount += data[k].count || 0;
          }
        });
        
        const formatSize = (bytes: number) => {
          if (bytes === 0) return '0 KB';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        };
        
        // Calculate percentage based on a 2TB "Soft Limit" for the UI
        const limit = 2 * 1024 * 1024 * 1024 * 1024; 
        const percentage = Math.min(100, Math.max(2, (totalBytes / limit) * 100)); // Min 2% for visibility
        
        setStorageStats({ size: formatSize(totalBytes), count: totalCount, percentage });
      })
      .catch(err => console.error("Failed to fetch storage stats", err));
  }, [activeSection]);

  const navGroups = [
    {
      title: 'Cloud Explorer',
      items: [
        { id: 'dashboard', label: 'Overview', icon: Home },
        { id: 'my-files', label: 'Cloud Nodes', icon: FolderOpen },
        { id: 'shared', label: 'Shared Links', icon: Share2 },
      ]
    },
    {
      title: 'Private Space',
      items: [
        { id: 'vault', label: 'Private Vault', icon: Lock, color: 'var(--accent-purple)' },
        { id: 'favorites', label: 'Favorites', icon: Star, color: '#FACC15' },
      ]
    }
  ];

  const [isWindowMobile, setIsWindowMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsWindowMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <motion.div 
      className={`sidebar ${isOpen ? 'open' : ''}`}
      initial={isWindowMobile ? { x: 0 } : { x: 0 }}
      animate={isWindowMobile ? { x: isOpen ? 280 : 0 } : { x: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      {/* Brand Section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '10px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <motion.div 
            whileHover={{ rotate: 10, scale: 1.1 }}
            style={{ padding: '2px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
            <img src="/logo.png" alt="TeleNest Logo" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
            </motion.div>
            <div>
                <h2 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 900, color: '#fff', letterSpacing: '-1px', fontFamily: 'var(--font-brand)' }}>TeleNest<span style={{ color: 'var(--tg-blue)' }}>.</span></h2>
                <div style={{ fontSize: '0.6rem', color: 'var(--tg-blue)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'var(--font-brand)', opacity: 0.8 }}>Cloud System</div>
            </div>
        </div>
        
        {onClose && (
            <button 
                onClick={onClose} 
                className="mobile-only" 
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
            >
                <X size={20} />
            </button>
        )}
      </div>

      {/* Navigation Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', flex: 1, overflowY: 'auto', paddingRight: '4px' }} className="custom-scroll">
        {navGroups.map((group, gIdx) => (
            <div key={gIdx}>
                <div style={{ padding: '0 16px', fontSize: '0.75rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>{group.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {group.items.map((item) => (
                        <button 
                            key={item.id}
                            onClick={() => onSectionChange(item.id)}
                            style={{ 
                                background: activeSection === item.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                                width: '100%', textAlign: 'left', cursor: 'pointer',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '14px',
                                color: activeSection === item.id ? '#fff' : 'var(--text-secondary)',
                                border: 'none',
                                position: 'relative',
                                transition: '0.2s all'
                            }}
                            className={`nav-item-btn ${activeSection === item.id ? 'active' : ''}`}
                        >
                            {activeSection === item.id && (
                                <motion.div layoutId="active-pill" style={{ position: 'absolute', left: 0, width: '4px', height: '24px', background: 'var(--tg-blue)', borderRadius: '0 4px 4px 0', boxShadow: '0 0 15px var(--tg-blue)' }} />
                            )}
                            <item.icon size={20} color={activeSection === item.id ? 'var(--tg-blue)' : (item.color || 'var(--text-secondary)')} />
                            <span style={{ fontSize: '1rem', fontWeight: activeSection === item.id ? 700 : 500 }}>{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        ))}
      </div>

      {/* Bottom Section: Storage & System */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
        {/* Storage Stats */}
        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HardDrive size={16} color="var(--tg-blue)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Infinite Storage</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 800 }}>{storageStats.size}</span>
          </div>
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${storageStats.percentage}%` }} style={{ height: '100%', background: 'linear-gradient(90deg, var(--tg-blue), #3b82f6)', boxShadow: '0 0 10px rgba(42, 171, 238, 0.4)' }} />
          </div>
        </div>

        {/* Telegram & Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
                onClick={() => onSectionChange('telegram')}
                style={{ 
                    background: activeSection === 'telegram' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '12px 16px', borderRadius: '12px',
                    display: 'flex', alignItems: 'center', gap: '14px',
                    color: activeSection === 'telegram' ? '#10b981' : 'var(--text-secondary)',
                    border: 'none', transition: '0.2s'
                }}
            >
                <Cloud size={20} color={activeSection === 'telegram' ? '#10b981' : 'var(--text-secondary)'} />
                <span style={{ fontSize: '0.95rem', fontWeight: activeSection === 'telegram' ? 700 : 500 }}>System Status</span>
            </button>

            <button 
                onClick={() => onSectionChange('settings')}
                style={{ 
                    background: activeSection === 'settings' ? 'var(--tg-blue)' : 'rgba(255,255,255,0.05)',
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '14px 16px', borderRadius: '16px',
                    display: 'flex', alignItems: 'center', gap: '14px',
                    color: activeSection === 'settings' ? '#000' : '#fff',
                    border: 'none', transition: '0.3s all',
                    boxShadow: activeSection === 'settings' ? '0 10px 20px rgba(42, 171, 238, 0.3)' : 'none'
                }}
            >
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: activeSection === 'settings' ? 'rgba(0,0,0,0.2)' : 'rgba(42, 171, 238, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Settings size={20} color={activeSection === 'settings' ? '#000' : 'var(--tg-blue)'} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>Control Center</span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>Settings & Security</span>
                </div>
            </button>
        </div>

        {/* Developer Credit */}
        <div style={{ marginTop: '24px', padding: '0 16px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
            <a 
                href="https://damindur.com" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    color: 'rgba(255,255,255,0.3)', 
                    fontSize: '0.75rem', 
                    textDecoration: 'none',
                    transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.color = 'var(--tg-blue)';
                    e.currentTarget.style.transform = 'translateX(5px)';
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.color = 'rgba(255,255,255,0.3)';
                    e.currentTarget.style.transform = 'translateX(0px)';
                }}
            >
                <div style={{ width: '20px', height: '20px', borderRadius: '5px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800 }}>DR</div>
                <span>Developed by <span style={{ fontWeight: 700 }}>DaminduR</span></span>
            </a>
        </div>
      </div>
    </motion.div>
  );
};

export default Sidebar;
