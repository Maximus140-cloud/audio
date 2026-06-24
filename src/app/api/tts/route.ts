import { NextRequest, NextResponse } from "next/server";
process.env.WS_NO_BUFFER_UTIL = "1";
import { EdgeTTS } from "node-edge-tts";
import os from "os";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
    const { text, voice = "en-US-AriaNeural", rate = "-10%", pitch = "0Hz", chunkIndex = "unknown" } = body;

    if (!text || text.trim() === "") {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Text is automatically sanitized by node-edge-tts
    const sanitizedText = text;

    let finalRate = rate;
    let finalPitch = pitch;
    if (finalRate && !finalRate.startsWith('+') && !finalRate.startsWith('-')) {
      finalRate = '+' + finalRate;
    }
    if (finalPitch && !finalPitch.startsWith('+') && !finalPitch.startsWith('-')) {
      finalPitch = '+' + finalPitch;
    }

    // Initialize TTS
    const tts = new EdgeTTS({
      voice: voice,
      lang: voice.split('-').slice(0, 2).join('-'), // e.g. "en-US"
      rate: finalRate,
      pitch: finalPitch,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      saveSubtitles: true,
      timeout: 60000 // Increased timeout to 60 seconds to support high concurrency
    });

    // Create temp file path
    const tmpFileName = crypto.randomUUID() + ".mp3";
    const tmpFilePath = path.join(os.tmpdir(), tmpFileName);

    // Generate TTS to file with a 65-second timeout
    const ttsPromise = tts.ttsPromise(sanitizedText, tmpFilePath);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("TTS generation timed out (Microsoft websocket unresponsive)")), 65000)
    );
    await Promise.race([ttsPromise, timeoutPromise]);

    // Read the generated file into a buffer
    const audioBuffer = await fs.readFile(tmpFilePath);

    // Read subtitles
    let subtitles = [];
    try {
      const subContent = await fs.readFile(tmpFilePath + '.json', 'utf8');
      subtitles = JSON.parse(subContent);
    } catch (e) {
      console.error(`[Chunk ${chunkIndex}] Failed to read subtitles:`, e);
    }

    // Clean up temp files (fire and forget)
    fs.unlink(tmpFilePath).catch(() => {});
    fs.unlink(tmpFilePath + '.json').catch(() => {});

    // Return the audio and subtitles as JSON
    return NextResponse.json({
      audioBase64: audioBuffer.toString('base64'),
      subtitles: subtitles
    }, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error: any) {
    const errMsg = error?.message || (typeof error === 'string' ? error : "Unknown error");
    console.error(`TTS generation error:`, errMsg);
    try {
      await fs.appendFile(
        path.join(process.cwd(), 'tts_error.log'), 
        `${new Date().toISOString()} - Error: ${errMsg}\nText: ${body?.text?.substring(0, 50)}...\n\n`
      );
    } catch(e) {}
    return NextResponse.json({ error: errMsg || "Failed to generate audio" }, { status: 500 });
  }
}
