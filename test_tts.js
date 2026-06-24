const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');

async function test() {
  const tts = new EdgeTTS({
    voice: 'en-US-AriaNeural',
    saveSubtitles: true
  });
  
  await tts.ttsPromise("Hello, world! This is a test. Let's see how it highlights spaces.", "test_audio.mp3");
  
  const subs = JSON.parse(fs.readFileSync('test_audio.mp3.json', 'utf8'));
  console.log(subs);
  console.log("Original: ", "Hello, world! This is a test. Let's see how it highlights spaces.");
  console.log("Reconstructed: ", subs.map(s => s.part).join(''));
}

test().catch(console.error);
