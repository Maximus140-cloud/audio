"use client";

import React, { useState, useEffect } from "react";
import FileUpload from "@/components/FileUpload";
import AudioPlayer from "@/components/AudioPlayer";
import Library from "@/components/Library";
import SettingsModal, { defaultSettings, VoiceSettings } from "@/components/SettingsModal";
import { BookOpen, Moon, Sun, ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { AudiobookData } from "@/types";
import { getAllBooks, saveBook, deleteBook, getSetting, saveSetting } from "@/lib/db";
import toast from "react-hot-toast";

export default function Home() {
  const [books, setBooks] = useState<AudiobookData[]>([]);
  const [currentBook, setCurrentBook] = useState<AudiobookData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings>(defaultSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [offlineFolderHandle, setOfflineFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  const loadData = async () => {
    try {
      const allBooks = await getAllBooks();
      setBooks(allBooks.sort((a, b) => b.timestamp - a.timestamp));

      const savedHandle = await getSetting("offlineFolder");
      if (savedHandle) {
        // Need to request permission on load if we want to use it automatically, 
        // but browsers require a user gesture. We'll just set it and verify when needed.
        setOfflineFolderHandle(savedHandle);
      }
    } catch (e) {
      console.error("Failed to load db data", e);
    }
  };

  useEffect(() => {
    loadData();
    
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
    }

    const savedSettings = localStorage.getItem("voiceSettings");
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    if (newTheme) {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    }
  };

  const handleSettingsChange = (newSettings: VoiceSettings) => {
    setSettings(newSettings);
    localStorage.setItem("voiceSettings", JSON.stringify(newSettings));
  };

  const handleFileAccepted = async (file: File) => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.chunks) {
        const newBook: AudiobookData = {
          id: `${Date.now()}_${file.name}`,
          title: file.name.replace(/\.[^/.]+$/, ""),
          chunks: data.chunks,
          chapters: data.chapters || [],
          currentIndex: 0,
          timestamp: Date.now(),
          bookmarks: [],
        };
        await saveBook(newBook);
        setBooks((prev) => [newBook, ...prev]);
        setCurrentBook(newBook);
      } else {
        toast.error("Error: " + data.error);
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred during file upload.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveProgress = async (index: number) => {
    if (currentBook) {
      const updatedBook = { ...currentBook, currentIndex: index, timestamp: Date.now() };
      setCurrentBook(updatedBook);
      await saveBook(updatedBook);
      setBooks((prev) => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
    }
  };

  const handleUpdateBook = async (updatedBook: AudiobookData) => {
    setCurrentBook(updatedBook);
    await saveBook(updatedBook);
    setBooks((prev) => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
  };

  const handleDeleteBook = async (id: string) => {
    if (confirm("Are you sure you want to delete this book?")) {
      await deleteBook(id);
      setBooks((prev) => prev.filter(b => b.id !== id));
      if (currentBook?.id === id) {
        setCurrentBook(null);
      }
    }
  };

  const requestOfflineFolder = async () => {
    try {
      if (!(window as any).showDirectoryPicker) {
        toast.error("Your browser doesn't support the File System Access API.");
        return;
      }
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      await saveSetting("offlineFolder", handle);
      setOfflineFolderHandle(handle);
      toast.success("Offline folder selected!");
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        toast.error("Failed to select folder.");
      }
    }
  };

  const verifyFolderPermission = async (requestIfDenied = false): Promise<boolean> => {
    if (!offlineFolderHandle) return false;
    const opts = { mode: 'readwrite' as any };
    if ((await (offlineFolderHandle as any).queryPermission(opts)) === 'granted') {
      return true;
    }
    if (requestIfDenied) {
      if ((await (offlineFolderHandle as any).requestPermission(opts)) === 'granted') {
        return true;
      }
    }
    return false;
  };

  const downloadOffline = async (book: AudiobookData) => {
    if (!(await verifyFolderPermission(true))) {
      toast.error("Permission to access offline folder denied.");
      return;
    }

    toast.loading(`Downloading ${book.title}...`, { id: `download-${book.id}` });
    setDownloadProgress((prev) => ({ ...prev, [book.id]: 0 }));
    try {
      // Create a folder for the book
      const bookDir = await offlineFolderHandle!.getDirectoryHandle(book.title.replace(/[<>:"/\\|?*]+/g, ''), { create: true });
      
      let completed = 0;
      let hasError = false;

      const downloadChunk = async (i: number) => {
        if (hasError) return;
        const bodyPayload: any = { 
          text: book.chunks[i].text,
          chunkIndex: i
        };
        if (settings) {
          bodyPayload.voice = settings.voice;
          bodyPayload.rate = settings.rate;
          bodyPayload.pitch = settings.pitch;
        }

        let data = null;
        let retries = 5;
        let backoff = 2000;
        while (retries > 0 && !hasError) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for high concurrency
          try {
            const response = await fetch("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(bodyPayload),
              signal: controller.signal
            });
            
            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(errData.error || "TTS API failed");
            }
            data = await response.json();
            break;
          } catch (e: any) {
            retries--;
            if (retries === 0) {
              console.error(`Skipping chunk ${i} after 5 failed retries:`, e);
              console.error(`Broken chunk text [Chunk ${i}]:\n`, book.chunks[i].text);
              toast.error(`Chunk ${i} permanently failed and was skipped. Check console.`, { duration: 8000, icon: '⚠️' });
              hasError = false; // reset error state so we don't abort everything
              break; 
            }
            await new Promise(res => setTimeout(res, 500)); // 0.5s delay for network stability
          } finally {
            clearTimeout(timeoutId);
          }
        }

        if (!data) {
          // If we exhausted retries and data is still null, just skip this chunk
          completed++;
          const progress = (completed / book.chunks.length) * 100;
          setDownloadProgress((prev) => ({ ...prev, [book.id]: progress }));
          toast.loading(`Downloading ${book.title}... ${Math.round(progress)}%`, { id: `download-${book.id}` });
          return; 
        }

        const binaryString = atob(data.audioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let j = 0; j < len; j++) {
          bytes[j] = binaryString.charCodeAt(j);
        }
        const blob = new Blob([bytes], { type: "audio/mpeg" });

        const fileHandle = await bookDir.getFileHandle(`chunk_${i}.mp3`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        
        if (data.subtitles) {
          const subHandle = await bookDir.getFileHandle(`chunk_${i}.json`, { create: true });
          const subWritable = await subHandle.createWritable();
          await subWritable.write(JSON.stringify(data.subtitles));
          await subWritable.close();
        }

        completed++;
        const progress = (completed / book.chunks.length) * 100;
        setDownloadProgress((prev) => ({ ...prev, [book.id]: progress }));
        toast.loading(`Downloading ${book.title}... ${Math.round(progress)}%`, { id: `download-${book.id}` });
        
      };

      const CONCURRENCY = 100; // Increased concurrency since Edge TTS limits are bypassed
      for (let i = 0; i < book.chunks.length; i += CONCURRENCY) {
        if (hasError) break;
        const batch = [];
        for (let j = i; j < i + CONCURRENCY && j < book.chunks.length; j++) {
          batch.push(downloadChunk(j));
        }
        try {
          await Promise.all(batch);
        } catch (err) {
          hasError = true;
          throw err;
        }
      }
      
      if (!hasError) {
        toast.success("Download complete!", { id: `download-${book.id}` });
      }
    } catch (err) {
      console.error(err);
      toast.error("Download failed.", { id: `download-${book.id}` });
    } finally {
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[book.id];
        return next;
      });
    }
  };

  return (
    <main className="flex flex-col min-h-screen px-4 py-8 max-w-5xl mx-auto w-full">
      <header className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-3 text-primary cursor-pointer" onClick={() => setCurrentBook(null)}>
          {currentBook ? <ArrowLeft size={32} /> : <BookOpen size={32} />}
          <h1 className="text-3xl font-bold tracking-tight">Audiobook</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-3 rounded-full glass-panel hover:bg-surface-variant/50 transition-colors text-on-surface"
            title="Voice Settings"
          >
            <SettingsIcon size={20} />
          </button>
          <button 
            onClick={toggleTheme}
            className="p-3 rounded-full glass-panel hover:bg-surface-variant/50 transition-colors text-on-surface"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col w-full">
        {!currentBook ? (
          <div className="w-full flex flex-col gap-12">
            <div className="w-full animate-fade-in text-center">
              <h2 className="text-4xl font-extrabold mb-4 text-on-background">Listen to Any Document</h2>
              <p className="text-lg text-on-surface-variant mb-8 max-w-2xl mx-auto">
                Upload a PDF, TXT, or EPUB and let our ultra-realistic neural voices read it to you seamlessly.
              </p>
              <FileUpload onFileAccepted={handleFileAccepted} isProcessing={isProcessing} />
            </div>
            
            <Library 
              books={books} 
              onOpenBook={setCurrentBook} 
              onDeleteBook={handleDeleteBook}
              offlineFolderHandle={offlineFolderHandle}
              onRequestOfflineFolder={requestOfflineFolder}
              onDownloadOffline={downloadOffline}
              downloadProgress={downloadProgress}
            />
          </div>
        ) : (
          <div className="w-full animate-slide-up">
            <AudioPlayer 
              book={currentBook}
              onSaveProgress={handleSaveProgress}
              onUpdateBook={handleUpdateBook}
              settings={settings}
              offlineFolderHandle={offlineFolderHandle}
              verifyFolderPermission={verifyFolderPermission}
            />
          </div>
        )}
      </div>
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings} 
        onSettingsChange={handleSettingsChange} 
      />
    </main>
  );
}
