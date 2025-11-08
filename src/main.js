import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { setWallpaper } from "wallpaper";

let mainWindow = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory task storage
let tasks = [];
let taskIdCounter = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#1a1a2e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function escapeHtml(text) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function generateTaskImage() {
  const width = 1920;
  const height = 1080;
  const centerX = width / 2; // 960

  // Dark theme background
  const darkBg = `
    <defs>
      <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
        <stop offset="50%" style="stop-color:#16213e;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
      </linearGradient>
      <filter id="shadow">
        <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
        <feOffset dx="0" dy="6" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.4"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="glow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
  `;

  // Title with modern styling
  const title = `
    <g filter="url(#glow)">
      <text x="${centerX}" y="180" font-size="84" font-family="Arial, sans-serif" font-weight="bold" fill="#ec4899" text-anchor="middle" opacity="0.95">TaskWall</text>
    </g>
  `;

  // Create SVG with tasks
  let tasksHtml = "";
  if (tasks.length === 0) {
    tasksHtml = `
      <text x="${centerX}" y="540" font-size="48" font-family="Arial, sans-serif" fill="rgba(228,228,231,0.6)" text-anchor="middle" opacity="0.8">
        No tasks yet
      </text>
    `;
  } else {
    // Calculate vertical centering with spacing
    const cardHeight = 90;
    const cardSpacing = 16;
    const cardWidth = 900;
    const totalHeight = tasks.length * (cardHeight + cardSpacing) - cardSpacing;
    const startY = (height - totalHeight) / 2 + 100;

    tasks.forEach((task, idx) => {
      const y = startY + idx * (cardHeight + cardSpacing);
      const cardY = y - cardHeight / 2;
      const taskText = escapeHtml(task.text);
      const taskNum = idx + 1;
      const cardX = centerX - cardWidth / 2;

      // Modern task card with dark theme
      tasksHtml += `
        <g filter="url(#shadow)">
          <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" 
                rx="12" ry="12" fill="#16213e" stroke="#2d3748" stroke-width="2"/>
          <rect x="${cardX + 20}" y="${cardY + 20}" width="50" height="50" 
                rx="8" ry="8" fill="rgba(236,72,153,0.2)" stroke="#ec4899" stroke-width="2"/>
          <text x="${cardX + 45}" y="${cardY + 53}" 
                font-size="24" font-family="Arial, sans-serif" font-weight="bold" 
                fill="#ec4899" text-anchor="middle">${taskNum}</text>
          <text x="${cardX + 90}" y="${cardY + 52}" 
                font-size="36" font-family="Arial, sans-serif" fill="#e4e4e7" 
                font-weight="500">${taskText}</text>
        </g>
      `;
    });
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${darkBg}
  ${title}
  ${tasksHtml}
</svg>`;

  const targetDir = path.join(os.homedir(), "Documents");
  await fs.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, "taskwall.png");

  await sharp(Buffer.from(svg)).png().toFile(targetPath);

  // Set as wallpaper
  try {
    await setWallpaper(targetPath);
  } catch (err) {
    console.error("Failed to set wallpaper:", err);
  }

  return targetPath;
}

ipcMain.handle("get-tasks", async () => {
  return tasks;
});

ipcMain.handle("add-task", async (_event, taskText) => {
  if (typeof taskText !== "string" || !taskText.trim()) {
    throw new Error("Task text cannot be empty");
  }
  const task = {
    id: taskIdCounter++,
    text: taskText.trim(),
  };
  tasks.push(task);
  const imagePath = await generateTaskImage();
  return { task, imagePath };
});

ipcMain.handle("delete-task", async (_event, taskId) => {
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) {
    throw new Error("Task not found");
  }
  tasks.splice(index, 1);
  const imagePath = await generateTaskImage();
  return { imagePath };
});

app.whenReady().then(async () => {
  // Generate initial image
  await generateTaskImage();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
