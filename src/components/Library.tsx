"use client";

import React, { useState } from "react";
import { AudiobookData } from "../types";
import { Book, Play, Trash2, HardDrive, Download, CheckCircle, RefreshCw } from "lucide-react";

interface LibraryProps {
  books: AudiobookData[];
  onOpenBook: (book: AudiobookData) => void;
  onDeleteBook: (id: string) => void;
  offlineFolderHandle: FileSystemDirectoryHandle | null;
  onRequestOfflineFolder: () => Promise<void>;
  onDownloadOffline: (book: AudiobookData) => Promise<void>;
  downloadProgress: Record<string, number>;
}

export default function Library({ 
  books, 
  onOpenBook, 
  onDeleteBook, 
  offlineFolderHandle, 
  onRequestOfflineFolder,
  onDownloadOffline,
  downloadProgress
}: LibraryProps) {

  const handleDownload = async (e: React.MouseEvent, book: AudiobookData) => {
    e.stopPropagation();
    if (!offlineFolderHandle) {
      await onRequestOfflineFolder();
      // Need to re-trigger or wait for the handle to be set in parent state
      return; 
    }
    try {
      await onDownloadOffline(book);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="w-full animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-extrabold text-on-background">Your Bookshelf</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={onRequestOfflineFolder}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors ${
              offlineFolderHandle 
                ? "bg-primary/10 text-primary hover:bg-primary/20" 
                : "bg-surface-variant text-on-surface hover:bg-surface-variant/80"
            }`}
          >
            <HardDrive size={18} />
            {offlineFolderHandle ? "Offline Folder Selected" : "Select Offline Folder"}
          </button>
        </div>
      </div>

      {books.length === 0 ? (
        <div className="text-center py-20 text-on-surface-variant">
          <Book className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Your library is empty. Upload a book to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {books.map((book) => {
            const progress = ((book.currentIndex) / Math.max(1, book.chunks.length)) * 100;
            const isDownloading = downloadProgress[book.id] !== undefined;
            const currentDownloadProgress = isDownloading ? downloadProgress[book.id] : 0;

            return (
              <div 
                key={book.id}
                onClick={() => onOpenBook(book)}
                className="glass-panel group relative flex flex-col p-6 rounded-3xl cursor-pointer hover:border-primary/50 transition-all hover:shadow-xl hover:-translate-y-1"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
                    <Book size={24} />
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteBook(book.id); }}
                    className="p-2 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-full transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    title="Delete book"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                <h3 className="text-lg font-bold text-on-surface line-clamp-2 mb-2" title={book.title}>
                  {book.title}
                </h3>
                
                <div className="mt-auto pt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-on-surface-variant font-medium">
                      <span>{Math.round(progress)}% completed</span>
                      <span>{book.chunks.length} chunks</span>
                    </div>
                    <div className="w-full bg-surface-variant rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-primary h-1.5 rounded-full transition-all duration-500" 
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {isDownloading && (
                    <div className="animate-fade-in">
                      <div className="flex justify-between text-xs text-primary font-medium mb-1.5">
                        <span className="flex items-center gap-1">
                          <RefreshCw className="animate-spin" size={12} /> Downloading
                        </span>
                        <span>{Math.round(currentDownloadProgress)}%</span>
                      </div>
                      <div className="w-full bg-primary/20 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-primary h-1.5 rounded-full transition-all duration-500" 
                          style={{ width: `${currentDownloadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={(e) => handleDownload(e, book)}
                      disabled={isDownloading}
                      className="p-3 bg-surface text-on-surface rounded-full shadow-sm hover:scale-110 transition-transform opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      title="Download for offline playback"
                    >
                      {isDownloading ? <RefreshCw className="animate-spin text-primary" size={20} /> : <Download size={20} />}
                    </button>
                    <div className="p-3 bg-primary text-on-primary rounded-full shadow-lg shadow-primary/30 group-hover:scale-110 transition-transform flex items-center justify-center">
                      <Play size={20} className="ml-0.5" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
