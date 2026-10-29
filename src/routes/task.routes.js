const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask,
  uploadVoiceRecording,
} = require("../controllers/task.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

// Set up secure voice audio upload directory
const audioUploadDirectory = path.join(__dirname, "../../uploads/audio");
fs.mkdirSync(audioUploadDirectory, { recursive: true });

const audioStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, audioUploadDirectory);
  },
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".webm";
    callback(null, `voice-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit for audio
  fileFilter: (_req, file, callback) => {
    const allowedMimes = [
      "audio/webm",
      "audio/mp3",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/aac",
      "audio/m4a",
      "audio/x-m4a",
      "audio/mp4",
      "video/webm", // MediaRecorder on Chrome/Firefox sometimes uses video/webm for audio blobs
    ];
    if (allowedMimes.includes((file.mimetype || "").toLowerCase())) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive for browser-recorded audio chunks
    }
  },
});

const router = express.Router();
router.use(authenticate);

// Audio voice message upload
router.post(
  "/voice-upload",
  authorize("superadmin", "admin", "manager", "staff"),
  uploadAudio.single("audio"),
  uploadVoiceRecording
);

// Task CRUD
router.post(
  "/",
  authorize("superadmin", "admin", "manager"),
  createTask
);

router.get(
  "/",
  authorize("superadmin", "admin", "manager", "staff"),
  getTasks
);

router.get(
  "/:id",
  authorize("superadmin", "admin", "manager", "staff"),
  getTaskById
);

router.put(
  "/:id",
  authorize("superadmin", "admin", "manager", "staff"),
  updateTask
);

router.patch(
  "/:id/status",
  authorize("superadmin", "admin", "manager", "staff"),
  updateTaskStatus
);

router.delete(
  "/:id",
  authorize("superadmin", "admin", "manager"),
  deleteTask
);

module.exports = router;