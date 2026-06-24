"use client";

import React from "react";
import { X } from "lucide-react";

export interface VoiceSettings {
  voice: string;
  rate: string;
  pitch: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VoiceSettings;
  onSettingsChange: (settings: VoiceSettings) => void;
}

export const defaultSettings: VoiceSettings = {
  voice: "en-US-AriaNeural",
  rate: "-10%", // A little slower by default as requested
  pitch: "+0Hz",
};

const voices = [
  { label: "Aria (Female, US)", value: "en-US-AriaNeural" },
  { label: "Guy (Male, US)", value: "en-US-GuyNeural" },
  { label: "Jenny (Female, US)", value: "en-US-JennyNeural" },
  { label: "Christopher (Male, US)", value: "en-US-ChristopherNeural" },
  { label: "Sonia (Female, UK)", value: "en-GB-SoniaNeural" },
  { label: "Ryan (Male, UK)", value: "en-GB-RyanNeural" },
  { label: "Natasha (Female, AU)", value: "en-AU-NatashaNeural" },
  { label: "William (Male, AU)", value: "en-AU-WilliamNeural" },
];

export default function SettingsModal({ isOpen, onClose, settings, onSettingsChange }: SettingsModalProps) {
  if (!isOpen) return null;

  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Convert slider value (-50 to 50) to percentage string
    const val = e.target.value;
    const rateStr = parseInt(val) >= 0 ? `+${val}%` : `${val}%`;
    onSettingsChange({ ...settings, rate: rateStr });
  };

  const handlePitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const pitchStr = parseInt(val) >= 0 ? `+${val}Hz` : `${val}Hz`;
    onSettingsChange({ ...settings, pitch: pitchStr });
  };

  const getSliderValue = (str: string) => {
    const num = parseInt(str.replace(/[^0-9-]/g, ""));
    return isNaN(num) ? 0 : num;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface w-full max-w-md rounded-3xl shadow-2xl overflow-hidden glass-panel">
        <div className="flex items-center justify-between p-6 border-b border-surface-variant/30">
          <h2 className="text-xl font-bold text-on-surface">Voice Settings</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-variant transition-colors text-on-surface-variant"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-on-surface-variant">
              Voice Selection
            </label>
            <select 
              value={settings.voice}
              onChange={(e) => onSettingsChange({ ...settings, voice: e.target.value })}
              className="w-full bg-surface-variant/50 border border-surface-variant text-on-surface rounded-xl p-3 focus:ring-2 focus:ring-primary focus:outline-none transition-all appearance-none"
            >
              {voices.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-on-surface-variant">
                Speech Speed
              </label>
              <span className="text-sm font-mono text-primary bg-primary/10 px-2 py-1 rounded-md">
                {settings.rate}
              </span>
            </div>
            <input 
              type="range" 
              min="-50" 
              max="50" 
              step="5"
              value={getSliderValue(settings.rate)}
              onChange={handleRateChange}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-on-surface-variant opacity-70">
              <span>Slower</span>
              <span>Default</span>
              <span>Faster</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-on-surface-variant">
                Voice Pitch
              </label>
              <span className="text-sm font-mono text-primary bg-primary/10 px-2 py-1 rounded-md">
                {settings.pitch}
              </span>
            </div>
            <input 
              type="range" 
              min="-50" 
              max="50" 
              step="5"
              value={getSliderValue(settings.pitch)}
              onChange={handlePitchChange}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-on-surface-variant opacity-70">
              <span>Lower</span>
              <span>Default</span>
              <span>Higher</span>
            </div>
          </div>
        </div>

        <div className="p-6 bg-surface-variant/20 border-t border-surface-variant/30 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-primary text-on-primary rounded-full font-medium hover:scale-105 transition-transform shadow-lg shadow-primary/30"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
