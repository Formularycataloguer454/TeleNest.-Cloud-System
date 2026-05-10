# TeleNest Cloud 🛡️🚀✨

**Your Private Nest in the Cloud - Powered by Telegram.**

TeleNest Cloud is a high-performance, private cloud storage solution that leverages Telegram's infinite infrastructure to provide secure, encrypted, and free storage for all your media and documents.

![TeleNest Logo](public/logo.png)

## 🌟 Key Features

- **Infinite Storage**: Harness the power of Telegram's MTProto-secured servers for unlimited file storage.
- **Node-Based Organization**: Group your files into "Nodes" (Private Channels) for superior organization.
- **Premium Interface**: A stunning, modern UI with glassmorphism, fluid animations, and dark mode.
- **Smart Categorization**: Automatically categorizes your files into Images, Videos, Audio, and Documents.
- **Private Vault**: Secure your sensitive files with an extra layer of password protection and auto-locking.
- **Instant Streaming**: Stream high-quality videos and audio directly from your cloud nodes.
- **Public Sharing**: Generate secure, shareable links for any file or folder.
- **Mobile Responsive**: Fully optimized for Desktop, Tablet, and Mobile devices.

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite, Framer Motion, Lucide React, Axios.
- **Backend**: Node.js, Express, GramJS (Telegram API).
- **Styling**: Vanilla CSS with modern variables and Glassmorphism.

## 🚀 Getting Started (Local Setup)

Follow these steps to run TeleNest Cloud on your local machine:

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [NPM](https://www.npmjs.com/) (comes with Node.js)
- A Telegram Account

### 1. Clone the Repository
```bash
git clone https://github.com/DaminduRat/TeleNest.-Cloud-System.git
cd telenest-cloud
```

### 2. Install Dependencies
Install dependencies for both the root and the server:
```bash
npm install
cd server && npm install
cd ..
```

### 3. Run the Application
Start both the backend server and the frontend development environment with one command:
```bash
npm start
```

Once started:
- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:3001`

### 4. Initial Setup
When you first open the app, it will guide you through the setup:
- Enter your Phone Number.
- Verify with the Telegram Login Code.
- TeleNest will automatically create the necessary private channels (Nodes) in your Telegram account to act as your storage engine.

## 🛡️ Privacy & Security
TeleNest is built with a **Zero-Knowledge Architecture** philosophy:
- **Local Sessions**: Your Telegram session and authorization data are stored ONLY on your local machine.
- **End-to-End**: Files move directly between your machine and Telegram's encrypted servers.
- **No Third-Party Access**: TeleNest does not use any central database for your files; it reads directly from your own Telegram account.

## 👨‍💻 Developed by
**DaminduR**  
[damindur.com](https://damindur.com)

---
*Note: This project is for educational and personal use. Ensure you comply with Telegram's Terms of Service.*
