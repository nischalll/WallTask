# TaskWall

TaskWall is a modern desktop task manager that turns your to-do list into a live desktop wallpaper.

## Features

- Add / Edit / Delete tasks
- Title, optional description, deadline, estimated duration, per-task color
- Light/Dark themes; gradient or solid background
- Dynamic wallpaper generation using SVG + Sharp
- Auto-updates wallpaper on task changes

## Tech Stack

- Electron (main process)
- Express (local API server)
- JSON file storage (`data/tasks.json`)
- Sharp + SVG for image rendering
- React + Tailwind (via CDN) for UI
- `wallpaper` package to set OS wallpaper

## API

- GET `/tasks`
- POST `/tasks`
- PUT `/tasks/:id`
- DELETE `/tasks/:id`
- POST `/generate-wallpaper`

(Also available under `/api/*` prefixes.)

## Getting Started

```bash
npm install
npm run dev
```

Electron will launch. The UI loads from `src/renderer/index.html`. The local API server listens on `http://127.0.0.1:37123`.

Tasks are saved to `data/tasks.json`. Each mutation regenerates a wallpaper PNG in your temp folder and sets it as the desktop wallpaper.

## Notes

- On first run, `data/tasks.json` is created automatically.
- Sharp provides prebuilt binaries for Windows/macOS/Linux; if installation fails, ensure build tools are available or use a compatible Node/Electron version.
