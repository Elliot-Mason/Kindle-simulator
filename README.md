# Kindle Paperwhite Simulator & Modular App Runtime Hub 📖

A pixel-accurate desktop simulator, E-Ink canvas renderer, and live local network runtime host for the **Amazon Kindle Paperwhite 1** (5th Generation, EY21, Firmware 5.6.1.1, 758&times;1024 Pearl E-Ink @ 212 PPI).

![Kindle Paperwhite 1](https://img.shields.io/badge/Kindle-Paperwhite%201%20(EY21)-black?style=flat-square)
![Firmware](https://img.shields.io/badge/Firmware-5.6.1.1%20WebKit-lightgrey?style=flat-square)
![Dependencies](https://img.shields.io/badge/Dependencies-Standard%20Library%20Only-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## Overview

The **Kindle Simulator** serves two main purposes:
1. **Interactive Desktop Simulator**: Test and preview E-Ink applications on your PC with simulated E-Ink Pearl contrast, ghosting, screen flash inversions, orientation switching, and hardware debug controls.
2. **Modular Local Network Host**: Serves lightweight, strict ES5 web applications to your physical Kindle Paperwhite's Experimental Browser over local Wi-Fi.

---

## App Ecosystem

The Kindle Simulator uses a decoupled plugin architecture. You can run individual standalone apps or run them together via the built-in multi-app switcher:

| App | Description | Repository |
|---|---|---|
| **App Template** | Developer starter kit with pure-Python backend & ES5 client | [Kindle-app-template](https://github.com/Elliot-Mason/Kindle-app-template) |
| **Spotify Player** | Now Playing terminal with Floyd-Steinberg dithering & touch controls | [Kindle-spotify](https://github.com/Elliot-Mason/Kindle-spotify) |
| **Plane Radar** | Overhead ADS-B flight tracker, radar scope & dynamic runway glidepaths | [Kindle-plane-radar](https://github.com/Elliot-Mason/Kindle-plane-radar) |
| **Sydney Trains** | Digital indicator board & countdowns ported from ESP32 TransportTracker | [Kindle-sydney-trains](https://github.com/Elliot-Mason/Kindle-sydney-trains) |

---

## Quick Start

### 1. Clone the Simulator
```bash
git clone https://github.com/Elliot-Mason/Kindle-simulator.git
cd Kindle-simulator
```

### 2. Run the Simulator
```bash
python server.py
```
This automatically launches your default browser to:
- **Desktop Simulator**: `http://localhost:5050/`
- **Kindle Paperwhite Client**: `http://<YOUR_PC_IP>:5050/kindle`

---

## Running Separate Kindle Apps in the Simulator

If someone develops an app in a separate repository or folder, there are two simple ways to run it in this simulator:

### Method 1: The `--app` CLI Flag (Recommended for Development)
Pass the relative or absolute path of any app directory when starting the simulator:
```bash
python server.py --app "../Kindle-sydney-trains"
```
Or with an absolute path:
```bash
python server.py --app "C:\Dev\my-custom-kindle-app"
```
The simulator will automatically scan the target directory for `kindle-app.json`, register the app in the multi-app switcher, and mount its backend and frontend routes.

### Method 2: The `apps/` Auto-Discovery Directory
Simply drop or clone any app repository into the `apps/` folder:
```bash
cd apps/
git clone https://github.com/Elliot-Mason/Kindle-spotify.git spotify
git clone https://github.com/Elliot-Mason/Kindle-plane-radar.git plane
git clone https://github.com/Elliot-Mason/Kindle-sydney-trains.git trains
```
When `server.py` starts, it automatically discovers all folders in `apps/` containing a `kindle-app.json` file.

---

## Using on a Physical Kindle Paperwhite

1. Connect your Kindle Paperwhite to the same Wi-Fi network as your computer.
2. Tap the **Menu (&vellip;)** in the top right corner &rarr; **Experimental Web Browser**.
3. Type the LAN URL displayed in your terminal:
   ```
   http://192.168.1.xxx:5050/kindle
   ```
4. Bookmark the page on your Kindle for 1-tap launching!

> **E-Ink Refresh Tip**: Tap the `Flash` button on the top right bar of the Kindle display at any time to force a full-screen black inversion and purge Pearl ghosting.

---

## App Manifest Specification (`kindle-app.json`)

To make any standalone project compatible with the Kindle Simulator, place a `kindle-app.json` file in its root:

```json
{
  "id": "my-app",
  "name": "My App",
  "version": "1.0.0",
  "description": "Custom Kindle Paperwhite application",
  "author": "Your Name",
  "icon": "⚡",
  "backend": "server.py",
  "client": "kindle.html",
  "pollIntervalMs": 30000,
  "port": 5060
}
```

---

## Developing for Kindle Paperwhite 1

Kindle Paperwhite 1 (Firmware 5.6.1.1) runs an older WebKit browser engine with specific constraints:

1. **Strict ES5 JavaScript**: Modern ES6+ syntax (`const`, `let`, `=>` arrow functions, `class`, `async/await`, `Promise`, `fetch`) will throw syntax errors and crash the browser. Use `var`, standard `function() {}`, and `XMLHttpRequest`.
2. **Zero External Dependencies**: All server scripts are engineered strictly using Python 3's built-in standard library (`http.server`, `urllib`, `json`, `math`). No `pip install` required.
3. **Monochrome High Contrast**: Design in pure black (`#000000`), pure white (`#ffffff`), and medium grays (`#555555`) for crisp readability on Pearl E-Ink.

---

## Repository Structure

```
Kindle-simulator/
├── server.py               # Multi-app runtime host & auto-discovery server
├── simulator/
│   ├── index.html          # Desktop simulator interface
│   ├── kindle.html         # Kindle Paperwhite web view & app switcher
│   ├── simulator.css       # High-fidelity Kindle Paperwhite bezel styles
│   └── simulator.js        # Canvas E-ink ditherer, station selectors & controls
├── apps/                   # Directory for auto-discovered standalone apps
│   └── README.md
├── spotifykindle/          # Built-in Spotify player module
├── planekindle/            # Built-in Plane radar module
├── trainkindle/            # Built-in Sydney Trains module
├── .gitignore
└── README.md
```

## License

MIT License.
