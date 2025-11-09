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
  const background = "#000000"; // plain black background
  const textColor = "#DDDDDD"; // light gray text
  const fontFamily = "sans-serif"; // Sharp-safe
  const fontSize = 42;

  const escapeXml = (unsafe = "") =>
    String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const bg = `<rect width="${width}" height="${height}" fill="${background}" />`;

  // Title (optional)
  const title = `
    <text
      x="${width / 2}"
      y="150"
      font-size="64"
      font-family="${fontFamily}"
      font-weight="700"
      fill="${textColor}"
      text-anchor="middle">
      TaskWall
    </text>
  `;

  let tasksHtml = "";

  if (!tasks || tasks.length === 0) {
    tasksHtml = `
      <text
        x="${width / 2}"
        y="${height / 2}"
        font-size="40"
        font-family="${fontFamily}"
        fill="${textColor}"
        text-anchor="middle"
        opacity="0.8">
        No tasks yet
      </text>
    `;
  } else {
    const lineHeight = 60;
    const totalHeight = tasks.length * lineHeight;
    const startY = (height - totalHeight) / 2 + 20;

    // Estimate left alignment starting X (centered block width ~600px)
    const blockWidth = 600;
    const startX = (width - blockWidth) / 2;

    tasksHtml = tasks
      .map((task, i) => {
        const safeText = escapeXml(task.text || "");
        const y = startY + i * lineHeight;
        return `
          <text
            x="${startX}"
            y="${y}"
            font-size="${fontSize}"
            font-family="${fontFamily}"
            fill="${textColor}"
            text-anchor="start">
            ${i}. ${safeText}
          </text>
        `;
      })
      .join("");
  }

  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${bg}
    ${title}
    ${tasksHtml}
  </svg>`;

  const targetDir = path.join(os.homedir(), "Documents");
  await fs.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, "taskwall.png");

  try {
    await sharp(Buffer.from(svg, "utf8")).png().toFile(targetPath);
    await setWallpaper(targetPath, { scale: "fill" });
    console.log("✅ Wallpaper set successfully:", targetPath);
  } catch (err) {
    console.error("⚠️ Failed to generate or set wallpaper:", err);
    console.error("SVG content:\n", svg);
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
