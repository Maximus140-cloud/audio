import { NextRequest, NextResponse } from "next/server";
import { convert } from "html-to-text";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { Chunk } from "@/types";

const pdfParse = require("pdf-parse");
const EPub = require("epub2").EPub;

function chunkText(text: string, chapterTitle: string | undefined, maxLength: number = 800): Chunk[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxLength) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += " " + sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > maxLength) {
      let i = 0;
      while (i < chunk.length) {
        finalChunks.push(chunk.substring(i, i + maxLength));
        i += maxLength;
      }
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks.map((text, index) => ({
    text,
    chapterTitle,
    chunkIndexInChapter: index,
  }));
}

async function parseEpub(filePath: string): Promise<Chunk[]> {
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath);
    epub.on("error", reject);
    epub.on("end", () => {
      const chunks: Chunk[] = [];
      const chapters = epub.flow;
      let processed = 0;

      if (chapters.length === 0) {
        resolve([]);
        return;
      }

      chapters.forEach((chapter: any) => {
        epub.getChapter(chapter.id, (err: any, html: string) => {
          processed++;
          if (!err && html) {
            const text = convert(html, { wordwrap: false });
            const cleanText = text.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
            if (cleanText) {
              const chapterChunks = chunkText(cleanText, chapter.title || "Chapter");
              chunks.push(...chapterChunks);
            }
          }
          if (processed === chapters.length) {
            resolve(chunks);
          }
        });
      });
    });
    epub.parse();
  });
}

function parseTextWithChapters(text: string): Chunk[] {
  // Enhanced Chapter detection regex
  const chapterRegex = /(?:^|\n)(chapter\s+\d+|part\s+[ivx]+|section\s+\d+|book\s+[ivx\d]+)(?:\s*:|\n|\s+-|\s+)[^\n]*/gi;
  let match;
  let lastIndex = 0;
  let currentChapterTitle = "Start";
  const chunks: Chunk[] = [];

  while ((match = chapterRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const sectionText = text.substring(lastIndex, match.index).trim();
      if (sectionText) {
        chunks.push(...chunkText(sectionText, currentChapterTitle));
      }
    }
    currentChapterTitle = match[0].trim().replace(/\n/g, " ");
    lastIndex = match.index + match[0].length;
  }

  const remainingText = text.substring(lastIndex).trim();
  if (remainingText) {
    chunks.push(...chunkText(remainingText, currentChapterTitle));
  }

  return chunks.length > 0 ? chunks : chunkText(text, undefined);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let allChunks: Chunk[] = [];

    if (file.type === "application/epub+zip" || file.name.toLowerCase().endsWith(".epub")) {
      const tempFilePath = path.join(os.tmpdir(), `temp_${Date.now()}.epub`);
      await fs.writeFile(tempFilePath, buffer);
      
      try {
        allChunks = await parseEpub(tempFilePath);
      } finally {
        await fs.unlink(tempFilePath).catch(console.error);
      }
    } else {
      let extractedText = "";
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const data = await pdfParse(buffer);
        extractedText = data.text;
      } else if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
        extractedText = buffer.toString("utf-8");
      } else {
        return NextResponse.json({ error: "Unsupported file type. Use PDF, TXT, or EPUB." }, { status: 400 });
      }

      extractedText = extractedText.replace(/\n+/g, "\n").trim();
      if (!extractedText) {
        return NextResponse.json({ error: "No text could be extracted" }, { status: 400 });
      }

      allChunks = parseTextWithChapters(extractedText);
    }

    // Build Chapter metadata
    const chapters = [];
    let currentTitle = "";
    for (let i = 0; i < allChunks.length; i++) {
      const title = allChunks[i].chapterTitle || "Unknown";
      if (title !== currentTitle) {
        chapters.push({ title, startIndex: i });
        currentTitle = title;
      }
    }

    return NextResponse.json({ chunks: allChunks, chapters });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to process file" }, { status: 500 });
  }
}
