export interface Chunk {
  text: string;
  chapterTitle?: string;
  chunkIndexInChapter: number;
}

export interface Bookmark {
  chunkIndex: number;
  text: string;
  note?: string;
  timestamp: number;
}

export interface Chapter {
  title: string;
  startIndex: number;
}

export interface AudiobookData {
  id: string;
  title: string;
  chunks: Chunk[];
  currentIndex: number;
  timestamp: number;
  bookmarks: Bookmark[];
  chapters: Chapter[];
}
