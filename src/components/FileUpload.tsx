"use client";

import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, File as FileIcon, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface FileUploadProps {
  onFileAccepted: (file: File) => void;
  isProcessing: boolean;
}

export default function FileUpload({ onFileAccepted, isProcessing }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isProcessing) {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) return prev;
          const increment = Math.max(0.2, (95 - prev) * 0.05);
          return Math.min(95, prev + increment);
        });
      }, 300);
      return () => clearInterval(interval);
    } else {
      setProgress(0);
    }
  }, [isProcessing]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndAccept(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAccept(e.target.files[0]);
    }
  };

  const validateAndAccept = (file: File) => {
    if (file.type === "application/pdf" || file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".epub") || file.type === "application/epub+zip") {
      onFileAccepted(file);
    } else {
      alert("Please upload a PDF, TXT, or EPUB file.");
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-8">
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`glass-panel relative flex flex-col items-center justify-center w-full h-64 p-6 border-2 border-dashed rounded-3xl cursor-pointer transition-colors ${
          isDragging ? 'border-primary bg-primary/10' : 'border-outline hover:bg-surface-variant/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          accept=".pdf,.txt,.epub,application/pdf,text/plain,application/epub+zip"
        />
        
        {isProcessing ? (
          <div className="flex flex-col items-center w-full max-w-md text-primary">
            <Loader2 className="w-12 h-12 mb-4 animate-spin" />
            <p className="text-lg font-medium mb-4">Processing your book...</p>
            <div className="w-full bg-surface-variant rounded-full h-3 overflow-hidden">
              <motion.div 
                className="bg-primary h-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "linear", duration: 0.3 }}
              />
            </div>
            <p className="mt-2 text-sm text-on-surface-variant font-medium">
              {Math.round(progress)}%
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-on-surface-variant">
            <UploadCloud className="w-16 h-16 mb-4 text-primary" />
            <p className="mb-2 text-xl font-semibold text-on-surface">
              Click to upload or drag and drop
            </p>
            <p className="text-sm">PDF, TXT, or EPUB files</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
