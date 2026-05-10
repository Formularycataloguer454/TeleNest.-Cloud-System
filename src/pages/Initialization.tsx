import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CloudCog, CheckCircle, Folder } from 'lucide-react';

const steps = [
  "Authenticating Telegram Session...",
  "Fetching Profile & Telegram ID...",
  "Generating Personal Cloud Workspace...",
  "Creating Root Directories (Telegram Channels)...",
  "Mapping Telegram Storage Channels...",
  "Initializing Upload Engine...",
  "Workspace Ready."
];

const Initialization = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [createdFolders, setCreatedFolders] = useState<string[]>([]);
  const [isApiDone, setIsApiDone] = useState(false);

  useEffect(() => {
    // Phase 1: Simulation for first few steps
    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < 3) {
        stepIndex++;
        setCurrentStep(stepIndex);
      } else {
        clearInterval(interval);
      }
    }, 1500);

    // Phase 2: Real backend initialization
    fetch('http://localhost:3001/api/workspace/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        // Show actual folders created/mapped
        const folderNames = Object.keys(data.db);
        setCreatedFolders(folderNames);
        
        // Rapidly complete remaining steps
        setCurrentStep(4);
        setTimeout(() => setCurrentStep(5), 800);
        setTimeout(() => {
          setCurrentStep(6);
          setIsApiDone(true);
          setTimeout(() => navigate('/dashboard'), 1500);
        }, 1600);
      }
    })
    .catch(err => {
      console.error("Workspace init failed", err);
      // Handle error UX here if needed
    });

    return () => clearInterval(interval);
  }, [navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', padding: '20px' }}>
      
      <motion.div 
        className="glass-panel"
        style={{ padding: '48px', width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
        >
          <CloudCog size={64} color="var(--tg-blue)" />
        </motion.div>

        <div style={{ textAlign: 'center', width: '100%' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '8px' }}>Initializing Workspace</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Please wait while we create private Telegram channels to store your files.</p>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
          <motion.div 
            style={{ height: '100%', background: 'linear-gradient(90deg, var(--tg-blue), var(--accent-purple))' }}
            initial={{ width: '0%' }}
            animate={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
            transition={{ ease: "easeInOut" }}
          />
        </div>

        {/* Steps display */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {steps.map((step, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              animate={idx <= currentStep ? { opacity: idx === currentStep ? 1 : 0.4, x: 0 } : { opacity: 0, x: -20 }}
              style={{ display: idx <= currentStep ? 'flex' : 'none', alignItems: 'center', gap: '12px', fontSize: '1.1rem' }}
            >
              {idx < currentStep ? (
                <CheckCircle size={20} color="var(--accent-cyan)" />
              ) : (
                <motion.div 
                  className="spinner" 
                  style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--tg-blue)', borderRadius: '50%' }}
                />
              )}
              <span style={{ color: idx === currentStep ? '#fff' : 'var(--text-secondary)' }}>{step}</span>
            </motion.div>
          ))}
        </div>

        {/* Folder Generation Animation */}
        {createdFolders.length > 0 && (
          <div style={{ width: '100%', marginTop: '16px' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Creating Virtual Database (Channels):</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {createdFolders.map((folder, idx) => (
                <motion.div
                  key={idx}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <Folder size={16} color="var(--tg-blue)" />
                  <span style={{ fontSize: '0.9rem' }}>{folder}</span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

      </motion.div>

      {/* Developer Credit */}
      <div style={{ marginTop: '32px', opacity: 0.5 }}>
          <a 
            href="https://damindur.com" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ fontSize: '0.85rem', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
            onMouseOver={(e) => e.currentTarget.style.color = 'var(--tg-blue)'}
            onMouseOut={(e) => e.currentTarget.style.color = '#fff'}
          >
            <span>Developed by <span style={{ fontWeight: 800 }}>DaminduR</span></span>
          </a>
      </div>
    </div>
  );
};

export default Initialization;
