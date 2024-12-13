const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors"); // Import the CORS package

const app = express();

// Enable CORS for all origins or specify only allowed origins
app.use(
  cors({
    origin: "http://localhost:3000", // Allow frontend from localhost:3000
    methods: ["GET", "POST"], // Specify allowed methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
  })
);

// Storage setup for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    // Ensure the uploads directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Set the file name to ensure it's unique
    const filename = `${Date.now()}_${file.originalname}`;
    cb(null, filename);
  },
});

const upload = multer({ storage });

const MAX_RETRIES = 3;

// Endpoint to handle chunk uploads
app.post(
  "/upload",
  upload.fields([{ name: "file.name", maxCount: 1 }]),
  async (req, res) => {
    const { chunkIndex, totalChunks, fileName } = req.body;
    const tempPath = req.file.path;
    const uploadDir = path.join(__dirname, "uploads"); // Corrected here
    const chunkDir = path.join(uploadDir, fileName);

    // Ensure the directory for chunks exists
    fs.ensureDirSync(chunkDir);

    let retries = 0;
    let success = false;

    while (retries < MAX_RETRIES && !success) {
      try {
        // Save the chunk to the directory
        const chunkPath = path.join(chunkDir, chunkIndex);
        await fs.move(tempPath, chunkPath);

        // If this is the last chunk, combine all chunks
        if (parseInt(chunkIndex) === parseInt(totalChunks) - 1) {
          const fileStream = fs.createWriteStream(
            path.join(uploadDir, fileName)
          );

          // Sequentially write all chunks to the file
          for (let i = 0; i < totalChunks; i++) {
            const chunkFile = path.join(chunkDir, i.toString());
            const chunkData = await fs.readFile(chunkFile);
            fileStream.write(chunkData);
            await fs.remove(chunkFile); // Remove chunk after writing
          }

          fileStream.end();
        }

        success = true;
      } catch (error) {
        retries++;
        if (retries >= MAX_RETRIES) {
          console.error(
            `Failed to upload chunk ${chunkIndex} after ${MAX_RETRIES} attempts.`
          );
          return res.status(500).send("Upload failed");
        }
        console.log(`Retrying chunk ${chunkIndex}, attempt ${retries}`);
        // Optional: you could add a delay before retrying (e.g., exponential backoff)
      }
    }

    res.status(200).send("Chunk uploaded successfully");
  }
);

// Start server
app.listen(5000, () => {
  console.log("Server is running on port 5000");
});
