const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const SESSION_FILE = require('path').resolve(__dirname, 'session.txt');
let sessionString = '';

if (fs.existsSync(SESSION_FILE)) {
  sessionString = fs.readFileSync(SESSION_FILE, 'utf-8');
}

const stringSession = new StringSession(sessionString);

let client = null;

async function getClient() {
  if (!client) {
    client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
    });
    await client.connect();
  }
  return client;
}

async function sendCode(phoneNumber) {
  const c = await getClient();
  const result = await c.sendCode({
    apiId,
    apiHash
  }, phoneNumber);
  return result.phoneCodeHash;
}

async function signIn(phoneNumber, phoneCodeHash, phoneCode) {
  const c = await getClient();
  try {
    await c.invoke(new Api.auth.SignIn({
      phoneNumber,
      phoneCodeHash,
      phoneCode
    }));
    fs.writeFileSync(SESSION_FILE, c.session.save());
    return { success: true };
  } catch (err) {
    if (err.message.includes('SESSION_PASSWORD_NEEDED')) {
      return { requires2FA: true };
    }
    throw err;
  }
}

async function signInWithPassword(password) {
  const c = await getClient();
  await c.signInWithPassword({ apiId, apiHash }, { password: async () => password, onError: (err) => { throw err; } });
  fs.writeFileSync(SESSION_FILE, c.session.save());
  return { success: true };
}

async function createPrivateChannel(title) {
  const c = await getClient();
  const result = await c.invoke(new Api.channels.CreateChannel({
    title,
    about: 'TeleNest Cloud Storage for ' + title,
    broadcast: true,
    megagroup: false
  }));
  const channelId = result.chats[0].id.toString();
  const channelEntity = result.chats[0];

  // Automatically archive the channel to keep the chat list clean
  try {
    // Wait a bit for Telegram to propagate the new channel
    await new Promise(r => setTimeout(r, 1000));
    
    await c.invoke(new Api.folders.EditPeerFolders({
      folderPeers: [
        new Api.InputFolderPeer({
          peer: channelEntity,
          folderId: 1 // folderId 1 is the Archive
        })
      ]
    }));
    console.log(`Archived channel: ${channelId}`);
  } catch (err) {
    console.error(`Failed to archive channel ${channelId}:`, err.message);
  }
  
  return channelId;
}

async function uploadFile(channelId, filePath, fileName) {
  const c = await getClient();
  // For channels, GramJS/Telegram requires the -100 prefix for resolution
  const peerId = channelId.startsWith('-100') ? channelId : `-100${channelId}`;
  const entity = await c.getEntity(peerId);
  const result = await c.sendFile(entity, {
    file: filePath,
    forceDocument: true,
    caption: `TeleNest Upload: ${fileName}`
  });
  return result;
}

const messageCache = new Map();

async function getFiles(channelId, forceRefresh = false) {
  const cacheKey = channelId;
  if (!forceRefresh && messageCache.has(cacheKey)) {
    const cached = messageCache.get(cacheKey);
    if (Date.now() - cached.timestamp < 300000) return cached.data;
  }

  const c = await getClient();
  const peerId = channelId.startsWith('-100') ? channelId : `-100${channelId}`;
  const messages = await c.getMessages(peerId, { limit: 1000 });
  
  const data = messages
    .filter(m => m.media)
    .map(m => {
      let name = 'Unknown File';
      let size = 0;
      if (m.message && m.message.includes('TeleNest Upload: ')) name = m.message.replace('TeleNest Upload: ', '').trim();
      
      if (m.media.document) {
        const doc = m.media.document;
        size = doc.size;
        if (name === 'Unknown File') {
          const attr = doc.attributes.find(a => a.className === 'DocumentAttributeFilename');
          if (attr) name = attr.fileName;
        }
      } else if (m.media.photo) {
        const lastSize = m.media.photo.sizes[m.media.photo.sizes.length - 1];
        size = lastSize.size || 0;
        if (name === 'Unknown File') name = `IMG_${m.id}.jpg`;
      }

      return {
        id: m.id,
        name,
        size: parseInt(size ? size.toString() : '0'),
        date: m.date,
        type: m.media.className,
        mimeType: m.media.document ? m.media.document.mimeType : (m.media.photo ? 'image/jpeg' : null),
        channelId: channelId
      };
    });

  messageCache.set(cacheKey, { timestamp: Date.now(), data });
  return data;
}

function invalidateCache(channelId) {
    messageCache.delete(channelId);
}

async function streamFile(channelId, messageId, req, res) {
  const c = await getClient();
  const peerId = channelId.startsWith('-100') ? channelId : `-100${channelId}`;
  const messages = await c.getMessages(peerId, { ids: [parseInt(messageId)] });
  if (!messages || messages.length === 0 || !messages[0].media) throw new Error('No media');
  
  const media = messages[0].media;
  let rawSize = media.document ? media.document.size : (media.photo ? media.photo.sizes[media.photo.sizes.length-1].size : 0);
  let totalSize = parseInt(rawSize ? rawSize.toString() : '0');
  let mimeType = media.document ? media.document.mimeType : 'image/jpeg';

  const range = req.headers.range;
  let start = 0, end = totalSize - 1;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
  } else {
    res.status(200);
  }

  res.setHeader('Content-Length', end - start + 1);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Connection', 'keep-alive');

  const bigInt = require('big-integer');
  const stream = c.iterDownload({
    file: media,
    offset: bigInt(start),
    limit: end - start + 1,
    requestSize: 1024 * 512, // 512KB chunks for smoother streaming
  });

  try {
    for await (const chunk of stream) {
      if (res.writableEnded) break;
      res.write(chunk);
    }
  } catch (err) {
    console.error(`[Streaming] Error:`, err.message);
  } finally {
    if (!res.writableEnded) res.end();
  }
}

async function downloadFileMedia(channelId, messageId, filePath = null) {
  const c = await getClient();
  const peerId = channelId.startsWith('-100') ? channelId : `-100${channelId}`;
  const messages = await c.getMessages(peerId, { ids: [parseInt(messageId)] });
  if (!messages || messages.length === 0 || !messages[0].media) throw new Error('No media');
  
  const media = messages[0].media;
  let name = 'file';
  if (media.document) {
    const attr = media.document.attributes.find(a => a.className === 'DocumentAttributeFilename');
    if (attr) name = attr.fileName;
  } else if (media.photo) {
    name = `IMG_${messageId}.jpg`;
  }

  const mimeType = media.document ? media.document.mimeType : (media.photo ? 'image/jpeg' : null);

  if (filePath) {
    await c.downloadMedia(media, { outputFile: filePath });
    return { name, path: filePath, mimeType };
  } else {
    const buffer = await c.downloadMedia(media, {});
    return { buffer, name, mimeType };
  }
}



async function getThumbnail(channelId, messageId) {
  try {
    const c = await getClient();
    const peerId = channelId.startsWith('-100') ? channelId : `-100${channelId}`;
    const msgs = await c.getMessages(peerId, { ids: [parseInt(messageId)] });
    if (!msgs?.[0]?.media) return null;
    const media = msgs[0].media;

    // Try each standard thumbnail size string
    for (const size of ['m', 'x', 's', 'y', 'w']) {
      try {
        const buf = await c.downloadMedia(media, { thumbSize: size });
        if (buf && buf.length > 1000) return buf; // >1KB = real image, not stripped
      } catch (e) {}
    }

    // Try integer thumb indices for documents/videos/audio covers (skip 0 which is often PhotoStrippedSize)
    for (let i = 1; i < 4; i++) {
      try {
        const buf = await c.downloadMedia(media, { thumb: i });
        if (buf && buf.length > 1000) return buf;
      } catch (e) {}
    }

    // For photos/images: download full file as thumbnail
    if (media.photo || (media.document?.mimeType?.startsWith('image/'))) {
      try {
        const buf = await c.downloadMedia(media);
        if (buf && buf.length > 0) return buf;
      } catch (e) {}
    }

    return null;
  } catch (err) {
    console.error(`[Thumb] ${channelId}_${messageId}:`, err.message);
    return null;
  }
}

async function deleteFiles(channelId, messageIds) {
  const c = await getClient();
  const peerId = channelId.startsWith('-100') ? channelId : `-100${channelId}`;
  // messageIds should be an array of integers
  const ids = Array.isArray(messageIds) ? messageIds.map(id => parseInt(id)) : [parseInt(messageIds)];
  return await c.deleteMessages(peerId, ids, { revoke: true });
}

async function moveCopyFiles(fromChannelId, toChannelId, messageIds, mode = 'copy') {
  const c = await getClient();
  const fromPeer = fromChannelId.startsWith('-100') ? fromChannelId : `-100${fromChannelId}`;
  const toPeer = toChannelId.startsWith('-100') ? toChannelId : `-100${toChannelId}`;
  const ids = Array.isArray(messageIds) ? messageIds.map(id => parseInt(id)) : [parseInt(messageIds)];
  
  // Forward messages (this works as copy)
  const result = await c.forwardMessages(toPeer, {
    fromPeer: fromPeer,
    messages: ids,
    dropAuthor: true
  });
  
  if (mode === 'move') {
    await c.deleteMessages(fromPeer, ids, { revoke: true });
  }
  
  return result;
}




async function isAuthorized() {
  const c = await getClient();
  return await c.checkAuthorization();
}

async function resetClient() {
  if (client) {
    try { await client.disconnect(); } catch (e) {}
    client = null;
  }
}

async function getMe() {
    const c = await getClient();
    return await c.getMe();
}

async function archiveChannels(channelIds) {
    const c = await getClient();
    const folderPeers = [];
    
    console.log(`Starting archival for ${channelIds.length} IDs...`);
    
    for (const id of channelIds) {
        if (!id || isNaN(Number(id))) {
            console.log(`Skipping non-numeric ID: ${id}`);
            continue;
        }
        
        try {
            const strId = id.toString();
            const peerId = strId.startsWith('-100') ? strId : `-100${strId}`;
            
            // GramJS needs the actual input peer for folder operations
            const inputPeer = await c.getInputEntity(peerId);
            
            folderPeers.push(new Api.InputFolderPeer({
                peer: inputPeer,
                folderId: 1
            }));
            console.log(`Prepared archive peer: ${peerId}`);
        } catch (e) {
            console.error(`Could not resolve peer for ID ${id}:`, e.message);
        }
    }
    
    if (folderPeers.length > 0) {
        try {
            await c.invoke(new Api.folders.EditPeerFolders({ folderPeers }));
            console.log('Archival invoke successful.');
        } catch (err) {
            console.error('Archival invoke failed:', err.message);
            throw err;
        }
    } else {
        console.log('No valid peers to archive.');
    }
}

async function deleteChannels(channelIds) {
    const c = await getClient();
    for (const id of channelIds) {
        if (!id || isNaN(Number(id))) continue;
        try {
            const strId = id.toString();
            const peerId = strId.startsWith('-100') ? strId : `-100${strId}`;
            const inputPeer = await c.getInputEntity(peerId);
            await c.invoke(new Api.channels.DeleteChannel({
                channel: inputPeer
            }));
            console.log(`Deleted channel: ${peerId}`);
        } catch (e) {
            console.error(`Failed to delete channel ${id}:`, e.message);
        }
    }
}

async function getTelegramChats() {
  const c = await getClient();
  const dialogs = await c.getDialogs({ limit: 100 });
  
  const chats = {
    users: [],
    groups: [],
    channels: []
  };

  for (const d of dialogs) {
    if (d.title && d.title.startsWith('TeleNest')) continue;
    
    const isAdmin = !!(d.entity && d.entity.adminRights);
    const isCreator = !!(d.entity && d.entity.creator);
    
    const chatInfo = { 
      id: d.id.toString(), 
      name: d.title || 'Unknown', 
      unread: d.unreadCount, 
      date: d.date,
      isAdmin,
      isCreator
    };

    if (d.isUser) chats.users.push(chatInfo);
    else if (d.isGroup) chats.groups.push(chatInfo);
    else if (d.isChannel) chats.channels.push(chatInfo);
  }
  return chats;
}

async function leaveOrDeleteChat(chatId, action) {
  const c = await getClient();
  const peer = await c.getInputEntity(chatId);

  if (action === 'delete' || action === 'leave') {
    // Determine if it's a channel/megagroup or a normal group
    const entity = await c.getEntity(peer);
    const isChannel = entity.className === 'Channel';

    if (action === 'delete') {
      if (isChannel) {
        await c.invoke(new Api.channels.DeleteChannel({ channel: peer }));
      } else {
        // Normal groups don't have a "delete for all" invoke in standard API like channels, 
        // usually one leaves and it disappears from list, or if creator they can't delete it easily 
        // without deleting all messages. For simplicity, we'll use leave.
        await c.invoke(new Api.messages.DeleteChatUser({ chatId: entity.id, userId: "me" }));
      }
    } else {
      if (isChannel) {
        await c.invoke(new Api.channels.LeaveChannel({ channel: peer }));
      } else {
        await c.invoke(new Api.messages.DeleteChatUser({ chatId: entity.id, userId: "me" }));
      }
    }
  }
  return { success: true };
}

module.exports = {
  getClient,
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
  streamFile,
  archiveChannels,
  deleteChannels,
  getTelegramChats,
  leaveOrDeleteChat
};
