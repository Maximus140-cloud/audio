async function run() {
  const chunks = Array.from({ length: 100 }).map((_, i) => ({ text: `This is chunk number ${i}. We are testing the API.` }));

  console.log("Starting batch fetch...");
  const promises = chunks.map(async (chunk, i) => {
    try {
      const res = await fetch("http://localhost:3000/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunk.text })
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Chunk ${i} failed: ${res.status}`, text);
      } else {
        console.log(`Chunk ${i} succeeded`);
      }
    } catch (err) {
      console.error(`Chunk ${i} network error:`, err.message);
    }
  });

  await Promise.all(promises);
  console.log("Done");
}

run();
