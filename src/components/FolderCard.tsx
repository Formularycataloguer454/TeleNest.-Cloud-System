import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Image, Video, FileText, Music, Download, Share2, Star, Lock, Trash2, MoreVertical, Edit2, X } from 'lucide-react';

interface FolderCardProps {
  name: string;
  itemCount: number;
  size: string;
  color: string;
  index: number;
  type?: 'system' | 'custom';
  progress?: number;
  onDelete?: () => void;
  onRename?: () => void;
}

const getIcon = (name: string, color: string) => {
  const props = { size: 32, color };
  switch (name) {
    case 'Images': return <Image {...props} />;
    case 'Videos': return <Video {...props} />;
    case 'Documents': return <FileText {...props} />;
    case 'Audio': return <Music {...props} />;
    case 'Downloads': return <Download {...props} />;
    case 'Shared': return <Share2 {...props} />;
    case 'Favorites': return <Star {...props} />;
    case 'Private Vault': return <Lock {...props} />;
    case 'Trash': return <Trash2 {...props} />;
    default: return <Folder {...props} />;
  }
};

const FolderCard: React.FC<FolderCardProps> = ({ name, itemCount, size, color, index, type = 'system', progress = 0, onDelete, onRename }) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <motion.div
      className="glass-panel folder-card"
      style={{ padding: '20px', cursor: 'pointer', position: 'relative', overflow: 'visible' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      whileHover={{ y: -5, background: 'rgba(255,255,255,0.06)' }}
    >
      {type === 'custom' && (
        <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 20 }}>
          <button 
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="btn-icon" 
            style={{ width: '28px', height: '28px', background: 'transparent', border: 'none', color: 'var(--text-secondary)' }}
          >
            <MoreVertical size={18} />
          </button>
          
          <AnimatePresence>
            {showMenu && (
              <>
                <div 
                  style={{ position: 'fixed', inset: 0, zIndex: -1 }} 
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} 
                />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -10 }}
                  style={{ 
                    position: 'absolute', top: '32px', right: '0', background: '#111', 
                    border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '8px',
                    width: '140px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 100
                  }}
                >
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowMenu(false); onRename?.(); }}
                    style={{ 
                      width: '100%', padding: '10px', display: 'flex', alignItems: 'center', gap: '10px',
                      background: 'transparent', border: 'none', color: '#fff', borderRadius: '8px',
                      cursor: 'pointer', fontSize: '0.9rem'
                    }}
                    className="menu-item-hover"
                  >
                    <Edit2 size={14} color="var(--tg-blue)" /> Rename
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete?.(); }}
                    style={{ 
                      width: '100%', padding: '10px', display: 'flex', alignItems: 'center', gap: '10px',
                      background: 'transparent', border: 'none', color: '#ef4444', borderRadius: '8px',
                      cursor: 'pointer', fontSize: '0.9rem'
                    }}
                    className="menu-item-hover"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}

      <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.05, pointerEvents: 'none' }}>
        {getIcon(name, color)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <motion.div 
          style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          whileHover={{ scale: 1.1, rotate: 5 }}
        >
          {getIcon(name, color)}
        </motion.div>
      </div>

      <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', fontWeight: 600, color: '#fff' }}>{name}</h3>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        <span>{size}</span>
      </div>
      
      <div style={{ marginTop: '12px', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
        <motion.div 
          style={{ height: '100%', background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ delay: 0.5 + index * 0.1, duration: 1 }}
        />
      </div>

      <style>{`
        .menu-item-hover:hover {
          background: rgba(255,255,255,0.05) !important;
        }
      `}</style>
    </motion.div>
  );
};

export default FolderCard;
