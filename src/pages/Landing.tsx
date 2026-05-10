import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Cloud, Shield, Zap, Send, Phone, KeyRound, Lock, Share2, Trash2, PlayCircle } from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';

const features = [
  { icon: <Shield size={32} color="#10b981" />, title: "Secure Session Privacy", desc: "Your Telegram session is encrypted and stored only on your local device." },
  { icon: <Lock size={32} color="#3b82f6" />, title: "Private Cloud Nodes", desc: "Files are stored in your own private channels with Telegram's MTProto security." },
  { icon: <Share2 size={32} color="#facc15" />, title: "Public Sharing", desc: "Generate secure, shareable links for any file or folder in your cloud." },
  { icon: <PlayCircle size={32} color="#ec4899" />, title: "Instant Streaming", desc: "Watch videos and listen to music directly from your Telegram cloud nodes." },
  { icon: <Trash2 size={32} color="#ef4444" />, title: "Smart Trash Vault", desc: "Accidentally deleted? Recover files easily or let them auto-clean after 3 days." },
  { icon: <img src="/logo.png" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />, title: "Infinite Storage", desc: "Leverage Telegram's massive infrastructure for unlimited file storage." },
];

const FeatureCarousel = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '140px' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="glass-panel"
          style={{ 
            padding: '24px 40px', 
            width: '100%', 
            maxWidth: '800px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '32px',
            border: '1px solid rgba(255,255,255,0.05)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            borderRadius: '24px',
            textAlign: 'left'
          }}
        >
          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{features[index].icon}</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tg-blue)', marginBottom: '4px' }}>{features[index].title}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>{features[index].desc}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {features.map((_, i) => (
              <div key={i} style={{ height: i === index ? '20px' : '6px', width: '6px', borderRadius: '3px', background: i === index ? 'var(--tg-blue)' : 'rgba(255,255,255,0.1)', transition: '0.3s' }} />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const Landing = () => {
  const navigate = useNavigate();
  
  const [step, setStep] = useState<'INITIAL' | 'PHONE' | 'CODE' | '2FA'>('INITIAL');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
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
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleSendCode = async () => {
    try {
      setIsLoading(true);
      setError('');
      const res = await fetch(`${API_BASE}/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setPhoneCodeHash(data.phoneCodeHash);
      setStep('CODE');
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    try {
      setIsLoading(true);
      setError('');
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, phoneCodeHash, phoneCode })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.requires2FA) {
        setStep('2FA');
      } else if (data.success) {
        navigate('/init');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify code');
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FA = async () => {
    try {
      setIsLoading(true);
      setError('');
      const res = await fetch(`${API_BASE}/auth/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.success) {
        navigate('/init');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify password');
    } finally {
      setIsLoading(false);
    }
  };

  const renderForm = () => {
    if (step === 'INITIAL') {
      return (
        <motion.button 
          className="btn-primary"
          style={{ margin: '0 auto', fontSize: '1.2rem', padding: '16px 36px', borderRadius: '16px' }}
          onClick={() => setStep('PHONE')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Send size={24} />
          Login with Telegram
        </motion.button>
      );
    }

    return (
      <motion.div 
        className="glass-panel"
        style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px', margin: '0 auto' }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        {error && <div style={{ color: '#ef4444', fontSize: '0.9rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '8px' }}>{error}</div>}
        
        {step === 'PHONE' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <Phone size={20} color="var(--tg-blue)" />
              <input 
                type="text" 
                placeholder="Phone Number (e.g. +1234567890)" 
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%' }}
              />
            </div>
            <button className="btn-primary" onClick={handleSendCode} disabled={isLoading} style={{ width: '100%', justifyContent: 'center' }}>
              {isLoading ? 'Sending...' : 'Send Code'}
            </button>
          </>
        )}

        {step === 'CODE' && (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>We've sent a code to your Telegram app.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <KeyRound size={20} color="var(--tg-blue)" />
              <input 
                type="text" 
                placeholder="Enter Login Code" 
                value={phoneCode}
                onChange={e => setPhoneCode(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%' }}
              />
            </div>
            <button className="btn-primary" onClick={handleVerifyCode} disabled={isLoading} style={{ width: '100%', justifyContent: 'center' }}>
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </button>
          </>
        )}

        {step === '2FA' && (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>Your account is protected with 2-Step Verification.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <Lock size={20} color="var(--accent-purple)" />
              <input 
                type="password" 
                placeholder="Enter Password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%' }}
              />
            </div>
            <button className="btn-primary" onClick={handle2FA} disabled={isLoading} style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent-purple) 0%, #6d28d9 100%)' }}>
              {isLoading ? 'Verifying...' : 'Unlock'}
            </button>
          </>
        )}
      </motion.div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', padding: '20px' }}>
      
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ textAlign: 'center', maxWidth: '800px', zIndex: 10 }}
      >
        <motion.div 
          className="glass-panel"
          style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', marginBottom: '24px' }}
          animate={{ boxShadow: ['0 0 0 0 rgba(42, 171, 238, 0.4)', '0 0 0 20px rgba(42, 171, 238, 0)', '0 0 0 0 rgba(42, 171, 238, 0)'] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <img src="/logo.png" alt="TeleNest Logo" style={{ width: '120px', height: '120px', objectFit: 'contain' }} />
        </motion.div>
        
        <h1 style={{ fontSize: '4rem', marginBottom: '16px', letterSpacing: '-1px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '16px' }}>
            <span style={{ fontSize: '4rem', fontWeight: 900, color: '#fff', letterSpacing: '-1px', fontFamily: 'var(--font-brand)' }}>TeleNest<span style={{ color: 'var(--tg-blue)' }}>.</span></span>
          </div>
          Your <span className="text-gradient-blue">Private Nest</span> in the Cloud
        </h1>
        
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '48px', maxWidth: '600px', margin: '0 auto 48px auto', lineHeight: 1.6 }}>
          Experience the most secure Telegram-powered cloud. TeleNest creates a private, encrypted bridge to your media with zero-knowledge architecture.
        </p>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {renderForm()}
          </motion.div>
        </AnimatePresence>

      </motion.div>

      {step === 'INITIAL' && (
        <div style={{ marginTop: '40px', width: '100%', maxWidth: '1000px', overflow: 'hidden', position: 'relative', padding: '10px 0' }}>
            <FeatureCarousel />
        </div>
      )}

      {deferredPrompt && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel"
          onClick={handleInstallClick}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            border: '1px solid var(--tg-blue)',
            color: 'var(--tg-blue)',
            zIndex: 100,
            borderRadius: '12px',
            fontSize: '0.9rem',
            fontWeight: '600'
          }}
          whileHover={{ scale: 1.05, background: 'rgba(42, 171, 238, 0.1)' }}
          whileTap={{ scale: 0.95 }}
        >
          <Zap size={18} />
          Install Desktop App
        </motion.button>
      )}

      {/* Landing Footer */}
      <div style={{ position: 'absolute', bottom: '32px', left: 0, right: 0, textAlign: 'center', opacity: 0.4 }}>
          <p style={{ fontSize: '0.8rem', marginBottom: '8px' }}>&copy; 2026 TeleNest Cloud. All rights reserved.</p>
          <a 
            href="https://damindur.com" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ fontSize: '0.85rem', color: '#fff', textDecoration: 'none', fontWeight: 600 }}
            onMouseOver={(e) => e.currentTarget.style.color = 'var(--tg-blue)'}
            onMouseOut={(e) => e.currentTarget.style.color = '#fff'}
          >
            Developed by DaminduR
          </a>
      </div>
    </div>
  );
};

export default Landing;
