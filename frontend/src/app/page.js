'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Settings, 
  Image as ImageIcon, 
  Download, 
  RefreshCw, 
  Copy, 
  Trash2, 
  Lock, 
  Maximize2, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  ExternalLink,
  Plus
} from 'lucide-react';
import { saveGeneration, getGenerations, deleteGeneration, clearAllGenerations } from '../utils/db';

const MODELS = [
  { 
    id: 'SDXL', 
    name: 'Photorealistic XL (SDXL)', 
    description: 'Photorealistic All-Purpose v4.0',
    base: 'SDXL 1.0',
    civitUrl: 'https://civitai.com/models/1759168'
  },
  { 
    id: 'Flux', 
    name: 'Pulsar Flux (Flux)', 
    description: 'Male NSFW Base Model v0.1 fp8',
    base: 'Flux.1 Dev',
    civitUrl: 'https://civitai.com/models/990314'
  },
  { 
    id: 'SD15', 
    name: 'GAIJourney 2.0 (SD 1.5)', 
    description: 'Gay Muscular Sexy Man Men v2.0',
    base: 'SD 1.5',
    civitUrl: 'https://civitai.com/models/1820935'
  }
];

const ASPECT_RATIOS = {
  SD15: [
    { label: '1:1 Square', width: 512, height: 512 },
    { label: '4:3 Standard', width: 768, height: 576 },
    { label: '3:4 Portrait', width: 576, height: 768 },
    { label: '16:9 Widescreen', width: 768, height: 432 },
    { label: '9:16 Vertical', width: 432, height: 768 },
  ],
  SDXL: [
    { label: '1:1 Square', width: 1024, height: 1024 },
    { label: '4:3 Standard', width: 1152, height: 864 },
    { label: '3:4 Portrait', width: 864, height: 1152 },
    { label: '16:9 Widescreen', width: 1216, height: 832 },
    { label: '9:16 Vertical', width: 832, height: 1216 },
  ],
  Flux: [
    { label: '1:1 Square', width: 1024, height: 1024 },
    { label: '4:3 Standard', width: 1152, height: 864 },
    { label: '3:4 Portrait', width: 864, height: 1152 },
    { label: '16:9 Widescreen', width: 1216, height: 832 },
    { label: '9:16 Vertical', width: 832, height: 1216 },
  ]
};

const SCHEDULERS = ['Euler a', 'DPM++ 2M Karras'];

const PRESET_PROMPTS = {
  SDXL: [
    "a highly detailed, cinematic photograph of a futuristic cyberpunk city street at night, glowing neon signs, wet asphalt reflecting violet and blue lights, volumetric fog, realistic lighting, 8k resolution",
    "a portrait photograph of a handsome male athlete, muscular body, athletic build, detailed skin texture, dramatic studio lighting, soft shadows, sharp focus, shot on 85mm lens",
    "an oil painting of a mystical forest with glowing mushrooms, ancient trees, fireflies floating in the air, fantasy, ethereal, moody, hyper-detailed",
    "gorgeous greek statue of a male athlete, marble texture with subtle cracks, dark museum background, dramatic spotlight, shadows, high contrast"
  ],
  SD15: [
    "handsome athletic man, muscular chest and abs, short hair, smiling, warm lighting, highly detailed, realistic eyes, cinematic, photorealistic",
    "muscular male model, shirtless, wet skin, beach background, sunset golden hour lighting, sharp focus, 8k",
    "handsome soldier, strong jawline, muscular build, tactical gear, dramatic lighting, detailed facial features, high resolution",
    "a realistic painting of a muscular warrior standing on a mountain peak, sunset background, epic pose, detailed armour"
  ],
  Flux: [
    "photo of a handsome muscular man in a modern luxury apartment, soft natural light, short beard, cinematic, highly detailed skin texture, photorealistic, 8k",
    "cinematic close-up portrait of a muscular athletic man, sharp focus, outdoor lighting, detailed eyes, photorealistic",
    "artistic black and white photography of a muscular male torso, dramatic chiaroscuro lighting, deep shadows, fine art, high detail",
    "candid shot of a handsome athletic man laughing, casual clothes, coffee shop background, soft bokeh, warm summer vibes"
  ]
};

export default function GeneratorPage() {
  // Config state
  const [modelType, setModelType] = useState('SDXL');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, distorted, ugly, extra limbs, bad hands, cartoon');
  const [aspectRatio, setAspectRatio] = useState(0); // Index of selected aspect ratio
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(30);
  const [cfgScale, setCfgScale] = useState(5.5);
  const [scheduler, setScheduler] = useState('Euler a');
  const [seed, setSeed] = useState('');
  const [clipSkip, setClipSkip] = useState(2);
  const [outputFormat, setOutputFormat] = useState('JPEG');
  const [outputQuality, setOutputQuality] = useState(90);
  
  // UI states
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genTime, setGenTime] = useState(0);
  const [genStatusText, setGenStatusText] = useState('Initializing...');
  const [currentJobId, setCurrentJobId] = useState(null);
  const [activeTab, setActiveTab] = useState('canvas'); // 'canvas' or 'history'
  
  // Security
  const [password, setPassword] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  
  // Image result & history
  const [currentImage, setCurrentImage] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [copiedPromptId, setCopiedPromptId] = useState(null);

  const timerRef = useRef(null);

  // Load password and history on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPass = localStorage.getItem('app_password');
      if (savedPass) {
        setPassword(savedPass);
      }
      loadHistory();
    }
  }, []);

  // Update width/height when model or aspect ratio changes
  useEffect(() => {
    const presets = ASPECT_RATIOS[modelType] || ASPECT_RATIOS.SDXL;
    const preset = presets[aspectRatio] || presets[0];
    setWidth(preset.width);
    setHeight(preset.height);
  }, [modelType, aspectRatio]);

  // Adjust defaults when model changes
  useEffect(() => {
    setAspectRatio(0); // reset to square
    if (modelType === 'SD15') {
      setSteps(25);
      setCfgScale(7.0);
      setScheduler('Euler a');
    } else if (modelType === 'SDXL') {
      setSteps(30);
      setCfgScale(5.5);
      setScheduler('Euler a');
    } else if (modelType === 'Flux') {
      setSteps(20);
      setCfgScale(3.5); // Flux Dev uses guidance scale, sweet spot around 3.5
    }
  }, [modelType]);

  // Handle generation timer
  useEffect(() => {
    if (isGenerating) {
      timerRef.current = setInterval(() => {
        setGenTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isGenerating]);

  const loadHistory = async () => {
    const items = await getGenerations();
    setHistory(items);
  };

  const handleApplyPresetPrompt = () => {
    const presets = PRESET_PROMPTS[modelType];
    const randomIndex = Math.floor(Math.random() * presets.length);
    setPrompt(presets[randomIndex]);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    localStorage.setItem('app_password', password);
    setShowLockModal(false);
    setIsLocked(false);
  };

  const handleStartGeneration = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setGenTime(0);
    setGenStatusText('Submitting to RunPod...');
    setCurrentImage(null);
    setCurrentJobId(null);
    setActiveTab('canvas');

    const payload = {
      modelType,
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      seed: seed ? parseInt(seed) : null,
      scheduler,
      clipSkip,
      outputFormat,
      outputQuality,
      password
    };

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setIsLocked(true);
          setShowLockModal(true);
          throw new Error('Access password required or invalid.');
        }
        throw new Error(data.error || 'Failed to start generation');
      }

      const { jobId } = data;
      setCurrentJobId(jobId);
      setGenStatusText('Queued (Waiting for GPU)...');
      
      // Start polling
      pollJobStatus(jobId);
    } catch (error) {
      console.error(error);
      alert(error.message || 'An error occurred during generation request.');
      setIsGenerating(false);
    }
  };

  const pollJobStatus = async (jobId) => {
    const pollInterval = 1500;
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/status/${jobId}?modelType=${modelType}&password=${encodeURIComponent(password)}`);
        
        if (!response.ok) {
          if (response.status === 401) {
            setIsLocked(true);
            setShowLockModal(true);
            setIsGenerating(false);
            return;
          }
          throw new Error('Failed to query job status');
        }

        const data = await response.json();
        attempts++;

        if (data.status === 'COMPLETED') {
          setIsGenerating(false);
          setGenStatusText('Done!');
          
          if (data.output && data.output.image) {
            const formattedImage = {
              image: `data:image/${data.output.image_format || 'jpeg'};base64,${data.output.image}`,
              prompt: prompt,
              negativePrompt: modelType !== 'Flux' ? negativePrompt : '',
              modelType,
              seed: data.output.seed,
              width,
              height,
              steps,
              cfgScale,
              scheduler: modelType !== 'Flux' ? scheduler : 'FlowMatch',
              timestamp: Date.now(),
            };
            
            setCurrentImage(formattedImage);
            
            // Save to IndexedDB local gallery
            await saveGeneration(formattedImage);
            loadHistory();
          } else if (data.output && data.output.error) {
            throw new Error(data.output.error);
          } else {
            throw new Error('No output image returned from worker.');
          }
        } else if (data.status === 'FAILED') {
          setIsGenerating(false);
          throw new Error(data.delayTime ? `Generation failed on GPU. Ensure your RunPod container is running and has enough VRAM.` : `Generation failed: ${data.error || 'Unknown error'}`);
        } else if (data.status === 'IN_PROGRESS') {
          setGenStatusText(`Generating on GPU... (${attempts}s)`);
          setTimeout(checkStatus, pollInterval);
        } else {
          // IN_QUEUE or other
          setGenStatusText(`In queue... Position unknown (${attempts}s)`);
          setTimeout(checkStatus, pollInterval);
        }
      } catch (error) {
        console.error(error);
        alert(error.message || 'Error checking generation status.');
        setIsGenerating(false);
      }
    };

    setTimeout(checkStatus, pollInterval);
  };

  const handleCopyPrompt = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedPromptId(id);
    setTimeout(() => setCopiedPromptId(null), 2000);
  };

  const handleDownloadImage = (imgSrc, promptText) => {
    const link = document.createElement('a');
    link.href = imgSrc;
    const cleanPrompt = promptText.slice(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.download = `civit_gen_${cleanPrompt || 'image'}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteItem = async (id, e) => {
    if (e) e.stopPropagation();
    if (confirm('Delete this image from your local history?')) {
      await deleteGeneration(id);
      loadHistory();
      if (selectedHistoryItem && selectedHistoryItem.id === id) {
        setSelectedHistoryItem(null);
      }
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to delete ALL images from your local browser history? This cannot be undone.')) {
      await clearAllGenerations();
      loadHistory();
    }
  };

  const handleReuseSettings = (item) => {
    setModelType(item.modelType);
    setPrompt(item.prompt);
    if (item.negativePrompt) setNegativePrompt(item.negativePrompt);
    setWidth(item.width);
    setHeight(item.height);
    setSteps(item.steps);
    setCfgScale(item.cfgScale);
    if (item.scheduler) setScheduler(item.scheduler);
    if (item.seed) setSeed(item.seed.toString());
    
    // Find closest aspect ratio preset
    const presets = ASPECT_RATIOS[item.modelType] || ASPECT_RATIOS.SDXL;
    const matchIdx = presets.findIndex(p => p.width === item.width && p.height === item.height);
    if (matchIdx !== -1) setAspectRatio(matchIdx);

    setActiveTab('canvas');
    setSelectedHistoryItem(null);
    
    // Smooth scroll sidebar to top
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.scrollTop = 0;
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header glass-panel" style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="animate-pulse-glow" style={{ background: 'var(--accent-gradient)', borderRadius: '8px', padding: '6px', display: 'flex' }}>
            <Sparkles size={20} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.025em', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Sneaky Imagen
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>CivitAI GPU Generator Console</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {MODELS.map(m => (
              <a 
                key={m.id} 
                href={m.civitUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="badge badge-gray" 
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                title={`${m.name} (${m.base})`}
              >
                {m.id}
                <ExternalLink size={10} />
              </a>
            ))}
          </div>

          <button 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', fontSize: '13px' }}
            onClick={() => setShowLockModal(true)}
          >
            <Lock size={14} color={password ? '#34d399' : 'var(--text-secondary)'} />
            {password ? 'Configured' : 'Lock API'}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="app-main">
        {/* Left Side: Controls */}
        <aside className="sidebar" id="app-sidebar">
          {/* Model selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>CivitAI Base Model</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {MODELS.map((model) => (
                <div 
                  key={model.id}
                  onClick={() => setModelType(model.id)}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: modelType === model.id ? 'var(--accent-purple)' : 'var(--border-color)',
                    background: modelType === model.id ? 'rgba(139, 92, 246, 0.1)' : 'rgba(0, 0, 0, 0.2)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  className="glass-panel-hover"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: modelType === model.id ? 'white' : 'var(--text-primary)' }}>{model.name}</span>
                    <span className="badge badge-gray" style={{ fontSize: '9px' }}>{model.base}</span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>{model.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Prompt</label>
              <button 
                onClick={handleApplyPresetPrompt} 
                style={{ fontSize: '11px', color: '#a78bfa', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
              >
                <Sparkles size={11} />
                Random Prompt
              </button>
            </div>
            <textarea 
              className="input-field"
              rows={4}
              placeholder="What would you like to generate? Be descriptive..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{ resize: 'none', width: '100%', fontSize: '13px', lineHeight: '1.4' }}
            />
          </div>

          {/* Negative Prompt (Hidden for Flux) */}
          {modelType !== 'Flux' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Negative Prompt</label>
              <textarea 
                className="input-field"
                rows={2}
                placeholder="blurry, low quality, distorted..."
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                style={{ resize: 'none', width: '100%', fontSize: '13px', lineHeight: '1.4' }}
              />
            </div>
          )}

          {/* Aspect Ratio Presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Aspect Ratio Preset</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
              {(ASPECT_RATIOS[modelType] || ASPECT_RATIOS.SDXL).map((p, idx) => (
                <button
                  key={p.label}
                  onClick={() => setAspectRatio(idx)}
                  className="btn-secondary"
                  style={{
                    padding: '8px 2px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: '600',
                    border: '1px solid',
                    borderColor: aspectRatio === idx ? 'var(--accent-purple)' : 'var(--border-color)',
                    background: aspectRatio === idx ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                  }}
                  title={p.label}
                >
                  <span>{p.label.split(' ')[0]}</span>
                  <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>{p.width}x{p.height}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Collapsible Advanced Settings */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '13px',
                fontWeight: '600',
                padding: 0,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Settings size={14} />
                Advanced Parameters
              </span>
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAdvanced && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
                {/* Steps */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>Inference Steps</span>
                    <span style={{ color: 'white', fontWeight: '600' }}>{steps}</span>
                  </div>
                  <input 
                    type="range" 
                    min={10} 
                    max={modelType === 'Flux' ? 50 : 100} 
                    value={steps} 
                    onChange={(e) => setSteps(parseInt(e.target.value))}
                  />
                </div>

                {/* CFG / Guidance Scale */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>{modelType === 'Flux' ? 'Guidance Scale' : 'CFG Scale'}</span>
                    <span style={{ color: 'white', fontWeight: '600' }}>{cfgScale.toFixed(1)}</span>
                  </div>
                  <input 
                    type="range" 
                    min={1} 
                    max={20} 
                    step={0.5}
                    value={cfgScale} 
                    onChange={(e) => setCfgScale(parseFloat(e.target.value))}
                  />
                </div>

                {/* Scheduler (Not for Flux) */}
                {modelType !== 'Flux' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Sampler Scheduler</label>
                    <select 
                      className="input-field" 
                      value={scheduler} 
                      onChange={(e) => setScheduler(e.target.value)}
                      style={{ width: '100%', padding: '8px' }}
                    >
                      {SCHEDULERS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                {/* Clip Skip (SDXL only) */}
                {modelType === 'SDXL' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <span>Clip Skip</span>
                      <span style={{ color: 'white', fontWeight: '600' }}>{clipSkip}</span>
                    </div>
                    <input 
                      type="range" 
                      min={1} 
                      max={4} 
                      value={clipSkip} 
                      onChange={(e) => setClipSkip(parseInt(e.target.value))}
                    />
                  </div>
                )}

                {/* Custom Seed */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Seed (Leave blank for random)</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    placeholder="Random seed..."
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    style={{ padding: '8px' }}
                  />
                </div>

                {/* Format and Quality */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Format</label>
                    <select 
                      className="input-field"
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value)}
                      style={{ padding: '8px' }}
                    >
                      <option value="JPEG">JPEG</option>
                      <option value="PNG">PNG</option>
                    </select>
                  </div>
                  {outputFormat === 'JPEG' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Quality ({outputQuality}%)</label>
                      <input 
                        type="range" 
                        min={50} 
                        max={100} 
                        value={outputQuality} 
                        onChange={(e) => setOutputQuality(parseInt(e.target.value))}
                        style={{ height: '32px' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Large Generate Button */}
          <button 
            className="btn-primary" 
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '15px',
            }}
            disabled={isGenerating || !prompt.trim()}
            onClick={handleStartGeneration}
          >
            {isGenerating ? (
              <>
                <RefreshCw size={18} className="animate-spin-fast" />
                <span>Generating ({genTime}s)...</span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span>Generate Image</span>
              </>
            )}
          </button>
        </aside>

        {/* Right Side: Workspace Canvas & Gallery */}
        <section className="workspace">
          {/* Tabs Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setActiveTab('canvas')}
                className="btn-secondary"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: '600',
                  background: activeTab === 'canvas' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  color: activeTab === 'canvas' ? 'white' : 'var(--text-secondary)'
                }}
              >
                Canvas
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className="btn-secondary"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: '600',
                  background: activeTab === 'history' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  color: activeTab === 'history' ? 'white' : 'var(--text-secondary)'
                }}
              >
                History ({history.length})
              </button>
            </div>

            {activeTab === 'history' && history.length > 0 && (
              <button 
                onClick={handleClearHistory}
                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Trash2 size={12} />
                Clear All
              </button>
            )}
          </div>

          {/* Content Area */}
          {activeTab === 'canvas' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
              {isGenerating ? (
                /* Generating Loader State */
                <div 
                  className="glass-panel animate-pulse-glow" 
                  style={{ 
                    width: '100%', 
                    maxWidth: '500px', 
                    aspectRatio: `${width}/${height}`,
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '24px',
                    border: '1px solid rgba(139, 92, 246, 0.2)'
                  }}
                >
                  <div className="flex-center animate-spin-slow" style={{ width: '64px', height: '64px', background: 'rgba(139, 92, 246, 0.1)', border: '2px dashed var(--accent-purple)', borderRadius: '50%' }}>
                    <RefreshCw size={24} color="var(--accent-purple)" className="animate-spin-fast" />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontWeight: '600', fontSize: '15px' }}>{genStatusText}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Time Elapsed: {genTime}s</p>
                  </div>
                  {/* Fake Progress Bar */}
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '99px', overflow: 'hidden', marginTop: '12px' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        background: 'var(--accent-gradient)', 
                        width: `${Math.min((genTime / (modelType === 'Flux' ? 22 : 12)) * 100, 95)}%`,
                        transition: 'width 1s ease'
                      }} 
                    />
                  </div>
                </div>
              ) : currentImage ? (
                /* Generation Result State */
                <div className="animate-scale-in" style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div 
                    className="glass-panel" 
                    style={{ 
                      position: 'relative', 
                      borderRadius: '16px',
                      overflow: 'hidden',
                      aspectRatio: `${width}/${height}`,
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={currentImage.image} 
                      alt="Generated AI artwork" 
                      style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                    />
                    
                    {/* Floating Overlay Controls */}
                    <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => setSelectedHistoryItem(currentImage)}
                        className="flex-center"
                        style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', border: '1px solid var(--border-color)', color: 'white' }}
                        title="Zoom Image"
                      >
                        <Maximize2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDownloadImage(currentImage.image, currentImage.prompt)}
                        className="flex-center"
                        style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', border: '1px solid var(--border-color)', color: 'white' }}
                        title="Download Image"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Metadata display */}
                  <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge badge-purple">{currentImage.modelType} Model</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Seed: {currentImage.seed}</span>
                    </div>
                    <p style={{ fontSize: '13px', lineHeight: '1.4', color: 'var(--text-primary)', marginTop: '4px' }}>
                      {currentImage.prompt}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '4px' }}>
                      <button 
                        onClick={() => handleCopyPrompt(currentImage.prompt, 'current')}
                        className="btn-secondary"
                        style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center' }}
                      >
                        {copiedPromptId === 'current' ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                        {copiedPromptId === 'current' ? 'Copied' : 'Copy Prompt'}
                      </button>
                      <button 
                        onClick={() => handleReuseSettings(currentImage)}
                        className="btn-secondary"
                        style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center' }}
                      >
                        <RefreshCw size={12} />
                        Reuse Settings
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Idle State */
                <div 
                  className="glass-panel" 
                  style={{ 
                    width: '100%', 
                    maxWidth: '500px', 
                    aspectRatio: '1',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '32px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <ImageIcon size={22} color="var(--text-secondary)" />
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>No Image Generated Yet</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '300px' }}>
                    Configure the parameters on the left and hit generate to spin up your RunPod GPU worker.
                  </p>
                  {/* Hint button to load a preset */}
                  <button 
                    onClick={handleApplyPresetPrompt}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 12px', borderRadius: '6px', marginTop: '8px' }}
                  >
                    Quick Start (Load Preset Prompt)
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* History Gallery Grid State */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {history.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '300px', gap: '12px' }}>
                  <ImageIcon size={32} color="var(--text-muted)" />
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Your browser local gallery is empty.</p>
                </div>
              ) : (
                <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
                  {history.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => setSelectedHistoryItem(item)}
                      className="glass-panel glass-panel-hover"
                      style={{ 
                        borderRadius: '12px', 
                        overflow: 'hidden', 
                        cursor: 'pointer',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {/* Grid Image Preview */}
                      <div style={{ position: 'relative', aspectRatio: '1', width: '100%', background: '#000' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={item.image} 
                          alt="Thumbnail preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                        <div style={{ position: 'absolute', top: '6px', right: '6px' }}>
                          <span className="badge badge-purple" style={{ fontSize: '8px', padding: '2px 5px' }}>{item.modelType}</span>
                        </div>
                      </div>

                      {/* Brief details footer */}
                      <div style={{ padding: '8px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <p style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.prompt}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', fontSize: '9px', marginTop: '2px' }}>
                          <span>Seed: {item.seed}</span>
                          <button 
                            onClick={(e) => handleDeleteItem(item.id, e)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', padding: '2px', display: 'flex' }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Lightbox / Inspector Dialog */}
      {selectedHistoryItem && (
        <div 
          className="animate-fade-in"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(5, 3, 11, 0.85)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
            padding: '24px'
          }}
          onClick={() => setSelectedHistoryItem(null)}
        >
          <div 
            className="glass-panel animate-scale-in"
            style={{
              width: '100%',
              maxWidth: '900px',
              height: '80vh',
              maxHeight: '650px',
              display: 'grid',
              gridTemplateColumns: '1fr 320px',
              borderRadius: '20px',
              overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left side: Large Image */}
            <div style={{ background: '#000', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={selectedHistoryItem.image} 
                alt="Lightbox view" 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
              <button 
                onClick={() => setSelectedHistoryItem(null)}
                className="flex-center"
                style={{ position: 'absolute', top: '16px', left: '16px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-color)', color: 'white' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Right side: Detailed Parameters */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', overflowY: 'auto', borderLeft: '1px solid var(--border-color)', background: 'var(--bg-surface-solid)' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Image Inspector</h3>
                <span className="badge badge-purple" style={{ marginTop: '8px' }}>{selectedHistoryItem.modelType} Model</span>
              </div>

              {/* Prompt Box */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Prompt</span>
                <p style={{ fontSize: '12px', lineHeight: '1.4', color: 'var(--text-primary)', background: 'rgba(0,0,0,0.25)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {selectedHistoryItem.prompt}
                </p>
                <button 
                  onClick={() => handleCopyPrompt(selectedHistoryItem.prompt, selectedHistoryItem.id)}
                  style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-end', marginTop: '2px' }}
                >
                  {copiedPromptId === selectedHistoryItem.id ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                  {copiedPromptId === selectedHistoryItem.id ? 'Copied!' : 'Copy Prompt'}
                </button>
              </div>

              {/* Negative Prompt Box */}
              {selectedHistoryItem.negativePrompt && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Negative Prompt</span>
                  <p style={{ fontSize: '12px', lineHeight: '1.4', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.25)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    {selectedHistoryItem.negativePrompt}
                  </p>
                </div>
              )}

              {/* Specs Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', fontSize: '11px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Dimensions</span>
                  <p style={{ fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>{selectedHistoryItem.width} × {selectedHistoryItem.height}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Steps</span>
                  <p style={{ fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>{selectedHistoryItem.steps}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>CFG Scale</span>
                  <p style={{ fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>{selectedHistoryItem.cfgScale?.toFixed(1) || 'N/A'}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Sampler</span>
                  <p style={{ fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>{selectedHistoryItem.scheduler || 'N/A'}</p>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Seed</span>
                  <p style={{ fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{selectedHistoryItem.seed}</p>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Generated</span>
                  <p style={{ fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>{new Date(selectedHistoryItem.timestamp).toLocaleString()}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <button 
                  onClick={() => handleReuseSettings(selectedHistoryItem)}
                  className="btn-primary" 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <RefreshCw size={14} />
                  Use These Settings
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => handleDownloadImage(selectedHistoryItem.image, selectedHistoryItem.prompt)}
                    className="btn-secondary" 
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Download size={14} />
                    Download
                  </button>
                  <button 
                    onClick={() => handleDeleteItem(selectedHistoryItem.id)}
                    className="btn-secondary" 
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Delete Image"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lock API Password Overlay Modal */}
      {showLockModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(5, 3, 11, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 101,
          }}
        >
          <form 
            onSubmit={handlePasswordSubmit}
            className="glass-panel animate-scale-in"
            style={{
              width: '100%',
              maxWidth: '380px',
              padding: '24px',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={16} color="var(--accent-purple)" />
                Access Protection
              </h3>
              <button 
                type="button" 
                onClick={() => setShowLockModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)' }}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              If your deployed web app is protected by the <code>APP_PASSWORD</code> env variable on Vercel, please enter it below. It will be stored securely in your browser's local storage.
            </p>
            <input 
              type="password" 
              className="input-field" 
              placeholder="Enter password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%' }}
              required
            />
            <button 
              type="submit" 
              className="btn-primary" 
              style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '13px' }}
            >
              Save Password
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
