const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getTasks: async () => {
    return await ipcRenderer.invoke("get-tasks");
  },
  addTask: async (taskText) => {
    return await ipcRenderer.invoke("add-task", taskText);
  },
  deleteTask: async (taskId) => {
    return await ipcRenderer.invoke("delete-task", taskId);
  },
  updateColors: async (bgColor, textColor) => {
    return await ipcRenderer.invoke("update-colors", { bgColor, textColor });
  },
  // NEW: Expose the toggle function
  toggleTaskStatus: async (taskId) => {
    return await ipcRenderer.invoke("toggle-task-status", taskId);
  },
});
