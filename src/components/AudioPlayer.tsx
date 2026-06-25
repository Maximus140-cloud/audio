"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, Save, Download, RefreshCw, BookmarkPlus, Menu, X, Settings as SettingsIcon } from "lucide-react";
import toast from "react-hot-toast";
import { VoiceSettings } from "./SettingsModal";
import { AudiobookData, Chunk, Bookmark } from "@/types";
import { useVirtualizer } from '@tanstack/react-virtual';

interface AudioPlayerProps {
  book: AudiobookData;
  onSaveProgress: (chunkIndex: number) => void;
  onUpdateBook: (book: AudiobookData) => void;
  settings?: VoiceSettings;
  offlineFolderHandle: FileSystemDirectoryHandle | null;
  verifyFolderPermission: (requestIfDenied?: boolean) => Promise<boolean>;
}

export default function AudioPlayer({ 
  book, 
  onSaveProgress, 
  onUpdateBook,
  settings,
  offlineFolderHandle,
  verifyFolderPermission
}: AudioPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(book.currentIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [fontSize, setFontSize] = useState(18); // Default font size
  const [readerFont, setReaderFont] = useState("font-sans");
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const audioCache = useRef<{ [index: number]: Promise<string | null> | undefined }>({});
  const subtitlesCache = useRef<{ [index: number]: any[] }>({});
  const [currentTime, setCurrentTime] = useState(0);

  const currentChunk = book.chunks[currentIndex];
  const currentChapterTitle = currentChunk?.chapterTitle || "Chapter";

  // Filter chunks to only those in the current chapter
  const currentChapterStartIndex = useMemo(() => {
    let start = 0;
    for (let i = currentIndex; i >= 0; i--) {
      if (book.chunks[i].chapterTitle !== currentChunk?.chapterTitle) break;
      start = i;
    }
    return start;
  }, [currentIndex, currentChunk, book.chunks]);

  const currentChapterChunks = useMemo(() => {
    const chunks = [];
    for (let i = currentChapterStartIndex; i < book.chunks.length; i++) {
      if (book.chunks[i].chapterTitle !== currentChunk?.chapterTitle && i !== currentChapterStartIndex) break;
      chunks.push({ ...book.chunks[i], originalIndex: i });
    }
    return chunks;
  }, [currentChapterStartIndex, currentChunk, book.chunks]);

  const virtualizer = useVirtualizer({
    count: currentChapterChunks.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 60, // approximate height of a chunk
    overscan: 5,
  });

  // Auto-scroll to active chunk
  useEffect(() => {
    const activeLocalIndex = currentIndex - currentChapterStartIndex;
    if (activeLocalIndex >= 0 && activeLocalIndex < currentChapterChunks.length) {
      setTimeout(() => {
        virtualizer.scrollToIndex(activeLocalIndex, { align: "center", behavior: "smooth" });
      }, 50);
    }
  }, [currentIndex, currentChapterStartIndex, virtualizer]);

  // Media Session API
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentChapterTitle,
        artist: book.title,
        album: "Audiobook App"
      });

      navigator.mediaSession.setActionHandler('play', () => {
        if (audioRef.current) audioRef.current.play();
        setIsPlaying(true);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (audioRef.current) audioRef.current.pause();
        setIsPlaying(false);
      });
      navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
    }
  }, [book.title, currentChapterTitle, currentIndex]);

  const fetchAudioForChunk = async (index: number): Promise<string | null> => {
    if (audioCache.current[index]) return await audioCache.current[index];
    
    const promise = (async () => {
      // Check offline folder first
      if (offlineFolderHandle) {
        const hasPermission = await verifyFolderPermission(false);
        if (hasPermission) {
          try {
            const safeTitle = book.title.replace(/[<>:"/\\|?*]+/g, '');
            const bookDir = await offlineFolderHandle.getDirectoryHandle(safeTitle);
            const fileHandle = await bookDir.getFileHandle(`chunk_${index}.mp3`);
            const file = await fileHandle.getFile();
            const url = URL.createObjectURL(file);
            
            try {
              const subHandle = await bookDir.getFileHandle(`chunk_${index}.json`);
              const subFile = await subHandle.getFile();
              const subText = await subFile.text();
              subtitlesCache.current[index] = JSON.parse(subText);
            } catch (e) {
              console.warn("Offline subtitles not found for chunk", index);
            }

            return url;
          } catch (e) {
            // File doesn't exist locally, fallback to API
          }
        }
      }

      // Fallback to API
      try {
        const bodyPayload: any = { text: book.chunks[index].text };
        if (settings) {
          bodyPayload.voice = settings.voice;
          bodyPayload.rate = settings.rate;
          bodyPayload.pitch = settings.pitch;
        }

        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });
        
        if (!response.ok) throw new Error("Failed to generate audio");
        
        const data = await response.json();
        const binaryString = atob(data.audioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        if (data.subtitles) {
          subtitlesCache.current[index] = data.subtitles;
        }
        return url;
      } catch (err) {
        console.error(err);
        toast.error("Failed to load audio chunk.");
        delete audioCache.current[index];
        return null;
      }
    })();

    audioCache.current[index] = promise;
    return promise;
  };

  const playChunk = async (index: number) => {
    if (index >= book.chunks.length || index < 0) return;
    
    setIsLoading(true);
    const url = await fetchAudioForChunk(index);
    if (!url) {
      setIsLoading(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      }).catch(err => {
        console.error(err);
        setIsLoading(false);
        setIsPlaying(false);
      });
    }

    // Preload next
    if (index + 1 < book.chunks.length) {
      fetchAudioForChunk(index + 1);
    }
  };

  useEffect(() => {
    if (book.chunks.length > 0) {
      fetchAudioForChunk(currentIndex).then(url => {
        if (url && audioRef.current && !isPlaying) {
          audioRef.current.src = url;
        }
      });
    }
  }, [currentIndex]);

  useEffect(() => {
    if (!settings) return;
    audioCache.current = {};
    if (book.chunks.length > 0) {
      fetchAudioForChunk(currentIndex).then(url => {
        if (url && audioRef.current) {
          audioRef.current.src = url;
          if (isPlaying) {
            audioRef.current.play().catch(console.error);
          }
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (!audioRef.current.src) {
        playChunk(currentIndex);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleNext = () => {
    if (currentIndex < book.chunks.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      playChunk(nextIdx);
      onSaveProgress(nextIdx);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      playChunk(prevIdx);
      onSaveProgress(prevIdx);
    }
  };

  const handleEnded = () => {
    handleNext();
  };

  const handleAddBookmark = () => {
    const note = prompt("Add a note for this bookmark (optional):");
    if (note !== null) {
      const newBookmark: Bookmark = {
        chunkIndex: currentIndex,
        text: currentChunk.text.substring(0, 50) + "...",
        note,
        timestamp: Date.now()
      };
      const updatedBook = { ...book, bookmarks: [...(book.bookmarks || []), newBookmark] };
      onUpdateBook(updatedBook);
      toast.success("Bookmark added!");
    }
  };

  const jumpToChunk = (index: number) => {
    setCurrentIndex(index);
    playChunk(index);
    onSaveProgress(index);
    setIsSidebarOpen(false);
  };

  const progressPercentage = ((currentIndex + 1) / book.chunks.length) * 100;

  return (
    <div className="relative flex w-full h-full">
      
      {/* Sidebar Backdrop */}
      {isSidebarOpen && (
        <div 
          className="absolute inset-0 z-20 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {/* TOC & Bookmarks Sidebar */}
      <div className={`absolute z-30 flex-shrink-0 w-80 max-w-[80vw] h-full bg-surface glass-panel p-6 overflow-y-auto shadow-2xl transition-transform duration-300 left-0 top-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-on-surface">Contents</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-on-surface-variant hover:bg-surface-variant rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Chapters</h3>
            <ul className="space-y-2">
              {(book.chapters || []).length > 0 ? (book.chapters || []).map((chap, i) => (
                <li key={i}>
                  <button 
                    onClick={() => jumpToChunk(chap.startIndex)}
                    className={`text-left w-full text-sm p-2 rounded-lg transition-colors ${currentIndex >= chap.startIndex && (i === (book.chapters || []).length - 1 || currentIndex < (book.chapters || [])[i+1].startIndex) ? 'bg-primary/20 text-primary font-medium' : 'text-on-surface-variant hover:bg-surface-variant'}`}
                  >
                    {chap.title}
                  </button>
                </li>
              )) : (
                <li className="text-sm text-on-surface-variant">No chapters detected.</li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Bookmarks</h3>
            <ul className="space-y-2">
              {(book.bookmarks || []).map((bm, i) => (
                <li key={bm.timestamp}>
                  <button 
                    onClick={() => jumpToChunk(bm.chunkIndex)}
                    className="text-left w-full text-sm p-2 rounded-lg bg-surface-variant/50 hover:bg-surface-variant transition-colors"
                  >
                    <p className="font-medium text-on-surface line-clamp-1">{bm.note || "Bookmark"}</p>
                    <p className="text-xs text-on-surface-variant line-clamp-1 mt-1">"{bm.text}"</p>
                  </button>
                </li>
              ))}
              {(book.bookmarks || []).length === 0 && (
                <li className="text-sm text-on-surface-variant italic">No bookmarks yet.</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Main Player Area */}
      <div className="flex-1 flex flex-col h-full p-4 md:p-6 lg:px-12 overflow-hidden relative min-h-0">
        <audio 
          ref={audioRef} 
          onEnded={handleEnded} 
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
          }}
        />
        
        {/* Header Options */}
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-on-surface-variant hover:bg-surface-variant rounded-full">
            <Menu size={24} />
          </button>
          
          <div className="text-center flex-1 mx-4">
            <h2 className="text-xl md:text-2xl font-bold text-primary mb-1 line-clamp-1" title={book.title}>{book.title}</h2>
            <p className="text-sm text-on-surface-variant">
              {currentChapterTitle} • Chunk {currentIndex + 1} of {book.chunks.length}
            </p>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={handleAddBookmark}
              className="p-2 text-on-surface-variant hover:bg-surface-variant rounded-full transition-colors"
              title="Add Bookmark"
            >
              <BookmarkPlus size={20} />
            </button>
          </div>
        </div>

        {/* Reader View (Virtualized) */}
        <div 
          className="flex-1 mb-6 overflow-y-auto px-2 md:px-4"
          ref={scrollParentRef}
        >
          <div
            className={`relative w-full ${readerFont}`}
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const chunk = currentChapterChunks[virtualItem.index];
              const isActive = chunk.originalIndex === currentIndex;
              
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  className={`absolute top-0 left-0 w-full transition-colors duration-300 ease-in-out cursor-pointer rounded-xl p-4 ${
                    isActive ? 'bg-primary/10 border-l-4 border-primary shadow-sm text-on-surface font-medium' : 'text-on-surface-variant hover:bg-surface-variant/30'
                  }`}
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                    fontSize: `${fontSize}px`,
                    lineHeight: '1.7',
                  }}
                  onClick={() => {
                    setCurrentIndex(chunk.originalIndex);
                    playChunk(chunk.originalIndex);
                    onSaveProgress(chunk.originalIndex);
                  }}
                >
                  {isActive && subtitlesCache.current[chunk.originalIndex] ? (
                    subtitlesCache.current[chunk.originalIndex].map((sub: any, i: number) => {
                      const subs = subtitlesCache.current[chunk.originalIndex];
                      const isHighlighted = (currentTime * 1000) >= sub.start && (i === subs.length - 1 ? (currentTime * 1000) <= sub.end + 500 : (currentTime * 1000) < subs[i+1].start);
                      return (
                        <span key={i} className={isHighlighted ? "bg-primary text-on-primary rounded px-0.5" : "transition-colors duration-200"}>
                          {sub.part}
                        </span>
                      );
                    })
                  ) : (
                    chunk.text
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Reader Settings overlay (Mini) */}
        <div className="flex justify-between items-center px-4 py-2 mb-4 bg-surface-variant/30 rounded-xl">
           <div className="flex items-center gap-4 text-sm text-on-surface-variant">
             <span className="font-medium">Text Size:</span>
             <button onClick={() => setFontSize(f => Math.max(12, f - 2))} className="px-2 py-1 bg-surface rounded hover:bg-surface-variant">A-</button>
             <span className="w-6 text-center">{fontSize}</span>
             <button onClick={() => setFontSize(f => Math.min(32, f + 2))} className="px-2 py-1 bg-surface rounded hover:bg-surface-variant">A+</button>
           </div>
           <div className="flex items-center gap-2">
              <select 
                value={readerFont} 
                onChange={(e) => setReaderFont(e.target.value)}
                className="bg-surface text-sm border-none rounded p-1 text-on-surface"
              >
                <option value="font-sans">Sans-Serif</option>
                <option value="font-serif">Serif</option>
                <option value="font-mono">Monospace</option>
              </select>
           </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-surface-variant rounded-full h-2 mb-6 overflow-hidden cursor-pointer">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300 ease-in-out" 
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 md:gap-8">
          <button 
            onClick={handlePrev} 
            disabled={currentIndex === 0}
            className="p-3 md:p-4 rounded-full bg-secondary-container text-on-secondary-container hover:opacity-80 disabled:opacity-50 transition-opacity"
          >
            <SkipBack size={20} />
          </button>

          <button 
            onClick={handlePlayPause}
            className="p-5 md:p-6 rounded-full bg-primary text-on-primary hover:scale-105 transition-transform shadow-lg shadow-primary/30 flex items-center justify-center"
          >
            {isLoading ? <RefreshCw className="animate-spin" size={28} /> : isPlaying ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
          </button>

          <button 
            onClick={handleNext}
            disabled={currentIndex === book.chunks.length - 1}
            className="p-3 md:p-4 rounded-full bg-secondary-container text-on-secondary-container hover:opacity-80 disabled:opacity-50 transition-opacity"
          >
            <SkipForward size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
