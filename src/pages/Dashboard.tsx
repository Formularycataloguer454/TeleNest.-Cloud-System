import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Plus, Bell, CheckCircle, 
  ArrowLeft, Download, Grid, List as ListIcon, 
  Image as ImageIcon, Video, Headphones, FileText, Trash2, Copy, 
  Move, CheckSquare, Square, X, FolderPlus, Folder, Eye, Star, RefreshCw, AlertCircle, Share2, Lock, ShieldCheck, Menu
} from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import FolderCard from '../components/FolderCard';
import SettingsView from '../components/SettingsView';
import TelegramManager from '../components/TelegramManager';
import { API_URL, API_BASE_URL } from '../config';



const folderColors: Record<string, string> = {
  'Images': '#FACC15',
  'Videos': '#FACC15',
  'Documents': '#FACC15',
  'Audio': '#FACC15',
  'Downloads': '#FACC15',
  'Favorites': '#fbbf24',
  'Trash': '#6b7280'
};

const getFileIcon = (type: string, color: string) => {
  if (!type) return <FileText size={24} color={color} />;
  if (type.includes('Photo')) return <ImageIcon size={24} color={color} />;
  if (type.includes('Video') || (type.includes('Document') && type.toLowerCase().includes('video'))) return <Video size={24} color={color} />;
  if (type.includes('Audio')) return <Headphones size={24} color={color} />;
  return <FileText size={24} color={color} />;
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 KB';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const truncateFileName = (name: string, id: string | number, maxLength: number = 24) => {
  if (!name) return "";
  const idStr = id ? ` #${id}` : "";
  if (name.length + idStr.length <= maxLength) return name + idStr;
  
  const extIndex = name.lastIndexOf('.');
  const ext = extIndex !== -1 ? name.slice(extIndex) : '';
  const baseName = extIndex !== -1 ? name.slice(0, extIndex) : name;
  
  const availableLength = maxLength - ext.length - idStr.length - 3; // 3 for "..."
  if (availableLength <= 0) return baseName.slice(0, 5) + '...' + ext + idStr;
  
  return baseName.slice(0, availableLength) + '...' + ext + idStr;
};

const ThumbnailImage = ({ src, fallback }: { src: string, fallback: React.ReactNode }) => {
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    setRetryCount(0);
    setError(false);
  }, [src]);

  const handleError = () => {
    if (retryCount < 2) {
      setTimeout(() => setRetryCount(prev => prev + 1), 3000);
    } else {
      setError(true);
    }
  };

  const imgSrc = retryCount > 0 ? `${src}?r=${retryCount}` : src;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ 
        position: 'absolute', inset: 0, 
        display: 'flex', alignItems: 'center', justifyContent: 'center', 
        pointerEvents: 'none'
      }}>
        {fallback}
      </div>

      {!error && (
        <img 
          src={imgSrc}
          alt="" 
          onError={handleError}
          style={{ 
            width: '100%', height: '100%', objectFit: 'cover',
            position: 'relative', zIndex: 1,
            // Add a subtle background to hide the fallback if the image has transparent parts (unlikely for JPEG but just in case)
            backgroundColor: '#111' 
          }} 
        />
      )}
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isUploading, setIsUploading] = useState(false);
  const [, setUploadProgress] = useState(0);
  const [folders, setFolders] = useState<any[]>([]);
  const [, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [folderFiles, setFolderFiles] = useState<any[]>([]);
  const [fetchingFiles, setFetchingFiles] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'move' | 'copy' | null>(null);
  const [, setIsProcessing] = useState(false);
  
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [renamedFolderName, setRenamedFolderName] = useState('');

  const [previewFile, setPreviewFile] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await axios.get(`${API_URL}/auth/status`);
        if (!res.data.authorized) {
          navigate('/');
        }
      } catch (err) {
        navigate('/');
      }
    };
    checkAuth();

    const pollEvents = async () => {
        try {
            const res = await axios.get(`${API_URL}/workspace/events`);
            if (res.data && res.data.length > 0) {
                res.data.forEach((ev: any) => {
                    addNotification(ev.title, ev.message, 'info');
                });
            }
        } catch (err) { console.error('Polling failed', err); }
    };
    const interval = setInterval(pollEvents, 10000);
    return () => clearInterval(interval);
  }, [navigate]);


  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sharedFiles, setSharedFiles] = useState<any[]>([]);
  const [folderShares, setFolderShares] = useState<any[]>([]);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const addNotification = (title: string, message: string, type: 'info'|'success'|'warning' = 'info') => {
    const newNotif = { id: Date.now(), title, message, type, time: new Date().toLocaleTimeString(), read: false };
    setNotifications(prev => [newNotif, ...prev].slice(0, 10)); // Keep last 10
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim()) {
        setIsSearching(true);
        axios.get(`${API_URL}/workspace/search?q=${searchQuery}`)
             .then(res => {
                setSearchResults(res.data);
                setIsSearching(false);
             })
             .catch(() => setIsSearching(false));
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [isVaultSetupRequired, setIsVaultSetupRequired] = useState(false);
  const [vaultPasswordInput, setVaultPasswordInput] = useState('');
  const [vaultConfirmPassword, setVaultConfirmPassword] = useState('');

  const checkVaultStatus = async () => {
    try {
        const res = await axios.get(`${API_URL}/vault/status`);
        setIsVaultSetupRequired(!res.data.isSetup);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { checkVaultStatus(); }, []);

  const handleUnlockVault = async () => {
    try {
        const res = await axios.post(`${API_URL}/vault/unlock`, { password: vaultPasswordInput });
        if (res.data.success) {
            setIsVaultUnlocked(true);
            setActiveFolder('Private Vault');
            fetchFiles('Private Vault');
            addNotification('Vault Unlocked', 'You have successfully accessed your encrypted storage.', 'success');
        }
    } catch (err) {
        showToast('Incorrect password', 'error');
        setVaultPasswordInput('');
    }
  };

  const handleSetupVault = async () => {
    if (!vaultPasswordInput || vaultPasswordInput.length < 4) {
        return showToast('Password must be at least 4 characters', 'error');
    }
    if (vaultPasswordInput !== vaultConfirmPassword) {
        return showToast('Passwords do not match', 'error');
    }
    try {
        await axios.post(`${API_URL}/vault/setup`, { password: vaultPasswordInput });
        setIsVaultSetupRequired(false);
        setIsVaultUnlocked(true);
        setActiveFolder('Private Vault');
        fetchFiles('Private Vault');
        addNotification('Vault Setup Complete', 'Your private vault is now protected.', 'success');
    } catch (err) { showToast('Setup failed', 'error'); }
  };

  const [toast, setToast] = useState<{message: string, type: 'error'|'success'} | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{message: string, onConfirm: () => void} | null>(null);

  const showToast = (message: string, type: 'error'|'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchShares = async () => {
    setFetchingFiles(true);
    try {
        const [fileRes, folderRes] = await Promise.all([
            axios.get(`${API_URL}/workspace/shares`),
            axios.get(`${API_URL}/workspace/folder-shares`)
        ]);
        setSharedFiles(fileRes.data.map((s: any) => ({ ...s, id: s.messageId, type: 'file' })));
        setFolderShares(folderRes.data.map((s: any) => ({ ...s, type: 'folder' })));
    } catch (err) { console.error(err); }
    setFetchingFiles(false);
  };



  const handleShareFolder = async (folderName: string) => {
    try {
        const res = await axios.post(`${API_URL}/workspace/folders/share`, { folderName });
        const shareUrl = `${API_BASE_URL}/s/folder/${res.data.share.hash}`;
        navigator.clipboard.writeText(shareUrl);
        showToast('Folder share link copied!', 'success');
        addNotification('Node Shared', `Gallery link for "${folderName}" created successfully.`, 'info');
    } catch (err) {
        showToast('Failed to share folder', 'error');
    }
  };

  const handleStopShare = async (hash: string) => {
    try {
        await axios.delete(`${API_URL}/workspace/shares/${hash}`);
        fetchShares();
        showToast('Sharing stopped', 'success');
    } catch (err) {
        showToast('Failed to stop sharing', 'error');
    }
  };

  const handleStopFolderShare = async (hash: string) => {
    try {
        await axios.delete(`${API_URL}/workspace/folder-shares/${hash}`);
        fetchShares();
        showToast('Folder sharing stopped', 'success');
    } catch (err) {
        showToast('Failed to stop folder sharing', 'error');
    }
  };

  const fetchFolders = () => {
    axios.get(`${API_URL}/workspace/folders`)
      .then(res => {
        const data = res.data;
        const folderList = Object.keys(data).map(name => ({
          name,
          itemCount: data[name].count || 0,
          size: formatSize(data[name].size || 0),
          color: folderColors[name] || '#FACC15',
          type: data[name].type || 'system'
        }));
        setFolders(folderList);
        setLoading(false);
      })
      .catch(() => {});
  };

  const fetchFiles = (folderName: string) => {
    setFetchingFiles(true);
    setSelectedFiles([]);
    
    // 1. Initial fetch from current state
    axios.get(`${API_URL}/workspace/files/${folderName}`)
      .then(res => {
        setFolderFiles(res.data);
        setFetchingFiles(false);
        
        // 2. Trigger silent sync in background (updates stats and generates missing thumbs)
        axios.post(`${API_URL}/workspace/sync-folder`, { folderName })
          .then(() => {
            fetchFolders(); // Update sidebar stats
            // 3. Re-fetch files to ensure we have the absolute latest
            axios.get(`${API_URL}/workspace/files/${folderName}`)
              .then(res2 => setFolderFiles(res2.data))
              .catch(() => {});
          })
          .catch(() => {});
      })
      .catch(() => setFetchingFiles(false));
  };

  useEffect(() => { fetchFolders(); }, []);

  const [, setUploadStats] = useState<{ total: number, done: number }>({ total: 0, done: 0 });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const fileList = Array.from(files);
    setUploadStats({ total: fileList.length, done: 0 });
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Fetch settings to respect maxConcurrentUploads
      const settingsRes = await axios.get(`${API_URL}/settings`);
      const maxConcurrent = settingsRes.data.maxConcurrentUploads || 3;

      const uploadFile = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folderName', activeFolder || 'auto');
        
        await axios.post(`${API_URL}/workspace/upload`, formData, {
          onUploadProgress: (_p) => {
             // For multiple files, individual progress is harder to show in one bar, 
             // so we'll show "Files Done / Total" and maybe an average progress.
          }
        });
        setUploadStats(prev => ({ ...prev, done: prev.done + 1 }));
      };

      // Simple queue for parallel uploads
      for (let i = 0; i < fileList.length; i += maxConcurrent) {
        const chunk = fileList.slice(i, i + maxConcurrent);
        await Promise.all(chunk.map(f => uploadFile(f)));
        setUploadProgress(Math.round(((i + chunk.length) / fileList.length) * 100));
      }

      fetchFolders(); if (activeFolder) fetchFiles(activeFolder);
      showToast(`${fileList.length} files uploaded successfully`, 'success');
      addNotification('Upload Complete', `Successfully synced ${fileList.length} files to your cloud.`, 'success');
    } catch (error) { 
      showToast("Failed to upload some files", 'error'); 
      addNotification('Upload Failed', 'Some files could not be synced. Please check your connection.', 'warning');
    } finally { 
      setIsUploading(false); 
      setUploadProgress(0); 
      setUploadStats({ total: 0, done: 0 });
      if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
    }
  };

  const handleDownload = async (file: any) => {
    try {
      const channelId = file.channelId;
      const source = file.sourceFolder || activeFolder;
      const response = await axios.get(`${API_URL}/workspace/download/${activeFolder}/${file.id}?source=${source}&channelId=${channelId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click(); link.remove();
    } catch (error) { showToast("Download failed", 'error'); }
  };

  const handleShareFile = async (file: any) => {
    try {
      const res = await axios.post(`${API_URL}/workspace/files/share`, {
        channelId: file.channelId,
        messageId: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType
      });
      if (res.data.success) {
        const url = `${API_BASE_URL}/s/${res.data.share.hash}`;
        navigator.clipboard.writeText(url);
        showToast('Share link copied to clipboard!', 'success');
      }
    } catch (err) {
      showToast('Failed to generate share link', 'error');
    }
  };

  const handleToggleStar = async (file: any) => {
    try {
      await axios.post(`${API_URL}/workspace/files/star`, {
        channelId: file.channelId, 
        messageId: file.id, 
        name: file.name, 
        size: file.size, 
        mimeType: file.mimeType, 
        date: file.date,
        type: file.type,
        sourceFolder: file.sourceFolder || activeFolder
      });
      if (activeFolder) fetchFiles(activeFolder);
    } catch (err) { showToast("Failed to star file", 'error'); }
  };

  const handleDeleteFiles = () => {
    setConfirmDialog({
      message: activeFolder === 'Trash' ? 'Are you sure you want to permanently delete the selected files?' : 'Move selected files to Trash?',
      onConfirm: async () => {
        setConfirmDialog(null);
        setIsProcessing(true);
        try {
            if (activeFolder === 'Trash') {
                for (const file of selectedFiles) {
                    await axios.post(`${API_URL}/workspace/files/permanent-delete`, { channelId: file.channelId, messageId: file.id });
                }
            } else {
                for (const file of selectedFiles) {
                    await axios.post(`${API_URL}/workspace/files/delete`, { folderName: activeFolder, source: file.sourceFolder, channelId: file.channelId, messageIds: [file.id] });
                }
            }
            fetchFiles(activeFolder!); fetchFolders(); setSelectedFiles([]);
            showToast('Files deleted successfully', 'success');
        } catch (err) { showToast("Failed to delete files", 'error'); } finally { setIsProcessing(false); }
      }
    });
  };

  const handleRestoreFiles = async () => {
    setIsProcessing(true);
    try {
        for (const file of selectedFiles) {
            await axios.post(`${API_URL}/workspace/files/restore`, { channelId: file.channelId, messageId: file.id });
        }
        fetchFiles('Trash'); fetchFolders(); setSelectedFiles([]);
        showToast('Files restored successfully', 'success');
    } catch (err) { showToast("Failed to restore files", 'error'); } finally { setIsProcessing(false); }
  };

  const handleMoveCopy = async (toFolder: string) => {
    if (!activeFolder || selectedFiles.length === 0 || !actionType) return;
    setIsProcessing(true);
    try {
      for (const file of selectedFiles) {
          await axios.post(`${API_URL}/workspace/files/move-copy`, {
            fromFolder: activeFolder, fromSource: file.sourceFolder, fromChannel: file.channelId, toFolder, messageIds: [file.id], mode: actionType
          });
      }
      setIsActionModalOpen(false); setActionType(null); fetchFiles(activeFolder); fetchFolders(); setSelectedFiles([]);
      showToast(`Files ${actionType === 'move' ? 'moved' : 'copied'} successfully`, 'success');
    } catch (error) { showToast(`Failed to ${actionType} files`, 'error'); } finally { setIsProcessing(false); }
  };

  const getPreviewUrl = (file: any) => {
    if (!file) return '';
    const source = file.sourceFolder || activeFolder;
    // We need to fetch settings or use a cached version. 
    // Since this is called frequently, let's just add the param if it exists in a state we can access.
    // For now, I'll fetch settings on mount or use a global-ish state if available.
    // Actually, I can just read it from the localStorage or a quick check.
    const isDataSaver = localStorage.getItem('telenest_datasaver') === 'true';
    return `${API_URL}/workspace/view/${activeFolder}/${file.id}?source=${source}&channelId=${file.channelId}${isDataSaver ? '&dataSaver=true' : ''}`;
  };

  const openPreview = (file: any) => { setPreviewFile(file); setIsPreviewLoading(true); };

  const renderPreviewContent = () => {
    if (!previewFile) return null;
    const url = getPreviewUrl(previewFile);
    const mime = previewFile.mimeType || '';

    if (mime.startsWith('image/')) return <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '12px' }} onLoad={() => setIsPreviewLoading(false)} />;
    
    if (mime.startsWith('video/')) return <video src={url} controls style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '12px' }} onLoadedData={(e) => { (e.target as any).volume = 1; (e.target as any).muted = false; setIsPreviewLoading(false); }} />;
    
    if (mime.startsWith('audio/') || previewFile.name.toLowerCase().endsWith('.mp3') || previewFile.name.toLowerCase().endsWith('.ogg') || previewFile.name.toLowerCase().endsWith('.wav')) {
        return (
            <div style={{ width: '100%', maxWidth: '500px', padding: '40px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '32px', textAlign: 'center' }}>
                <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 32px' }}><div className="pulse-animation" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--tg-blue)', opacity: 0.1 }} /><div style={{ position: 'absolute', inset: '10px', borderRadius: '50%', background: 'rgba(250, 204, 21, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--tg-blue)' }}><Headphones size={48} color="var(--tg-blue)" /></div></div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>{previewFile.name}</h3>
                <audio src={url} controls style={{ width: '100%' }} onLoadedData={(e) => { (e.target as any).volume = 1; (e.target as any).muted = false; setIsPreviewLoading(false); (e.target as any).play().catch(()=>{}); }} />
                <div style={{ marginTop: '20px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>Click play to start sound</div>
            </div>
        );
    }
    if (mime === 'application/pdf') return <iframe src={url} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: '12px' }} onLoad={() => setIsPreviewLoading(false)} />;
    
    return (
        <div style={{ textAlign: 'center', padding: '40px' }}><FileText size={64} style={{ opacity: 0.2, marginBottom: '24px' }} /><h3>Preview not available</h3><button onClick={() => handleDownload(previewFile)} className="btn-primary" style={{ marginTop: '24px' }}><Download size={20} /> Download</button></div>
    );
  };

  const renderContent = () => {
    if (searchQuery) {
        return (
          <motion.section key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>Search Results</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Found {searchResults.length} matches for "{searchQuery}"</p>
                </div>
                {searchResults.length > 0 && (
                    <button 
                        onClick={() => setSelectedFiles(selectedFiles.length === searchResults.length ? [] : [...searchResults])} 
                        className="btn-icon" 
                        style={{ padding: '8px 16px', width: 'auto', gap: '8px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)' }}
                    >
                        {selectedFiles.length === searchResults.length ? <X size={16} /> : <CheckSquare size={16} />}
                        {selectedFiles.length === searchResults.length ? 'Deselect All' : 'Select All Results'}
                    </button>
                )}
            </div>
            {isSearching && searchResults.length === 0 ? <p>Searching nodes...</p> : (
                <div className={viewMode === 'grid' ? 'grid-files-view' : 'list-files-view'} style={{ display: viewMode === 'grid' ? 'grid' : 'flex', flexDirection: 'column', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                    {searchResults.length === 0 ? (
                        <div style={{ padding: '100px 0', textAlign: 'center', opacity: 0.3, width: '100%' }}><h3>No results found</h3><p>Try a different keyword.</p></div>
                    ) : searchResults.map((file) => {
                        const isSelected = !!selectedFiles.find(f => f.id === file.id);
                        return (
                          <motion.div key={`${file.channelId}_${file.id}`} className={`glass-panel file-card ${isSelected ? 'selected' : ''}`} style={{ padding: viewMode === 'grid' ? '0' : '12px 20px', display: 'flex', flexDirection: viewMode === 'grid' ? 'column' : 'row', alignItems: 'center', gap: '16px', border: isSelected ? '1px solid var(--tg-blue)' : '1px solid var(--glass-border)', overflow: 'hidden' }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                            {viewMode === 'grid' && (
                              <div className="file-card-preview" onClick={() => openPreview(file)} style={{ width: '100%', height: '140px', background: 'rgba(0,0,0,0.4)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                 <ThumbnailImage 
                                    src={`${API_URL}/workspace/thumbnail/${file.channelId}/${file.id}`}
                                    fallback={getFileIcon(file.type, '#FACC15')}
                                 />
                                 <div className="hover-play" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', opacity: 0 }}><Eye size={32} color="#fff" /></div>
                              </div>
                            )}
                            <div style={{ padding: viewMode === 'grid' ? '12px' : '0', display: 'flex', flexDirection: viewMode === 'grid' ? 'column' : 'row', alignItems: 'center', gap: '16px', width: '100%' }}>
                              <div style={{ flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => openPreview(file)}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.name}>
                                  {truncateFileName(file.name, file.id)}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatSize(file.size)} • in {file.sourceFolder}</div>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => openPreview(file)} className="btn-icon"><Eye size={16} /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleShareFile(file); }} className="btn-icon" style={{ color: 'var(--tg-blue)' }}><Share2 size={16} /></button>
                                <button onClick={() => handleDownload(file)} className="btn-icon"><Download size={16} /></button>
                              </div>

                            </div>
                          </motion.div>
                        );
                    })}
                </div>
            )}
          </motion.section>
        );
    }
    if (activeFolder) {
      return (
        <motion.section key="folder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <h2 style={{ fontSize: '2.2rem', fontWeight: 700, margin: 0, color: 'var(--tg-blue)' }}>{activeFolder}</h2>
                {activeFolder !== 'Private Vault' && <button onClick={() => handleShareFolder(activeFolder)} className="btn-icon" style={{ padding: '6px 12px', width: 'auto', gap: '8px', fontSize: '0.8rem', background: 'rgba(42, 171, 238, 0.1)', color: 'var(--tg-blue)', border: '1px solid var(--tg-blue)' }}><Share2 size={14} /> Share Folder</button>}
              </div>
              <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>{folderFiles.length} items found</p>
            </div>
            {folderFiles.length > 0 && (
                <button 
                    onClick={() => setSelectedFiles(selectedFiles.length === folderFiles.length ? [] : [...folderFiles])} 
                    className="btn-icon" 
                    style={{ padding: '8px 16px', width: 'auto', gap: '8px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)' }}
                >
                    {selectedFiles.length === folderFiles.length ? <X size={16} /> : <CheckSquare size={16} />}
                    {selectedFiles.length === folderFiles.length ? 'Deselect All' : 'Select All'}
                </button>
            )}
            <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '12px' }}>
              <button onClick={() => setViewMode('grid')} style={{ padding: '8px', borderRadius: '8px', background: viewMode === 'grid' ? 'var(--tg-blue)' : 'transparent' }}><Grid size={18} color={viewMode === 'grid' ? '#000' : 'var(--text-secondary)'} /></button>
              <button onClick={() => setViewMode('list')} style={{ padding: '8px', borderRadius: '8px', background: viewMode === 'list' ? 'var(--tg-blue)' : 'transparent' }}><ListIcon size={18} color={viewMode === 'list' ? '#000' : 'var(--text-secondary)'} /></button>
            </div>
          </div>
          {fetchingFiles ? <p>Scanning encrypted nodes...</p> : (
            <div className={viewMode === 'grid' ? 'grid-files-view' : 'list-files-view'} style={{ display: viewMode === 'grid' ? 'grid' : 'flex', flexDirection: 'column', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {folderFiles.map((file) => {
                const isSelected = !!selectedFiles.find(f => f.id === file.id);
                // const source = file.sourceFolder || activeFolder;
                return (
                  <motion.div key={`${file.channelId}_${file.id}`} className={`glass-panel file-card ${isSelected ? 'selected' : ''}`} style={{ padding: viewMode === 'grid' ? '0' : '12px 20px', display: 'flex', flexDirection: viewMode === 'grid' ? 'column' : 'row', alignItems: 'center', gap: '16px', border: isSelected ? '1px solid var(--tg-blue)' : '1px solid var(--glass-border)', overflow: 'hidden' }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                    {viewMode === 'grid' && (
                      <div className="file-card-preview" onClick={() => openPreview(file)} style={{ width: '100%', height: '140px', background: 'rgba(0,0,0,0.4)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                         <ThumbnailImage 
                            src={`${API_URL}/workspace/thumbnail/${file.channelId}/${file.id}`}
                            fallback={getFileIcon(file.type, '#FACC15')}
                         />
                         <div className="hover-play" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', opacity: 0 }}><Eye size={32} color="#fff" /></div>
                      </div>
                    )}

                    <div style={{ padding: viewMode === 'grid' ? '12px' : '0', display: 'flex', flexDirection: viewMode === 'grid' ? 'column' : 'row', alignItems: 'center', gap: '16px', width: '100%' }}>
                      {/* Selection & Star Buttons for List View */}
                      {viewMode === 'list' && (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <div onClick={() => setSelectedFiles(p => p.find(f => f.id === file.id) ? p.filter(f => f.id !== file.id) : [...p, file])} style={{ cursor: 'pointer', color: isSelected ? 'var(--tg-blue)' : 'rgba(255,255,255,0.2)' }}>{isSelected ? <CheckSquare size={20} /> : <Square size={20} />}</div>
                            <div onClick={() => handleToggleStar(file)} style={{ cursor: 'pointer', color: file.isStarred ? '#FACC15' : 'rgba(255,255,255,0.2)' }}><Star size={18} fill={file.isStarred ? "#FACC15" : "none"} /></div>
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => openPreview(file)}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.name}>
                          {truncateFileName(file.name, file.id)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatSize(file.size)} {file.sourceFolder ? `• in ${file.sourceFolder}` : ''}</div>
                      </div>

                      {/* Action Buttons Row */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {viewMode === 'grid' && (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); handleToggleStar(file); }} className="btn-icon" style={{ background: '#000', border: '1px solid rgba(255,255,255,0.1)', width: '32px', height: '32px' }}>
                                    <Star size={14} fill={file.isStarred ? "#FACC15" : "none"} color={file.isStarred ? "#FACC15" : "#fff"} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setSelectedFiles(p => p.find(f => f.id === file.id) ? p.filter(f => f.id !== file.id) : [...p, file]); }} className="btn-icon" style={{ background: isSelected ? 'var(--tg-blue)' : '#000', border: '1px solid rgba(255,255,255,0.1)', width: '32px', height: '32px' }}>
                                    {isSelected ? <CheckSquare size={14} color="#000" /> : <Square size={14} color="#fff" />}
                                </button>
                            </>
                        )}
                        <button onClick={() => openPreview(file)} className="btn-icon"><Eye size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleShareFile(file); }} className="btn-icon" style={{ color: 'var(--tg-blue)' }}><Share2 size={16} /></button>
                        <button onClick={() => handleDownload(file)} className="btn-icon"><Download size={16} /></button>
                      </div>

                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.section>
      );
    }

    if (activeSection === 'dashboard') {
      return (
        <motion.div key="dash" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '8px' }} className="text-gradient">Node Categories</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Aggregated views of all your files across cloud nodes.</p>
          <div className="grid-folders">
            {folders.filter(f => f.type === 'system' && !['Downloads', 'Trash'].includes(f.name)).map((folder, idx) => (
              <div key={idx} onClick={() => { setActiveFolder(folder.name); fetchFiles(folder.name); }}><FolderCard index={idx} {...folder} /></div>
            ))}
          </div>

          {folders.filter(f => f.type === 'custom').length > 0 && (
            <>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '48px', marginBottom: '24px' }}>Personal Nodes</h2>
                <div className="grid-folders">
                    {folders.filter(f => f.type === 'custom').map((folder, idx) => (
                        <div key={idx} onClick={() => { setActiveFolder(folder.name); fetchFiles(folder.name); }}><FolderCard index={idx + 10} {...folder} /></div>
                    ))}
                </div>
            </>
          )}
        </motion.div>
      );
    }

    if (activeSection === 'my-files') {
      return (
        <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <div><h1 style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: '4px' }}>Personal Nodes</h1><p style={{ color: 'var(--text-secondary)' }}>Manage your custom storage channels.</p></div>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setIsNewFolderModalOpen(true)} className="btn-primary"><FolderPlus size={20} /> New Folder</motion.button>
          </div>
          <div className="grid-folders">
            {folders.filter(f => f.type === 'custom').map((folder, idx) => (
              <div key={idx} onClick={() => { setActiveFolder(folder.name); fetchFiles(folder.name); }}>
                <FolderCard index={idx} {...folder} type="custom" onDelete={(e: any) => { 
                  e?.stopPropagation();
                  setConfirmDialog({
                    message: `Are you sure you want to delete the node "${folder.name}"?`,
                    onConfirm: () => {
                      setConfirmDialog(null);
                      axios.delete(`${API_URL}/workspace/folders/${folder.name}`)
                           .then(() => { fetchFolders(); showToast('Node deleted', 'success'); })
                           .catch(() => showToast('Failed to delete node', 'error'));
                    }
                  });
                }} onRename={(e: any) => { e?.stopPropagation(); setFolderToRename(folder.name); setRenamedFolderName(folder.name); setIsRenameModalOpen(true); }} />
              </div>
            ))}
          </div>
        </motion.div>
      );
    }
    if (activeSection === 'shared') {
      return (
        <motion.div key="shared" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '8px' }} className="text-gradient">Public Shares</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Manage your active public download links. Links are accessible without login.</p>
          </div>
          {fetchingFiles ? <p>Loading active links...</p> : (sharedFiles.length === 0 && folderShares.length === 0) ? (
            <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', opacity: 0.5 }}>
              <Share2 size={64} style={{ marginBottom: '24px' }} />
              <h3>No active shares</h3>
              <p>Select a file or folder and click "Share" to generate a public link.</p>
            </div>
          ) : (
            <div className="list-files-view" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Folder Shares */}
              {folderShares.map((folder) => (
                <div key={folder.hash} className="glass-panel" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '20px', border: '1px solid var(--accent-cyan)' }}>
                  <div style={{ padding: '10px', background: 'rgba(34, 211, 238, 0.1)', borderRadius: '12px' }}><Folder size={24} color="var(--accent-cyan)" /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{folder.folderName} (Entire Node)</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '12px', marginTop: '4px' }}>
                        <span>Public Gallery</span>
                        <span>• Hash: {folder.hash}</span>
                        <span>• Created: {new Date(folder.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => {
                            const url = `${API_BASE_URL}/s/folder/${folder.hash}`;
                            navigator.clipboard.writeText(url);
                            showToast('Folder link copied!', 'success');
                        }} 
                        className="btn-icon" 
                        style={{ background: 'rgba(42, 171, 238, 0.1)', color: 'var(--tg-blue)' }}
                    >
                        <Copy size={18} />
                    </button>
                    <button 
                        onClick={() => handleStopFolderShare(folder.hash)} 
                        className="btn-icon" 
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                    >
                        <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}

              {/* File Shares */}
              {sharedFiles.map((file) => (
                <div key={file.hash} className="glass-panel" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '20px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ padding: '10px', background: 'rgba(250, 204, 21, 0.1)', borderRadius: '12px' }}>{getFileIcon(file.type, '#FACC15')}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{file.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '12px', marginTop: '4px' }}>
                        <span>{formatSize(file.size)}</span>
                        <span>• Hash: {file.hash}</span>
                        <span>• Created: {new Date(file.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => {
                            const url = `${API_BASE_URL}/s/${file.hash}`;
                            navigator.clipboard.writeText(url);
                            showToast('Link copied!', 'success');
                        }} 
                        className="btn-icon" 
                        style={{ background: 'rgba(42, 171, 238, 0.1)', color: 'var(--tg-blue)' }}
                    >
                        <Copy size={18} />
                    </button>
                    <button 
                        onClick={() => handleStopShare(file.hash)} 
                        className="btn-icon" 
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                    >
                        <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      );
    }
    if (activeSection === 'vault') {
      if (isVaultSetupRequired) {
        return (
          <motion.div key="vault-setup" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', maxWidth: '400px', border: '1px solid var(--accent-purple)' }}>
              <div style={{ background: 'rgba(147, 51, 234, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}><ShieldCheck size={40} color="var(--accent-purple)" /></div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '12px' }}>Setup Private Vault</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Create a strong password to protect your most sensitive files.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input 
                    type="password" 
                    placeholder="Create Password" 
                    value={vaultPasswordInput} 
                    onChange={(e) => setVaultPasswordInput(e.target.value)}
                    style={{ width: '100%', padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', textAlign: 'center' }} 
                />
                <input 
                    type="password" 
                    placeholder="Confirm Password" 
                    value={vaultConfirmPassword} 
                    onChange={(e) => setVaultConfirmPassword(e.target.value)}
                    style={{ width: '100%', padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', textAlign: 'center' }} 
                />
              </div>
              <button onClick={handleSetupVault} className="btn-primary" style={{ width: '100%', padding: '16px', marginTop: '24px', background: 'linear-gradient(135deg, var(--accent-purple) 0%, #6d28d9 100%)' }}>Create Vault</button>
            </div>
          </motion.div>
        );
      }
      if (!isVaultUnlocked) {
        return (
          <motion.div key="vault-locked" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', maxWidth: '400px', border: '1px solid var(--tg-blue)' }}>
              <div style={{ background: 'rgba(42, 171, 238, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}><Lock size={40} color="var(--tg-blue)" /></div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '12px' }}>Private Vault</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Enter your vault password to access highly encrypted files.</p>
              <input 
                type="password" 
                placeholder="Enter Password" 
                value={vaultPasswordInput} 
                onChange={(e) => setVaultPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlockVault()}
                style={{ width: '100%', padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', textAlign: 'center', fontSize: '1.2rem', letterSpacing: '4px', marginBottom: '20px' }} 
              />
              <button onClick={handleUnlockVault} className="btn-primary" style={{ width: '100%', padding: '16px' }}>Unlock Vault</button>
            </div>
          </motion.div>
        );
      }
      return (
        <motion.section key="vault-open" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div><h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--tg-blue)' }}>Private Vault</h1><p style={{ color: 'var(--text-secondary)' }}>Your most sensitive files, protected by military-grade encryption.</p></div>
                <button onClick={() => { setIsVaultUnlocked(false); setVaultPasswordInput(''); setActiveSection('dashboard'); }} className="btn-icon" style={{ padding: '10px 20px', width: 'auto', gap: '8px', color: '#ef4444' }}><Lock size={18} /> Lock Now</button>
            </div>
            {/* Same file grid as other folders */}
            {fetchingFiles ? <p>Decrypting vault nodes...</p> : (
                <div className={viewMode === 'grid' ? 'grid-files-view' : 'list-files-view'} style={{ display: viewMode === 'grid' ? 'grid' : 'flex', flexDirection: 'column', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                    {(folderFiles || []).length === 0 ? (
                        <div style={{ padding: '100px 0', textAlign: 'center', opacity: 0.3, width: '100%' }}><h3>Vault is empty</h3><p>Upload sensitive files here.</p></div>
                    ) : (folderFiles || []).map((file) => {
                        const isSelected = !!selectedFiles.find(f => f.id === file.id);
                        return (
                            <motion.div key={file.id} className={`glass-panel file-card ${isSelected ? 'selected' : ''}`} style={{ padding: viewMode === 'grid' ? '0' : '12px 20px', display: 'flex', flexDirection: viewMode === 'grid' ? 'column' : 'row', alignItems: 'center', gap: '16px' }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                                <div onClick={() => openPreview(file)} style={{ flex: 1, cursor: 'pointer' }}>
                                    <div style={{ fontWeight: 600 }}>{file.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatSize(file.size)}</div>
                                </div>
                                <button onClick={() => handleDownload(file)} className="btn-icon"><Download size={16} /></button>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </motion.section>
      );
    }
    if (activeSection === 'settings') {
      return <SettingsView addNotification={addNotification} showConfirm={(msg, cb) => setConfirmDialog({ message: msg, onConfirm: cb })} />;
    }
    if (activeSection === 'telegram') {
      return <TelegramManager showConfirm={(msg, cb) => setConfirmDialog({ message: msg, onConfirm: cb })} showToast={showToast} />;
    }
    return null;
  };

  return (
    <div className="dashboard-layout">
      <Sidebar 
        activeSection={activeSection} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        showInstall={!!deferredPrompt}
        onInstall={handleInstallClick}
        onSectionChange={(s) => { 
        setIsSidebarOpen(false); // Close drawer on mobile selection
        setActiveSection(s); 
        // Lock vault if leaving it
        if (activeSection === 'vault' && s !== 'vault') {
            setIsVaultUnlocked(false);
            setVaultPasswordInput('');
        }

        if (s === 'favorites') {
          setActiveFolder('Favorites');
          fetchFiles('Favorites');
        } else if (s === 'trash') {
          setActiveFolder('Trash');
          fetchFiles('Trash');
        } else if (s === 'shared') {
          setActiveFolder(null);
          fetchShares();
        } else if (s === 'vault') {
          if (isVaultUnlocked) {
            setActiveFolder('Private Vault');
            fetchFiles('Private Vault');
          } else {
            setActiveFolder(null);
          }
        } else {
          setActiveFolder(null); 
        }
      }} />

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
            onClick={() => setIsSidebarOpen(false)}
            className="mobile-only"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 999 }}
        />
      )}
      <div className="main-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <button 
                onClick={() => setIsSidebarOpen(true)} 
                className="btn-icon mobile-only"
                style={{ background: 'var(--tg-blue)', color: '#000', border: 'none' }}
            >
                <Menu size={20} />
            </button>

            {(activeFolder || searchQuery) && <button onClick={() => { setActiveFolder(null); setSearchQuery(''); }} className="btn-icon desktop-only"><ArrowLeft size={20} /></button>}
            {(activeFolder || searchQuery) && <button onClick={() => { setActiveFolder(null); setSearchQuery(''); }} className="btn-icon mobile-only" style={{ width: '32px', height: '32px' }}><ArrowLeft size={16} /></button>}
            
            <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: isSearching ? 'var(--tg-blue)' : 'var(--text-secondary)' }} />
                <input 
                    type="text" 
                    placeholder="Search across all nodes..." 
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    style={{ width: '100%', padding: '14px 16px 14px 48px', borderRadius: '16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: '#fff' }} 
                />
                {isSearching && <div className="spinner" style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', border: '2px solid rgba(250, 204, 21, 0.1)', borderTopColor: 'var(--tg-blue)', borderRadius: '50%' }} />}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <motion.button className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={isUploading} style={{ padding: '10px 16px', fontSize: '0.9rem' }}>
                <Plus size={18} />
                <span className="desktop-only">{isUploading ? `Uploading...` : 'Upload'}</span>
            </motion.button>
            <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
            
            <button className="btn-icon" onClick={() => setShowNotifications(!showNotifications)} style={{ position: 'relative' }}>
                <Bell size={20} />
                {notifications.length > 0 && <span style={{ position: 'absolute', top: '8px', right: '8px', width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', border: '2px solid #111' }}></span>}
            </button>

            <AnimatePresence>
                {showNotifications && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="glass-panel"
                        style={{ position: 'absolute', top: '60px', right: '0', width: '320px', zIndex: 500, padding: '0', overflow: 'hidden', border: '1px solid var(--tg-blue)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
                    >
                        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                            <span style={{ fontWeight: 700 }}>Notifications</span>
                            <button onClick={() => setNotifications([])} style={{ fontSize: '0.75rem', color: 'var(--tg-blue)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear All</button>
                        </div>
                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {notifications.length === 0 ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.5 }}>
                                    <Bell size={32} style={{ marginBottom: '12px' }} />
                                    <p style={{ fontSize: '0.9rem' }}>No new alerts</p>
                                </div>
                            ) : (
                                notifications.map(n => (
                                    <div key={n.id} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', gap: '12px', transition: '0.2s' }} className="notif-item">
                                        <div style={{ padding: '8px', borderRadius: '10px', height: 'fit-content', background: n.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : n.type === 'warning' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(42, 171, 238, 0.1)' }}>
                                            {n.type === 'success' ? <CheckCircle size={16} color="#10b981" /> : n.type === 'warning' ? <AlertCircle size={16} color="#ef4444" /> : <Bell size={16} color="var(--tg-blue)" />}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{n.title}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>{n.message}</div>
                                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', marginTop: '8px' }}>{n.time}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
          </div>
        </header>

        <AnimatePresence>{selectedFiles.length > 0 && (
          <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="glass-panel" style={{ position: 'fixed', top: '100px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, padding: '12px 24px', display: 'flex', gap: '20px', background: 'rgba(10,10,10,0.95)', border: '1px solid var(--tg-blue)', boxShadow: '0 10px 40px rgba(0,0,0,0.8)', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '20px', borderRight: '1px solid rgba(255,255,255,0.1)' }}><span>{selectedFiles.length} selected</span><button onClick={() => setSelectedFiles([])} className="btn-icon" style={{ width: '24px', height: '24px' }}><X size={14} /></button></div>
            <div style={{ display: 'flex', gap: '8px' }}>
                {activeFolder === 'Trash' ? (
                    <>
                        <button onClick={handleRestoreFiles} className="toolbar-btn"><RefreshCw size={18} /><span>Restore</span></button>
                        <button onClick={handleDeleteFiles} className="toolbar-btn" style={{ color: '#ef4444' }}><Trash2 size={18} /><span>Delete Permanently</span></button>
                    </>
                ) : (
                    <>
                        {activeFolder !== 'Private Vault' && <button onClick={() => handleShareFile(selectedFiles[0])} disabled={selectedFiles.length > 1} className="toolbar-btn" style={{ color: 'var(--tg-blue)' }}><Share2 size={18} /><span>Share</span></button>}
                        <button onClick={() => { setActionType('copy'); setIsActionModalOpen(true); }} className="toolbar-btn"><Copy size={18} /><span>Copy</span></button>
                        <button onClick={() => { setActionType('move'); setIsActionModalOpen(true); }} className="toolbar-btn"><Move size={18} /><span>Move</span></button>
                        <button onClick={handleDeleteFiles} className="toolbar-btn" style={{ color: '#ef4444' }}><Trash2 size={18} /><span>Move to Trash</span></button>
                    </>
                )}
            </div>
          </motion.div>
        )}</AnimatePresence>

        <div style={{ display: 'flex', gap: '32px' }}><div style={{ flex: 1 }}>{renderContent()}</div></div>
      </div>

      <AnimatePresence>
        {previewFile && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(15px)' }}>
            {/* Top Bar for buttons */}
            <div style={{ position: 'absolute', top: '24px', right: '24px', display: 'flex', gap: '16px', zIndex: 401 }}>
              <button 
                onClick={() => handleDownload(previewFile)} 
                className="btn-icon" 
                style={{ background: 'rgba(255,255,255,0.1)', width: '50px', height: '50px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', transition: 'all 0.2s' }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              >
                <Download size={24} />
              </button>
              <button 
                onClick={() => setPreviewFile(null)} 
                className="btn-icon" 
                style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', width: '50px', height: '50px', borderRadius: '14px', border: '1px solid rgba(239, 68, 68, 0.2)', transition: 'all 0.2s' }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
              >
                <X size={24} />
              </button>
            </div>

            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ position: 'relative', width: '90%', maxWidth: '1000px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>{renderPreviewContent()}</div>
              <div style={{ marginTop: '24px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{previewFile.name} <span style={{ opacity: 0.4, fontSize: '0.9rem' }}>#{previewFile.id}</span></h2>
                <p style={{ color: 'var(--text-secondary)' }}>{formatSize(previewFile.size)}</p>
              </div>
              {isPreviewLoading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}><div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(250, 204, 21, 0.1)', borderTopColor: 'var(--tg-blue)', borderRadius: '50%' }} /></div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .toolbar-btn { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; cursor: pointer; }
        .toolbar-btn:hover { background: rgba(250, 204, 21, 0.1); border-color: var(--tg-blue); color: var(--tg-blue); }
        .file-card.selected { box-shadow: 0 0 20px rgba(250, 204, 21, 0.15); }
        .file-card-preview:hover .hover-play { opacity: 1 !important; }
        .spinner { animation: spin 1s linear infinite; }
        .pulse-animation { animation: pulse 2s infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0% { transform: scale(1); opacity: 0.1; } 50% { transform: scale(1.5); opacity: 0.3; } 100% { transform: scale(1); opacity: 0.1; } }
      `}</style>

      {/* Modal Components */}
      <AnimatePresence>{isNewFolderModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-panel" style={{ width: '380px', padding: '32px', border: '1px solid var(--tg-blue)' }}>
            <h3>Create New Node</h3>
            <input autoFocus type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder Name..." style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#fff', margin: '24px 0', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '12px' }}><button onClick={() => { axios.post(`${API_URL}/workspace/folders/create`, { name: newFolderName }).then(()=>{setIsNewFolderModalOpen(false); setNewFolderName(''); fetchFolders();}); }} className="btn-primary" style={{ flex: 1 }}>Create Folder</button><button onClick={() => setIsNewFolderModalOpen(false)} className="btn-icon">Cancel</button></div>
          </motion.div>
        </div>
      )}</AnimatePresence>

      <AnimatePresence>{isRenameModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-panel" style={{ width: '380px', padding: '32px', border: '1px solid var(--tg-blue)' }}>
            <h3>Rename Node</h3>
            <input autoFocus type="text" value={renamedFolderName} onChange={e => setRenamedFolderName(e.target.value)} placeholder="New Name..." style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#fff', margin: '24px 0', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '12px' }}><button onClick={() => { axios.put(`${API_URL}/workspace/folders/rename`, { oldName: folderToRename, newName: renamedFolderName }).then(()=>{setIsRenameModalOpen(false); setFolderToRename(null); setRenamedFolderName(''); fetchFolders();}); }} className="btn-primary" style={{ flex: 1 }}>Rename</button><button onClick={() => setIsRenameModalOpen(false)} className="btn-icon">Cancel</button></div>
          </motion.div>
        </div>
      )}</AnimatePresence>

      <AnimatePresence>{isActionModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-panel" style={{ width: '400px', padding: '32px' }}>
            <h3>Select Destination Node</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', maxHeight: '300px', overflowY: 'auto' }}>
              {folders.filter(f=>!['Favorites','Trash'].includes(f.name)).map(f => (
                <button key={f.name} disabled={f.name === activeFolder} onClick={() => handleMoveCopy(f.name)} style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#fff', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px', opacity: f.name === activeFolder ? 0.4 : 1 }}>
                  <Folder size={18} color="var(--tg-blue)" /> {f.name}
                </button>
              ))}
            </div>
            <button onClick={() => setIsActionModalOpen(false)} className="btn-icon" style={{ position: 'absolute', top: '16px', right: '16px' }}><X size={20} /></button>
          </motion.div>
        </div>
      )}</AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} 
            style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, padding: '12px 24px', borderRadius: '12px', background: toast.type === 'error' ? '#ef4444' : '#10b981', color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {toast.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
            <span style={{ fontWeight: 500 }}>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDialog && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', padding: '32px', borderRadius: '24px', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                <AlertCircle size={32} color="#ef4444" />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '12px' }}>Confirm Action</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: 1.5 }}>{confirmDialog.message}</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setConfirmDialog(null)} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button onClick={confirmDialog.onConfirm} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Confirm</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
