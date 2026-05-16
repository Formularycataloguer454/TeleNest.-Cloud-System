require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db } = require('./firebase');
const { 
  sendCode, 
  signIn, 
  signInWithPassword, 
  createPrivateChannel,
  uploadFile,
  getFiles,
  downloadFileMedia,
  getThumbnail,
  deleteFiles,
  moveCopyFiles,
  isAuthorized,
  resetClient,
  getMe,
  invalidateCache,
  streamFile
} = require('./telegram');

const app = express();
console.log('--- TeleNest Security System v2 Active ---');
app.use(cors());
app.use(express.json());

// Active session tokens stored in Firestore
let activeTokens = new Set();

async function loadTokens() {
  if (db) {
    try {
      const doc = await db.collection('configs').doc('auth_tokens').get();
      if (doc.exists && doc.data().tokens) {
        activeTokens = new Set(doc.data().tokens);
      }
    } catch (e) { console.error('Failed to load tokens:', e.message); }
  }
}
async function saveTokens() {
  if (db) {
    try {
      await db.collection('configs').doc('auth_tokens').set({ tokens: [...activeTokens], updatedAt: new Date().toISOString() });
    } catch (e) { console.error('Failed to save tokens:', e.message); }
  }
}
// Auth middleware - protects all /api/ routes except auth routes
function requireAuth(req, res, next) {
  // Allow public routes
  const publicPaths = ['/api/auth/status', '/api/auth/send-code', '/api/auth/login', '/api/auth/2fa', '/api/admin/wipe-db'];
  if (publicPaths.includes(req.path) || req.path.startsWith('/s/')) {
    return next();
  }
  let token = req.headers.authorization?.replace('Bearer ', '');
  if (!token && req.query.token) {
    token = req.query.token;
  }
  if (!token || !activeTokens.has(token)) {
    console.warn(`[Auth] BLOCKED ${req.method} ${req.path} — token: ${token ? token.substring(0, 8) + '...' : 'NONE'}, active tokens: ${activeTokens.size}`);
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  next();
}
app.use(requireAuth);

const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
const THUMBS_DIR = path.resolve(__dirname, 'thumbs');
[UPLOADS_DIR, THUMBS_DIR].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, UPLOADS_DIR); },
  filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage });

async function getUserId() {
  try {
    if (await isAuthorized()) {
      const user = await getMe();
      if (user && user.id) {
        return user.id.toString();
      }
    }
  } catch (e) {
    console.error("Error getting user ID:", e.message);
  }
  return 'default';
}

const crypto = require('crypto');

async function getDatabase() {
  const uid = await getUserId();
  if (uid === 'default') throw new Error('User not identified');
  
  if (db) {
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists) {
        const data = doc.data();
        if (!data.folders) data.folders = {};
        if (!data.shares) data.shares = [];
        if (!data.folderShares) data.folderShares = [];
        if (!data.events) data.events = [];
        return data;
      }
    } catch (e) {
      console.error("Firestore DB Error:", e.message);
    }
  }

  // Fallback to legacy local JSON if exists
  const dbFile = path.resolve(__dirname, `database_${uid}.json`);
  if (fs.existsSync(dbFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
      // Optional: Migrate to Firestore on first read
      if (db) {
        await db.collection('users').doc(uid).set(data);
        console.log(`Migrated local database_${uid}.json to Firestore`);
      }
      return data;
    } catch (e) {}
  }

  return { folders: {}, shares: [], folderShares: [], events: [] };
}


async function saveDatabase(data) { 
  const uid = await getUserId();
  if (db) {
    try {
      await db.collection('users').doc(uid).set(data);
    } catch (e) {
      console.error("Firestore Save Error:", e.message);
    }
  }
  // Also keep a local backup for safety if possible (optional)
  const dbFile = path.resolve(__dirname, `database_${uid}.json`);
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2)); 
}


async function updateFolderStats(folderName, fileSizeChange, countChange = 1, fileMimeType = null) {
  const db = await getDatabase();
  
  // 1. Update the specific folder where the file is stored
  if (db.folders[folderName]) {
    db.folders[folderName].count = Math.max(0, (db.folders[folderName].count || 0) + countChange);
    db.folders[folderName].size = Math.max(0, (db.folders[folderName].size || 0) + fileSizeChange);
  }
  
  // 2. If it's a custom folder, also update the global system category (e.g. Images, Videos)
  // BUT don't do it if the target folder IS the system folder (to avoid double counting)
  if (fileMimeType) {
    let sysFolder = null;
    if (fileMimeType.startsWith('image/')) sysFolder = 'Images';
    else if (fileMimeType.startsWith('video/')) sysFolder = 'Videos';
    else if (fileMimeType.startsWith('audio/')) sysFolder = 'Audio';
    else if (fileMimeType.startsWith('application/pdf') || fileMimeType.includes('document')) sysFolder = 'Documents';
    else sysFolder = 'Downloads';

    if (sysFolder && sysFolder !== folderName && db.folders[sysFolder]) {
        db.folders[sysFolder].count = Math.max(0, (db.folders[sysFolder].count || 0) + countChange);
        db.folders[sysFolder].size = Math.max(0, (db.folders[sysFolder].size || 0) + fileSizeChange);
    }
  }
  await saveDatabase(db);
}

app.get('/api/auth/status', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token && activeTokens.has(token) && await isAuthorized()) {
        const user = await getMe();
        const dbData = await getDatabase();
        const needsInit = Object.keys(dbData.folders || {}).length === 0;
        return res.json({ 
          authorized: true, 
          user: { id: user.id.toString(), username: user.username, firstName: user.firstName },
          needsInit
        });
    }
    res.json({ authorized: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/debug-env', (req, res) => {
  res.json({
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'Found' : 'Missing',
    CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'Found' : 'Missing',
    PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? 'Found' : 'Missing',
    PORT: process.env.PORT || 'Default (3001)',
    NODE_ENV: process.env.NODE_ENV || 'Not set'
  });
});

app.post('/api/auth/send-code', async (req, res) => {
  try { res.json({ phoneCodeHash: await sendCode(req.body.phoneNumber) }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await signIn(req.body.phoneNumber, req.body.phoneCodeHash, req.body.phoneCode);
    if (result.success) {
      const token = crypto.randomBytes(32).toString('hex');
      activeTokens.add(token);
      await saveTokens();
      
      const dbData = await getDatabase();
      const needsInit = Object.keys(dbData.folders || {}).length === 0;
      
      return res.json({ ...result, token, needsInit });
    }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/refresh-stats', async (req, res) => {
  try {
    const db = await getDatabase();
    const { getFiles } = require('./telegram');
    
    console.log("Recalculating all folder statistics...");
    
    // Reset all system and custom folder stats
    for (const name in db.folders) {
      if (['Favorites', 'Trash'].includes(name)) continue;
      const files = await getFiles(db.folders[name].id, true); // Force refresh cache
      db.folders[name].count = files.length;
      db.folders[name].size = files.reduce((acc, f) => acc + (f.size || 0), 0);
    }
    
    // Also update virtual system views (Images, Videos, etc.)
    // These should be the SUM of all matching files in all folders?
    // Actually, in our current design, files are only in ONE physical folder.
    // So we just need to make sure the counts are accurate.
    
    await saveDatabase(db);
    res.json({ success: true, db: db.folders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/clear-thumbnails', async (req, res) => {
  try {
    if (fs.existsSync(THUMBS_DIR)) {
      const files = fs.readdirSync(THUMBS_DIR);
      for (const file of files) fs.unlinkSync(path.join(THUMBS_DIR, file));
    }
    res.json({ success: true, cleared: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      activeTokens.delete(token);
      await saveTokens();
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// TEMPORARY: Route to wipe the database (DELETE AFTER USE)
app.post('/api/admin/wipe-db', async (req, res) => {
  try {
    const collections = ['users', 'configs'];
    for (const col of collections) {
      const snapshot = await db.collection(col).get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    // Clear active tokens
    activeTokens.clear();
    await saveTokens();
    
    // Also clear session file if exists
    const sessionPath = path.resolve(__dirname, 'session.txt');
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    
    const { resetClient } = require('./telegram');
    await resetClient();
    res.json({ success: true, message: 'Database wiped successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.post('/api/auth/2fa', async (req, res) => {
  try {
    const result = await signInWithPassword(req.body.password);
    if (result.success) {
      const token = crypto.randomBytes(32).toString('hex');
      activeTokens.add(token);
      await saveTokens();

      const dbData = await getDatabase();
      const needsInit = Object.keys(dbData.folders || {}).length === 0;

      return res.json({ ...result, token, needsInit });
    }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/init', async (req, res) => {
  try {
    if (!await isAuthorized()) return res.status(401).json({ error: 'Not authorized' });
    const foldersToCreate = ['Images', 'Videos', 'Documents', 'Audio', 'Downloads', 'Favorites', 'Trash'];
    const db = await getDatabase();
    for (const folder of foldersToCreate) {
      if (!db.folders[folder]) {
        db.folders[folder] = { id: (folder === 'Favorites' || folder === 'Trash') ? folder : await createPrivateChannel(`TeleNest_${folder}`), count: 0, size: 0, type: 'system' };
        if (folder !== 'Favorites' && folder !== 'Trash') await new Promise(r => setTimeout(r, 3000));
      }
    }
    await saveDatabase(db);
    res.json({ success: true, db: db.folders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings', async (req, res) => {
  try {
    if (db) {
        const doc = await db.collection('configs').doc('app_settings').get();
        if (doc.exists) return res.json(doc.data());
    }
    const settingsPath = path.resolve(__dirname, 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings', async (req, res) => {
  try {
    if (db) {
        await db.collection('configs').doc('app_settings').set(req.body);
    }
    const settingsPath = path.resolve(__dirname, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/workspace/folders', async (req, res) => {
  try {
    const db = await getDatabase();
    const folders = { ...db.folders };
    const { getFiles } = require('./telegram');
    const trashedIds = new Set((db.trash || []).map(t => `${t.channelId}_${t.messageId}`));
    
    // Try to dynamically compute system folders from cached getFiles
    const systemFolders = ['Images', 'Videos', 'Documents', 'Audio', 'Downloads'];
    
    try {
        const folderNames = Object.keys(db.folders).filter(f => !['Favorites', 'Trash'].includes(f));
        const fetchPromises = folderNames.map(async (fName) => {
            const folder = db.folders[fName];
            const files = await getFiles(folder.id, false); // use cache
            return files.filter(f => !trashedIds.has(`${folder.id}_${f.id}`));
        });
        const results = await Promise.all(fetchPromises);
        const allFiles = results.flat();

        for (const sysFolder of systemFolders) {
            if (!folders[sysFolder]) continue;
            const filtered = allFiles.filter(f => {
                if (sysFolder === 'Images') return f.type.includes('Photo') || (f.mimeType && f.mimeType.startsWith('image/'));
                if (sysFolder === 'Videos') return f.type.includes('Video') || (f.mimeType && f.mimeType.startsWith('video/'));
                if (sysFolder === 'Documents') return f.type.includes('Document') && (!f.mimeType || !f.mimeType.startsWith('video/') && !f.mimeType.startsWith('image/') && !f.mimeType.startsWith('audio/'));
                if (sysFolder === 'Audio') return f.type.includes('Audio') || (f.mimeType && f.mimeType.startsWith('audio/'));
                if (sysFolder === 'Downloads') return true;
                return false;
            });
            folders[sysFolder].count = filtered.length;
            folders[sysFolder].size = filtered.reduce((acc, f) => acc + (f.size || 0), 0);
        }
    } catch (e) {}

    // Dynamically update Favorites stats
    if (folders['Favorites']) {
      folders['Favorites'].count = (db.favorites || []).length;
      folders['Favorites'].size = (db.favorites || []).reduce((acc, f) => acc + (f.size || 0), 0);
    }
    
    // Dynamically update Trash stats
    if (folders['Trash']) {
      folders['Trash'].count = (db.trash || []).length;
      folders['Trash'].size = (db.trash || []).reduce((acc, f) => acc + (f.size || 0), 0);
    }
    
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/workspace/folders/archive-all', async (req, res) => {
  try {
    const db = await getDatabase();
    const { archiveChannels } = require('./telegram');
    const channelIds = Object.values(db.folders).map(f => f.id);
    await archiveChannels(channelIds);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/sync-folder', async (req, res) => {
  try {
    const { folderName } = req.body;
    const db = await getDatabase();
    const { getFiles } = require('./telegram');
    
    if (db.folders[folderName]) {
      const files = await getFiles(db.folders[folderName].id, true);
      db.folders[folderName].count = files.length;
      db.folders[folderName].size = files.reduce((acc, f) => acc + (f.size || 0), 0);
      await saveDatabase(db);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/wipe-data', async (req, res) => {
  try {
    const db = await getDatabase();
    const { deleteChannels } = require('./telegram');
    
    // Collect all channel IDs to delete from Telegram
    const channelIds = Object.values(db.folders).map(f => f.id);
    await deleteChannels(channelIds);
    
    // Clear the local database
    const uid = await getUserId();
    const dbFile = path.resolve(__dirname, `database_${uid}.json`);
    if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    
    // Delete the Telegram session
    const sessionPath = path.resolve(__dirname, 'session.txt');
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    
    await resetClient();
    cachedUserId = null;
    invalidateCache('all');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/folders/create', async (req, res) => {
  try {
    const { name } = req.body;
    const db = await getDatabase();
    if (db.folders[name]) return res.status(400).json({ error: 'Exists' });
    db.folders[name] = { id: await createPrivateChannel(`TeleNest_${name}`), count: 0, size: 0, type: 'custom', createdAt: new Date().toISOString() };
    await saveDatabase(db);
    res.json({ success: true, folder: db.folders[name] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/workspace/folders/rename', async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    const db = await getDatabase();
    if (!db.folders[oldName] || db.folders[oldName].type === 'system') return res.status(400).json({ error: 'Invalid' });
    db.folders[newName] = { ...db.folders[oldName] };
    delete db.folders[oldName];
    await saveDatabase(db);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/workspace/folders/:name', async (req, res) => {
  try {
    const db = await getDatabase();
    if (!db.folders[req.params.name] || db.folders[req.params.name].type === 'system') return res.status(400).json({ error: 'Invalid' });
    delete db.folders[req.params.name];
    await saveDatabase(db);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/upload', upload.single('file'), async (req, res) => {
  try {
    let { folderName } = req.body;
    const file = req.file;
    const db = await getDatabase();
    if (!folderName || folderName === 'auto') {
        if (file.mimetype.startsWith('image/')) folderName = 'Images';
        else if (file.mimetype.startsWith('video/')) folderName = 'Videos';
        else if (file.mimetype.startsWith('audio/')) folderName = 'Audio';
        else folderName = 'Downloads';
    }

    if (folderName === 'Private Vault' && !db.folders['Private Vault']) {
        const { createChannel } = require('./telegram');
        const channelId = await createChannel('TeleNest Private Vault');
        db.folders['Private Vault'] = { id: channelId, count: 0, size: 0, date: new Date().toISOString() };
        await saveDatabase(db);
    }

    await uploadFile(db.folders[folderName].id, file.path, file.originalname);
    await updateFolderStats(folderName, file.size, 1, file.mimetype);
    invalidateCache(db.folders[folderName].id);

    fs.unlinkSync(file.path);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Favorites and Trash state management
async function getFilesState() {
  const db = await getDatabase();
  if (!db.favorites) db.favorites = [];
  if (!db.trash) db.trash = [];
  return db;
}

app.post('/api/workspace/files/star', async (req, res) => {
  try {
    const { channelId, messageId, name, size, mimeType, date, type, sourceFolder } = req.body;
    const db = await getFilesState();
    const index = db.favorites.findIndex(f => f.channelId === channelId && f.messageId === messageId);
    if (index > -1) db.favorites.splice(index, 1);
    else db.favorites.push({ channelId, messageId, name, size, mimeType, date, type, sourceFolder });
    await saveDatabase(db);
    res.json({ success: true, starred: index === -1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/files/trash', async (req, res) => {
  try {
    const { channelId, messageId, name, size, mimeType, date } = req.body;
    const db = await getFilesState();
    db.favorites = db.favorites.filter(f => !(f.channelId === channelId && f.messageId === messageId));
    db.trash.push({ channelId, messageId, name, size, mimeType, date, deletedAt: new Date().toISOString() });
    await saveDatabase(db);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/files/share', async (req, res) => {
  try {
    const { channelId, messageId, name, size, mimeType } = req.body;
    const db = await getDatabase();
    
    const existing = db.shares.find(s => s.channelId === channelId && s.messageId === messageId);
    if (existing) return res.json({ success: true, share: existing });

    const hash = crypto.randomBytes(8).toString('hex');
    const share = { hash, channelId, messageId, name, size, mimeType, createdAt: new Date().toISOString() };
    
    db.shares.push(share);
    await saveDatabase(db);
    res.json({ success: true, share });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/folders/share', async (req, res) => {
    try {
      const { folderName } = req.body;
      const db = await getDatabase();
      const existing = db.folderShares.find(s => s.folderName === folderName);
      if (existing) return res.json({ success: true, share: existing });
  
      const hash = crypto.randomBytes(8).toString('hex');
      const share = { hash, folderName, createdAt: new Date().toISOString() };
      db.folderShares.push(share);
      await saveDatabase(db);
      res.json({ success: true, share });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/workspace/folder-shares', async (req, res) => {
    try {
        const db = await getDatabase();
        res.json(db.folderShares || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/workspace/folder-shares/:hash', async (req, res) => {
    try {
        const db = await getDatabase();
        db.folderShares = db.folderShares.filter(s => s.hash !== req.params.hash);
        await saveDatabase(db);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public Folder View Endpoint
app.get('/s/folder/:hash', async (req, res) => {
    try {
        const { hash } = req.params;
        const db = await getDatabase();
        const share = db.folderShares.find(s => s.hash === hash);
        if (!share) return res.status(404).send('Folder share not found');

        // Track View Event
        share.views = (share.views || 0) + 1;
        db.events.push({
            id: Date.now(),
            type: 'node_view',
            title: 'Node Viewed',
            message: `Someone is browsing your shared node: "${share.folderName}"`,
            time: new Date().toISOString()
        });
        await saveDatabase(db);

        const physicalFolder = db.folders[share.folderName];
        if (!physicalFolder) return res.status(404).send('Folder no longer exists');

        const files = await getFiles(physicalFolder.id);
        // Simple HTML representation for the public view
        let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Shared Node - ${share.folderName} | TeleNest</title>
            <style>
                :root { --tg-blue: #2aabee; --bg: #050505; --glass: rgba(255, 255, 255, 0.03); --border: rgba(255, 255, 255, 0.1); }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Inter', -apple-system, system-ui, sans-serif; background: var(--bg); color: #fff; line-height: 1.6; }
                .hero { padding: 60px 20px; text-align: center; background: radial-gradient(circle at top, rgba(42, 171, 238, 0.15), transparent); border-bottom: 1px solid var(--border); }
                h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 10px; color: var(--tg-blue); }
                .sub { color: #888; font-size: 1rem; }
                .container { max-width: 900px; margin: -40px auto 100px; padding: 0 20px; }
                .file-list { display: flex; flex-direction: column; gap: 12px; }
                .file-item { 
                    background: var(--glass); 
                    backdrop-filter: blur(10px);
                    padding: 18px 24px; 
                    border-radius: 16px; 
                    display: flex; 
                    align-items: center; 
                    gap: 20px; 
                    border: 1px solid var(--border); 
                    transition: all 0.2s ease;
                    text-decoration: none;
                    color: inherit;
                }
                .file-item:hover { background: rgba(255,255,255,0.06); border-color: var(--tg-blue); transform: translateY(-2px); }
                .icon { width: 48px; height: 48px; background: rgba(42, 171, 238, 0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: var(--tg-blue); }
                .info { flex: 1; min-width: 0; }
                .name { font-weight: 600; font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .meta { font-size: 0.85rem; color: #777; margin-top: 4px; display: flex; gap: 15px; }
                .btn-dl { background: var(--tg-blue); color: #000; padding: 10px 20px; border-radius: 10px; font-weight: 700; font-size: 0.9rem; transition: 0.2s; }
                .btn-dl:hover { transform: scale(1.05); filter: brightness(1.1); }
                @media (max-width: 600px) { .file-item { padding: 15px; } .btn-dl { display: none; } }
            </style>
        </head>
        <body>
            <div class="hero">
                <h1>${share.folderName}</h1>
                <p class="sub">TeleNest Cloud Shared Node • ${files.length} items</p>
            </div>
            <div class="container">
                <div class="file-list">
                    ${files.map(f => {
                        const size = (f.size / (1024 * 1024)).toFixed(2);
                        const date = new Date(f.date * 1000).toLocaleDateString();
                        const icon = f.mimeType?.startsWith('image/') ? '🖼️' : f.mimeType?.startsWith('video/') ? '🎬' : f.mimeType?.startsWith('audio/') ? '🎵' : '📄';
                        return `
                        <a href="/api/workspace/view/${share.folderName}/${f.id}?channelId=${physicalFolder.id}" class="file-item">
                            <div class="icon">${icon}</div>
                            <div class="info">
                                <div class="name" title="${f.name}">${f.name}</div>
                                <div class="meta">
                                    <span>${size} MB</span>
                                    <span>${date}</span>
                                </div>
                            </div>
                            <div class="btn-dl">View / Download</div>
                        </a>
                        `;
                    }).join('')}
                </div>
            </div>
            <footer style="text-align: center; padding: 40px; color: #444; font-size: 0.8rem; border-top: 1px solid var(--border);">
                Powered by TeleNest Cloud Storage
            </footer>
        </body>
        </html>`;
        res.send(html);
    } catch (err) { res.status(500).send('Folder share error: ' + err.message); }
});

app.get('/api/workspace/events', async (req, res) => {
    try {
        const db = await getDatabase();
        const events = [...(db.events || [])];
        db.events = []; // Clear after fetching
        await saveDatabase(db);
        res.json(events);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/workspace/shares', async (req, res) => {
    try {
        const db = await getDatabase();
        res.json(db.shares || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/workspace/shares/:hash', async (req, res) => {
    try {
        const db = await getDatabase();
        db.shares = db.shares.filter(s => s.hash !== req.params.hash);
        await saveDatabase(db);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public Share Endpoint (Preview Page)
app.get('/s/:hash', async (req, res) => {
    try {
        const { hash } = req.params;
        const db = await getDatabase(); 
        const share = db.shares.find(s => s.hash === hash);
        if (!share) return res.status(404).send('Share not found or expired');
        
        // If it's a direct download request from the preview page
        if (req.query.dl === 'true') {
            return await streamFile(share.channelId, share.messageId, req, res);
        }

        // Track View Event
        share.views = (share.views || 0) + 1;
        db.events.push({
            id: Date.now(),
            type: 'share_view',
            title: 'File Viewed',
            message: `Someone accessed your shared file: "${share.name}"`,
            time: new Date().toISOString()
        });
        await saveDatabase(db);

        const size = (share.size / (1024 * 1024)).toFixed(2);
        const date = new Date(share.createdAt).toLocaleDateString();
        const icon = share.mimeType?.startsWith('image/') ? '🖼️' : share.mimeType?.startsWith('video/') ? '🎬' : share.mimeType?.startsWith('audio/') ? '🎵' : '📄';
        
        let previewHtml = '';
        if (share.mimeType?.startsWith('image/')) {
            previewHtml = `<img src="/api/workspace/view/Shared/${share.messageId}?channelId=${share.channelId}" style="max-width: 100%; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">`;
        } else if (share.mimeType?.startsWith('video/')) {
            previewHtml = `<video src="/api/workspace/view/Shared/${share.messageId}?channelId=${share.channelId}" controls style="max-width: 100%; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"></video>`;
        } else if (share.mimeType?.startsWith('audio/')) {
            previewHtml = `
            <div style="background: rgba(255,255,255,0.05); padding: 40px; border-radius: 32px; border: 1px solid rgba(255,255,255,0.1); width: 100%;">
                <div style="font-size: 50px; margin-bottom: 20px;">🎵</div>
                <audio src="/api/workspace/view/Shared/${share.messageId}?channelId=${share.channelId}" controls style="width: 100%;"></audio>
            </div>`;
        }

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${share.name} | TeleNest Shared</title>
            <style>
                :root { --tg-blue: #2aabee; --bg: #050505; --glass: rgba(255, 255, 255, 0.03); --border: rgba(255, 255, 255, 0.1); }
                body { font-family: 'Inter', sans-serif; background: var(--bg); color: #fff; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; overflow-x: hidden; }
                .card { width: 90%; max-width: 700px; background: var(--glass); backdrop-filter: blur(20px); border: 1px solid var(--border); border-radius: 32px; padding: 40px; text-align: center; position: relative; z-index: 10; }
                .bg-orb { position: fixed; width: 600px; height: 600px; background: radial-gradient(circle, rgba(42, 171, 238, 0.1), transparent 70%); z-index: 1; top: -200px; left: -200px; }
                h1 { font-size: 1.8rem; margin: 20px 0 10px; word-break: break-all; }
                .meta { color: #888; font-size: 0.9rem; margin-bottom: 30px; }
                .preview-box { margin-bottom: 30px; }
                .btn { display: inline-flex; align-items: center; gap: 10px; background: var(--tg-blue); color: #000; text-decoration: none; padding: 14px 30px; border-radius: 14px; font-weight: 800; transition: 0.2s; }
                .btn:hover { transform: scale(1.05); }
                .logo { position: absolute; top: 30px; left: 50%; transform: translateX(-50%); opacity: 0.5; font-weight: 900; letter-spacing: -1px; }
            </style>
        </head>
        <body>
            <div class="bg-orb"></div>
            <div class="logo">TeleNest<span style="color: var(--tg-blue)">.</span></div>
            <div class="card">
                <div style="font-size: 40px; margin-bottom: 10px;">${icon}</div>
                <h1>${share.name}</h1>
                <div class="meta">${size} MB • Shared via TeleNest • ${date}</div>
                
                <div class="preview-box">
                    ${previewHtml || '<div style="opacity: 0.2; padding: 40px; border: 2px dashed var(--border); border-radius: 20px;">Preview not available for this file type</div>'}
                </div>

                <a href="?dl=true" class="btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download File
                </a>
            </div>
        </body>
        </html>`;
        res.send(html);
    } catch (err) { res.status(500).send('Sharing error: ' + err.message); }
});


app.post('/api/workspace/files/restore', async (req, res) => {
    try {
      const { channelId, messageId } = req.body;
      const db = await getFilesState();
      const file = db.trash.find(f => f.channelId === channelId && f.messageId === messageId);
      if (file) {
          // Find the folder it belongs to. Since we don't store original folder, 
          // we use sourceFolder if available or guess.
          const folderName = file.sourceFolder || 'Downloads';
          await updateFolderStats(folderName, file.size, 1, file.mimeType);
          db.trash = db.trash.filter(f => !(f.channelId === channelId && f.messageId === messageId));
      }
      await saveDatabase(db);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

setInterval(async () => {
    try {
        const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
        if (!settings.autoDeleteTrash) return;

        const db = await getDatabase();
        if (!db.trash || db.trash.length === 0) return;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - settings.trashRetentionDays);
        
        const toDelete = db.trash.filter(f => new Date(f.deletedAt) < cutoff);
        
        if (toDelete.length > 0) {
            const { deleteFiles } = require('./telegram');
            for (const f of toDelete) {
                try { 
                    await deleteFiles(f.channelId, [f.messageId]); 
                    db.trash = db.trash.filter(i => !(i.channelId === f.channelId && i.messageId === f.messageId)); 
                } catch (e) {
                    console.error('Failed to auto-delete trashed file', e);
                }
            }
            await saveDatabase(db);
        }
    } catch (err) {
        console.error('Auto-cleanup task failed', err);
    }
}, 24 * 60 * 60 * 1000);

app.get('/api/vault/status', async (req, res) => {
    try {
        const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
        res.json({ isSetup: settings.isVaultSetupDone || false });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vault/setup', async (req, res) => {
    try {
        const { password } = req.body;
        const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
        settings.vaultPassword = password;
        settings.isVaultSetupDone = true;
        fs.writeFileSync('./settings.json', JSON.stringify(settings, null, 2));
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vault/unlock', async (req, res) => {
    try {
        const { password } = req.body;
        const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
        if (password === settings.vaultPassword) {
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Incorrect vault password' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vault/set-password', async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
        if (oldPassword === settings.vaultPassword || !settings.vaultPassword) {
            settings.vaultPassword = newPassword;
            fs.writeFileSync('./settings.json', JSON.stringify(settings, null, 2));
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Current password incorrect' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/workspace/search', async (req, res) => {
    try {
        const query = (req.query.q || '').toString().toLowerCase();
        if (!query) return res.json([]);
        
        const db = await getDatabase();
        const { getFiles } = require('./telegram');
        const trashedIds = new Set(db.trash.map(t => `${t.channelId}_${t.messageId}`));
        
        let allResults = [];
        for (const fName in db.folders) {
            const folder = db.folders[fName];
            // Skip virtual folders like Favorites and Trash which don't have numeric Telegram IDs
            if (!folder.id || isNaN(parseInt(folder.id))) continue;
            
            try {
                const files = await getFiles(folder.id);
                const matches = files.filter(f => !trashedIds.has(`${folder.id}_${f.id}`))
                                    .filter(f => f.name.toLowerCase().includes(query))
                                    .map(f => ({ ...f, channelId: folder.id, sourceFolder: fName }));
                allResults = [...allResults, ...matches];
            } catch (err) {
                console.error(`Search failed for folder ${fName}:`, err.message);
            }
        }
        res.json(allResults);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/workspace/files/:folderName', async (req, res) => {
  try {
    const { folderName } = req.params;
    const db = await getFilesState();
    
    if (folderName === 'Private Vault') {
        const folder = db.folders['Private Vault'];
        if (!folder) return res.json([]);
        const files = await getFiles(folder.id);
        const trashedIds = new Set(db.trash.map(t => `${t.channelId}_${t.messageId}`));
        return res.json(files.filter(f => !trashedIds.has(`${folder.id}_${f.id}`)).map(f => ({ 
            ...f, channelId: folder.id, sourceFolder: 'Private Vault', 
            isStarred: db.favorites.some(fav => fav.channelId === folder.id && fav.messageId === f.id) 
        })));
    }

    if (folderName === 'Favorites') {
        return res.json(db.favorites.map(f => {
            let type = f.type;
            if (!type && f.mimeType) {
                if (f.mimeType.startsWith('image/')) type = 'Photo';
                else if (f.mimeType.startsWith('video/')) type = 'Video';
                else if (f.mimeType.startsWith('audio/')) type = 'Audio';
                else type = 'Document';
            }
            return { ...f, id: f.messageId, type: type || 'Document', isStarred: true };
        }));
    }
    if (folderName === 'Trash') return res.json(db.trash.map(f => ({ ...f, id: f.messageId })));
    const trashedIds = new Set(db.trash.map(t => `${t.channelId}_${t.messageId}`));
    const systemFolders = ['Images', 'Videos', 'Documents', 'Audio', 'Downloads'];
    if (systemFolders.includes(folderName)) {
        let allFiles = [];
        for (const fName in db.folders) {
            if (['Favorites', 'Trash'].includes(fName)) continue;
            const folder = db.folders[fName];
            const files = await getFiles(folder.id);
            const filtered = files.filter(f => !trashedIds.has(`${folder.id}_${f.id}`)).filter(f => {
                if (folderName === 'Images') return f.type.includes('Photo') || (f.mimeType && f.mimeType.startsWith('image/'));
                if (folderName === 'Videos') return f.type.includes('Video') || (f.mimeType && f.mimeType.startsWith('video/'));
                if (folderName === 'Audio') return f.type.includes('Audio') || (f.mimeType && f.mimeType.startsWith('audio/'));
                if (folderName === 'Documents') return f.type.includes('Document') && !(f.mimeType && (f.mimeType.startsWith('image/') || f.mimeType.startsWith('video/') || f.mimeType.startsWith('audio/')));
                return folderName === 'Downloads';
            }).map(f => ({ ...f, channelId: folder.id, sourceFolder: fName, isStarred: db.favorites.some(fav => fav.channelId === folder.id && fav.messageId === f.id) }));
            allFiles = [...allFiles, ...filtered];
        }
        return res.json(allFiles.sort((a, b) => b.date - a.date));
    }
    const physicalFolder = db.folders[folderName];
    const files = await getFiles(physicalFolder.id);
    const result = files.filter(f => !trashedIds.has(`${physicalFolder.id}_${f.id}`)).map(f => ({ ...f, channelId: physicalFolder.id, isStarred: db.favorites.some(fav => fav.channelId === physicalFolder.id && fav.messageId === f.id) }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/workspace/view/:folderName/:messageId', async (req, res) => {
  try {
    const { folderName, messageId } = req.params;
    const db = await getDatabase();
    const actualChannel = req.query.channelId || db.folders[req.query.source || folderName].id;
    const isDataSaver = req.query.dataSaver === 'true';

    // If data saver is ON and it's an image request (based on common image preview context)
    // We can check the file type in DB or just try to serve a thumb if requested
    if (isDataSaver) {
      const { getThumbnail } = require('./telegram');
      const thumb = await getThumbnail(actualChannel, messageId);
      if (thumb) {
        res.set('Content-Type', 'image/jpeg');
        return res.send(thumb);
      }
    }

    const PREVIEWS_DIR = path.resolve(__dirname, 'previews');
    if (!fs.existsSync(PREVIEWS_DIR)) fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
    const files = fs.readdirSync(PREVIEWS_DIR);
    const cachedFile = files.find(f => f.startsWith(`${actualChannel}_${messageId}`));
    if (cachedFile) return res.sendFile(path.join(PREVIEWS_DIR, cachedFile), { dotfiles: 'allow' });
    
    await streamFile(actualChannel, messageId, req, res);
  } catch (err) { if (!res.headersSent) res.status(500).json({ error: err.message }); }
});

app.get('/api/workspace/download/:folderName/:messageId', async (req, res) => {
  try {
    const db = await getDatabase();
    const actualChannel = req.query.channelId || db.folders[req.query.source || req.params.folderName].id;
    const { buffer, name } = await downloadFileMedia(actualChannel, req.params.messageId);
    res.set('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Simple in-flight dedup
const inFlight = new Map();

app.get('/api/workspace/thumbnail/:channelId/:messageId', async (req, res) => {
  console.log(`[Thumbnail endpoint] Hit with params:`, req.params);
  const channelId = req.params.channelId;
  const messageId = parseInt(req.params.messageId);
  if (!channelId || !messageId) {
    console.log(`[Thumbnail endpoint] Missing channelId or messageId. channelId=${channelId}, messageId=${messageId}`);
    return res.status(400).end();
  }

  const key = `${channelId}_${messageId}`;
  const thumbPath = path.join(THUMBS_DIR, `${key}.jpg`);

  // 1. Serve from disk cache
  if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 200) {
    console.log(`[Thumbnail endpoint] Serving from cache: ${thumbPath}`);
    return res.sendFile(thumbPath, { dotfiles: 'allow' }, (err) => {
      if (err) {
        console.error(`[Thumbnail endpoint] res.sendFile error:`, err);
        if (!res.headersSent) res.status(500).end();
      }
    });
  }

  // 2. If already downloading, wait for it
  if (inFlight.has(key)) {
    try {
      await inFlight.get(key);
      if (fs.existsSync(thumbPath)) {
        return res.sendFile(thumbPath, { dotfiles: 'allow' }, (err) => {
          if (err && !res.headersSent) res.status(500).send(`res.sendFile error 2: ${err.message}`);
        });
      }
    } catch (e) {}
  }

  // 3. Download fresh
  const job = (async () => {
    try {
      const buf = await getThumbnail(channelId, messageId);
      if (buf && buf.length > 200) {
        fs.writeFileSync(thumbPath, buf);
        return true;
      }
      return false;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);

  const ok = await job;
  if (ok && fs.existsSync(thumbPath)) {
    return res.sendFile(thumbPath, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(500).send(`res.sendFile error 3: ${err.message}`);
    });
  }
  res.status(404).end();
});


app.post('/api/workspace/files/delete', async (req, res) => {
    try {
        const { folderName, messageIds } = req.body;
        const actualFolder = req.body.source || folderName;
        const db = await getDatabase();
        const channelId = req.body.channelId || db.folders[actualFolder].id;
        const folderFiles = await getFiles(channelId);
        for (const id of messageIds) {
            const file = folderFiles.find(f => f.id === parseInt(id));
            if (file) {
                if (!db.trash) db.trash = [];
                db.trash.push({ channelId, messageId: file.id, name: file.name, size: file.size, mimeType: file.mimeType, date: file.date, deletedAt: new Date().toISOString() });
                await updateFolderStats(actualFolder, -file.size, -1, file.mimeType);
            }
        }
        await saveDatabase(db);
        res.json({ success: true, trashed: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/files/move-copy', async (req, res) => {
  try {
    const { fromFolder, toFolder, messageIds, mode } = req.body;
    const actualFrom = req.body.fromSource || fromFolder;
    const db = await getDatabase();
    const fromChannel = req.body.fromChannel || db.folders[actualFrom].id;
    const toChannel = db.folders[toFolder].id;
    const folderFiles = await getFiles(fromChannel);
    for (const id of messageIds) {
        const file = folderFiles.find(f => f.id === parseInt(id));
        if (file) {
            if (mode === 'move') await updateFolderStats(actualFrom, -file.size, -1, file.mimeType);
            await updateFolderStats(toFolder, file.size, 1, file.mimeType);
        }
    }
    await moveCopyFiles(fromChannel, toChannel, messageIds, mode);
    invalidateCache(fromChannel); invalidateCache(toChannel);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workspace/files/permanent-delete', async (req, res) => {
  try {
    const { channelId, messageId } = req.body;
    await deleteFiles(channelId, [messageId]);
    const db = await getDatabase();
    db.trash = db.trash.filter(f => !(f.channelId === channelId && f.messageId === messageId));
    await saveDatabase(db);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/telegram/dialogs', async (req, res) => {
  try {
    const { getTelegramChats } = require('./telegram');
    const chats = await getTelegramChats();
    res.json({ success: true, chats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/chats/action', async (req, res) => {
  const { chatId, action } = req.body;
  try {
    const { leaveOrDeleteChat } = require('./telegram');
    await leaveOrDeleteChat(chatId, action);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => { res.status(500).json({ error: 'Error', details: err.message }); });
const PORT = process.env.PORT || 3001;

// Load tokens from Firestore BEFORE accepting requests
(async () => {
  await loadTokens();
  console.log(`[Auth] Loaded ${activeTokens.size} active tokens from Firestore`);
  app.listen(PORT, () => console.log(`Running on ${PORT}`));
})();
