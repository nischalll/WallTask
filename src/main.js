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

// Get path for storing app data (tasks, colors)
const dataPath = path.join(app.getPath("userData"), "taskwall-data.json");

// In-memory storage with defaults
let tasks = [];
let taskIdCounter = 0;
let wallpaperColors = {
  background: "#000000",
  text: "#DDDDDD",
};

// --- Data Persistence ---

async function loadData() {
  try {
    // Check if file exists
    await fs.access(dataPath);
    const data = await fs.readFile(dataPath, "utf8");
    const parsedData = JSON.parse(data);

    tasks = parsedData.tasks || [];
    taskIdCounter = parsedData.taskIdCounter || 0;
    wallpaperColors = parsedData.wallpaperColors || {
      background: "#000000",
      text: "#DDDDDD",
    };

    console.log("✅ Data loaded successfully from:", dataPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("ℹ️ No data file found. Starting with defaults.");
      // File doesn't exist, defaults are already set, so just save them.
      await saveData();
    } else {
      console.error("⚠️ Failed to load data:", error);
    }
  }
}

async function saveData() {
  try {
    const dataToSave = {
      tasks,
      taskIdCounter,
      wallpaperColors,
    };
    await fs.writeFile(dataPath, JSON.stringify(dataToSave, null, 2));
    console.log("💾 Data saved successfully to:", dataPath);
  } catch (error) {
    console.error("⚠️ Failed to save data:", error);
  }
}

// --- End Data Persistence ---

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
  const background = wallpaperColors.background || "#000000";
  const textColor = wallpaperColors.text || "#DDDDDD";
  const fontFamily = "sans-serif";
  const fontSize = 42;

  const escapeXml = (unsafe = "") =>
    String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const bg = `<rect width="${width}" height="${height}" fill="${background}" />`;

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
    const blockWidth = 600;
    const startX = (width - blockWidth) / 2;

    tasksHtml = tasks
      .map((task, i) => {
        const safeText = escapeXml(task.text || "");
        const y = startY + i * lineHeight;

        // NEW: Add styles for completed tasks
        const completedStyles = task.isComplete
          ? 'text-decoration="line-through" opacity="0.6"'
          : "";

        return `
          <text
            x="${startX}"
            y="${y}"
            font-size="${fontSize}"
            font-family="${fontFamily}"
            fill="${textColor}"
            text-anchor="start"
            ${completedStyles}
          >
            ${i + 1}. ${safeText}
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
  }

  return targetPath;
}

// --- IPC Handlers ---

ipcMain.handle("get-tasks", async () => {
  // On first load, send both tasks and colors
  return { tasks, wallpaperColors };
});

ipcMain.handle("add-task", async (_event, taskText) => {
  if (typeof taskText !== "string" || !taskText.trim()) {
    throw new Error("Task text cannot be empty");
  }
  const task = {
    id: taskIdCounter++,
    text: taskText.trim(),
    isComplete: false, // NEW: Add completion state
  };
  tasks.push(task);

  const imagePath = await generateTaskImage();
  await saveData(); // Save after any change

  return { task, imagePath };
});

ipcMain.handle("delete-task", async (_event, taskId) => {
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) {
    throw new Error("Task not found");
  }
  tasks.splice(index, 1);

  const imagePath = await generateTaskImage();
  await saveData(); // Save after any change

  return { imagePath };
});

// NEW: Handle toggling task completion
ipcMain.handle("toggle-task-status", async (_event, taskId) => {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new Error("Task not found");
  }
  task.isComplete = !task.isComplete;

  const imagePath = await generateTaskImage();
  await saveData(); // Save after any change

  return { updatedTask: task, imagePath };
});

ipcMain.handle("update-colors", async (_event, colors) => {
  if (colors.bgColor) {
    wallpaperColors.background = colors.bgColor;
  }
  if (colors.textColor) {
    wallpaperColors.text = colors.textColor;
  }

  const imagePath = await generateTaskImage();
  await saveData(); // Save after any change

  return { imagePath };
});

// --- App Lifecycle ---

app.whenReady().then(async () => {
  await loadData(); // Load data on startup
  await generateTaskImage(); // Generate initial image
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
