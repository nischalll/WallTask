import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { setWallpaper } from "wallpaper";

let mainWindow = null;
let tray = null;
let isQuitting = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get path for storing app data (tasks, settings)
const dataPath = path.join(app.getPath("userData"), "taskwall-data.json");

// In-memory storage with defaults
let tasks = [];
let taskIdCounter = 0;

let wallpaperSettings = {
  background: "#000000",
  text: "#DDDDDD",
  position: "center", // center, top-left, top-right, bottom-left, bottom-right
  fontSize: "medium", // small (32), medium (42), large (54), xlarge (68)
  fontFamily: "sans-serif", // sans-serif, monospace, serif, cursive
  theme: "custom",
  gradientEnd: "", // optional linear gradient end color
};

// --- Data Persistence ---

async function loadData() {
  try {
    await fs.access(dataPath);
    const data = await fs.readFile(dataPath, "utf8");
    const parsedData = JSON.parse(data);

    tasks = parsedData.tasks || [];
    taskIdCounter = parsedData.taskIdCounter || 0;
    
    // Support legacy format or merge settings
    if (parsedData.wallpaperSettings) {
      wallpaperSettings = { ...wallpaperSettings, ...parsedData.wallpaperSettings };
    } else if (parsedData.wallpaperColors) {
      wallpaperSettings.background = parsedData.wallpaperColors.background || "#000000";
      wallpaperSettings.text = parsedData.wallpaperColors.text || "#DDDDDD";
    }

    console.log("✅ Data loaded successfully from:", dataPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("ℹ️ No data file found. Starting with defaults.");
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
      wallpaperSettings,
    };
    await fs.writeFile(dataPath, JSON.stringify(dataToSave, null, 2));
    console.log("💾 Data saved successfully to:", dataPath);
  } catch (error) {
    console.error("⚠️ Failed to save data:", error);
  }
}

// --- System Tray ---

function createTray() {
  const iconPath = path.join(__dirname, "assets", "logo.png");
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    const svgIcon = `
      <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <rect width="16" height="16" rx="3" fill="#d97706" />
        <text x="8" y="12" font-size="10" font-weight="bold" fill="#FFFFFF" text-anchor="middle">T</text>
      </svg>
    `;
    icon = nativeImage.createFromBuffer(Buffer.from(svgIcon));
  }

  tray = new Tray(icon);
  tray.setToolTip("Taskwall");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Taskwall",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "Refresh Wallpaper",
      click: async () => {
        await generateTaskImage();
      },
    },
    { type: "separator" },
    {
      label: "Quit Taskwall",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const appIconPath = path.join(__dirname, "assets", "logo.png");
  let icon = nativeImage.createFromPath(appIconPath);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0d0e12",
    icon: icon.isEmpty() ? appIconPath : icon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Minimize to tray on close instead of exiting
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// --- Image Generator ---

async function generateTaskImage() {
  const width = 1920;
  const height = 1080;
  const background = wallpaperSettings.background || "#000000";
  const gradientEnd = wallpaperSettings.gradientEnd || "";
  const textColor = wallpaperSettings.text || "#DDDDDD";
  const fontFamily = wallpaperSettings.fontFamily || "sans-serif";

  // Font sizes map
  const fontSizeMap = {
    small: 32,
    medium: 42,
    large: 54,
    xlarge: 68,
  };
  const fontSize = fontSizeMap[wallpaperSettings.fontSize] || 42;
  const lineHeight = Math.round(fontSize * 1.4);

  const escapeXml = (unsafe = "") =>
    String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  // Background SVG element (Solid or Linear Gradient)
  let bg = `<rect width="${width}" height="${height}" fill="${background}" />`;
  let defs = "";
  if (gradientEnd) {
    defs = `
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="100%" stop-color="${gradientEnd}" />
        </linearGradient>
      </defs>
    `;
    bg = `<rect width="${width}" height="${height}" fill="url(#bgGradient)" />`;
  }

  // Calculate layout bounds and text anchors based on position
  const pos = wallpaperSettings.position || "center";
  const margin = 100;
  let textAnchor = "middle";
  let titleX = width / 2;
  let titleY = 140;
  let startX = width / 2;
  let startY = height / 2;

  if (pos === "top-left") {
    textAnchor = "start"; titleX = margin; titleY = margin + 40; startX = margin; startY = margin + 110;
  } else if (pos === "top") {
    textAnchor = "middle"; titleX = width / 2; titleY = margin + 40; startX = width / 2; startY = margin + 110;
  } else if (pos === "top-right") {
    textAnchor = "end"; titleX = width - margin; titleY = margin + 40; startX = width - margin; startY = margin + 110;
  } else if (pos === "left") {
    textAnchor = "start"; titleX = margin;
    const totalHeight = tasks.length * lineHeight;
    titleY = Math.max(120, (height - totalHeight) / 2 - 60); startX = margin; startY = (height - totalHeight) / 2 + 20;
  } else if (pos === "right") {
    textAnchor = "end"; titleX = width - margin;
    const totalHeight = tasks.length * lineHeight;
    titleY = Math.max(120, (height - totalHeight) / 2 - 60); startX = width - margin; startY = (height - totalHeight) / 2 + 20;
  } else if (pos === "bottom-left") {
    textAnchor = "start"; titleX = margin;
    titleY = height - margin - (tasks.length * lineHeight) - 70; startX = margin; startY = height - margin - (tasks.length * lineHeight);
  } else if (pos === "bottom") {
    textAnchor = "middle"; titleX = width / 2;
    titleY = height - margin - (tasks.length * lineHeight) - 70; startX = width / 2; startY = height - margin - (tasks.length * lineHeight);
  } else if (pos === "bottom-right") {
    textAnchor = "end"; titleX = width - margin;
    titleY = height - margin - (tasks.length * lineHeight) - 70; startX = width - margin; startY = height - margin - (tasks.length * lineHeight);
  } else {
    // center
    textAnchor = "middle"; titleX = width / 2;
    const totalHeight = tasks.length * lineHeight;
    titleY = Math.max(120, (height - totalHeight) / 2 - 60); startX = width / 2; startY = (height - totalHeight) / 2 + 20;
  }

  const title = `
    <text
      x="${titleX}"
      y="${titleY}"
      font-size="${Math.round(fontSize * 1.3)}"
      font-family="${fontFamily}"
      font-weight="700"
      fill="${textColor}"
      text-anchor="${textAnchor}">
      Taskwall
    </text>
  `;

  let tasksHtml = "";

  if (!tasks || tasks.length === 0) {
    tasksHtml = `
      <text
        x="${startX}"
        y="${startY + 40}"
        font-size="${fontSize}"
        font-family="${fontFamily}"
        fill="${textColor}"
        text-anchor="${textAnchor}"
        opacity="0.7">
        No tasks yet
      </text>
    `;
  } else {
    tasksHtml = tasks
      .map((task, i) => {
        const safeText = escapeXml(task.text || "");
        const y = startY + i * lineHeight;
        const completedStyles = task.isComplete
          ? 'text-decoration="line-through" opacity="0.5"'
          : "";

        return `
          <text
            x="${startX}"
            y="${y}"
            font-size="${fontSize}"
            font-family="${fontFamily}"
            fill="${textColor}"
            text-anchor="${textAnchor}"
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
    ${defs}
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

function generateSVGString() {
  const width = 1920;
  const height = 1080;
  const background = wallpaperSettings.background || "#000000";
  const gradientEnd = wallpaperSettings.gradientEnd || "";
  const textColor = wallpaperSettings.text || "#DDDDDD";
  const fontFamily = wallpaperSettings.fontFamily || "sans-serif";

  const fontSizeMap = { small: 32, medium: 42, large: 54, xlarge: 68 };
  const fontSize = fontSizeMap[wallpaperSettings.fontSize] || 42;
  const lineHeight = Math.round(fontSize * 1.4);

  const escapeXml = (unsafe = "") =>
    String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  let bg = `<rect width="${width}" height="${height}" fill="${background}" />`;
  let defs = "";
  if (gradientEnd) {
    defs = `
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="100%" stop-color="${gradientEnd}" />
        </linearGradient>
      </defs>
    `;
    bg = `<rect width="${width}" height="${height}" fill="url(#bgGradient)" />`;
  }

  const pos = wallpaperSettings.position || "center";
  const margin = 100;
  let textAnchor = "middle";
  let titleX = width / 2;
  let titleY = 140;
  let startX = width / 2;
  let startY = height / 2;

  if (pos === "top-left") {
    textAnchor = "start"; titleX = margin; titleY = margin + 40; startX = margin; startY = margin + 110;
  } else if (pos === "top") {
    textAnchor = "middle"; titleX = width / 2; titleY = margin + 40; startX = width / 2; startY = margin + 110;
  } else if (pos === "top-right") {
    textAnchor = "end"; titleX = width - margin; titleY = margin + 40; startX = width - margin; startY = margin + 110;
  } else if (pos === "left") {
    textAnchor = "start"; titleX = margin;
    const totalHeight = tasks.length * lineHeight;
    titleY = Math.max(120, (height - totalHeight) / 2 - 60); startX = margin; startY = (height - totalHeight) / 2 + 20;
  } else if (pos === "right") {
    textAnchor = "end"; titleX = width - margin;
    const totalHeight = tasks.length * lineHeight;
    titleY = Math.max(120, (height - totalHeight) / 2 - 60); startX = width - margin; startY = (height - totalHeight) / 2 + 20;
  } else if (pos === "bottom-left") {
    textAnchor = "start"; titleX = margin;
    titleY = height - margin - (tasks.length * lineHeight) - 70; startX = margin; startY = height - margin - (tasks.length * lineHeight);
  } else if (pos === "bottom") {
    textAnchor = "middle"; titleX = width / 2;
    titleY = height - margin - (tasks.length * lineHeight) - 70; startX = width / 2; startY = height - margin - (tasks.length * lineHeight);
  } else if (pos === "bottom-right") {
    textAnchor = "end"; titleX = width - margin;
    titleY = height - margin - (tasks.length * lineHeight) - 70; startX = width - margin; startY = height - margin - (tasks.length * lineHeight);
  } else {
    textAnchor = "middle"; titleX = width / 2;
    const totalHeight = tasks.length * lineHeight;
    titleY = Math.max(120, (height - totalHeight) / 2 - 60); startX = width / 2; startY = (height - totalHeight) / 2 + 20;
  }

  const title = `
    <text x="${titleX}" y="${titleY}" font-size="${Math.round(fontSize * 1.3)}" font-family="${fontFamily}" font-weight="700" fill="${textColor}" text-anchor="${textAnchor}">
      Taskwall
    </text>
  `;

  let tasksHtml = "";
  if (!tasks || tasks.length === 0) {
    tasksHtml = `
      <text x="${startX}" y="${startY + 40}" font-size="${fontSize}" font-family="${fontFamily}" fill="${textColor}" text-anchor="${textAnchor}" opacity="0.7">
        No tasks yet
      </text>
    `;
  } else {
    tasksHtml = tasks.map((task, i) => {
      const safeText = escapeXml(task.text || "");
      const y = startY + i * lineHeight;
      const completedStyles = task.isComplete ? 'text-decoration="line-through" opacity="0.5"' : "";
      return `<text x="${startX}" y="${y}" font-size="${fontSize}" font-family="${fontFamily}" fill="${textColor}" text-anchor="${textAnchor}" ${completedStyles}>${i + 1}. ${safeText}</text>`;
    }).join("");
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${defs}${bg}${title}${tasksHtml}</svg>`;
}

// --- IPC Handlers ---

ipcMain.handle("get-tasks", async () => {
  return { tasks, wallpaperSettings, wallpaperColors: wallpaperSettings, svgPreview: generateSVGString() };
});

ipcMain.handle("get-preview-svg", async () => {
  return generateSVGString();
});

ipcMain.handle("add-task", async (_event, taskText) => {
  if (typeof taskText !== "string" || !taskText.trim()) {
    throw new Error("Task text cannot be empty");
  }
  const task = {
    id: taskIdCounter++,
    text: taskText.trim(),
    isComplete: false,
  };
  tasks.push(task);

  const imagePath = await generateTaskImage();
  await saveData();

  return { task, imagePath };
});

ipcMain.handle("delete-task", async (_event, taskId) => {
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) {
    throw new Error("Task not found");
  }
  tasks.splice(index, 1);

  const imagePath = await generateTaskImage();
  await saveData();

  return { imagePath };
});

ipcMain.handle("toggle-task-status", async (_event, taskId) => {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new Error("Task not found");
  }
  task.isComplete = !task.isComplete;

  const imagePath = await generateTaskImage();
  await saveData();

  return { updatedTask: task, imagePath };
});

ipcMain.handle("clear-completed-tasks", async () => {
  tasks = tasks.filter((t) => !t.isComplete);
  const imagePath = await generateTaskImage();
  await saveData();
  return { tasks, imagePath };
});

ipcMain.handle("update-settings", async (_event, newSettings) => {
  wallpaperSettings = { ...wallpaperSettings, ...newSettings };
  const imagePath = await generateTaskImage();
  await saveData();
  return { wallpaperSettings, imagePath };
});

ipcMain.handle("update-colors", async (_event, colors) => {
  if (colors.bgColor) wallpaperSettings.background = colors.bgColor;
  if (colors.textColor) wallpaperSettings.text = colors.textColor;

  const imagePath = await generateTaskImage();
  await saveData();

  return { imagePath };
});

// --- App Lifecycle ---

app.whenReady().then(async () => {
  try {
    await loadData();
  } catch (err) {
    console.error("⚠️ Error loading data on startup:", err);
  }

  createWindow();
  createTray();

  // Generate initial wallpaper asynchronously in background
  generateTaskImage().catch((err) => {
    console.error("⚠️ Error generating initial wallpaper:", err);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
