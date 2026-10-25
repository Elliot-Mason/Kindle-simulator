(() => {
  const canvas = document.getElementById("eink-canvas");
  const ctx = canvas.getContext("2d");
  const flashEl = document.getElementById("eink-flash");
  const bezelEl = document.getElementById("kindle-bezel");
  const consoleEl = document.getElementById("console-output");
  const apiBadge = document.getElementById("api-badge");
  const telemetryProject = document.getElementById("telemetry-project");
  const telemetryRes = document.getElementById("telemetry-res");
  const telemetryTick = document.getElementById("telemetry-tick");
  const telemetryStatus = document.getElementById("telemetry-status");
  const telemetryModel = document.getElementById("telemetry-model");
  const kindleUrlBox = document.getElementById("kindle-url-box");

  // E-Ink Pearl palette constants (PW1 EY21)
  const EINK_BG = "#e5e5e0";
  const EINK_INK = "#161616";
  const EINK_MID = "#4e4e4a";
  const EINK_LIGHT_GRAY = "#c8c8c2";
  const EINK_PANEL = "#dadad4";

  // Shared Simulator + Multi-Project State
  const state = {
    activeProject: "spotify", // 'spotify' | 'plane'
    model: "pw1-browser", // 'pw1-browser' | 'pw1-jailbroken' | 'pw4'
    orientation: "landscape", // 'landscape' (1024x758) | 'portrait' (758x1024)
    engine: "kindle-hd", // 'kindle-hd' | 'pixel-212'
    scale: "large", // 'large' | 'native' | 'compact'
    cssW: 920,
    cssH: 681,
    nativeW: 1024,
    nativeH: 758,
    dpr: Math.max(1, window.devicePixelRatio || 1),
    lanUrl: "http://192.168.0.146:5050/kindle",

    // Child Project 1: spotifykindle state
    spotify: {
      source: "live",
      dither: "floyd1",
      overflowMode: "marquee",
      scrollTick: 0,
      lastPollMs: 0,
      pollIntervalMs: 5000,
      track: {
        success: true,
        hasTrack: false,
        isPlaying: false,
        title: "",
        artist: "",
        album: "",
        artworkUrl: "",
        artworkUrlSmall: "",
        progressMs: 0,
        durationMs: 0,
        errorMessage: "",
      },
      artworkImage: null,
      artworkLoadedUrl: "",
      ditheredCanvasCache: null,
      ditheredCacheKey: "",
    },

    // Child Project 2: planekindle state
    plane: {
      source: "live",
      mockPreset: 0,
      mockMotion: true,
      radarDetail: "full",
      radarMap: "waypoints",
      units: "dual",
      sweepCount: 0,
      lastPollMs: 0,
      pollIntervalMs: 30000,
      isSearchingScreen: false,
      flight: {
        success: true,
        flightFound: false,
        errorMessage: "",
        homeLat: -33.748115,
        homeLon: 151.154198,
        radiusKm: 25.0,
        sydAirport: { iata: "SYD", distanceKm: 22.1, bearingDeg: 174.5 },
        callsign: "",
        airline: "N/A",
        aircraftType: "N/A",
        depIATA: "N/A",
        depAirport: "N/A",
        depTime: "N/A",
        arrIATA: "N/A",
        arrAirport: "N/A",
        arrTime: "N/A",
        isLate: false,
        altitude: 0,
        altitudeFt: 0,
        speed: 0,
        speedKts: 0,
        heading: 0,
        headingCardinal: "N",
        verticalRate: 0,
        verticalRateFpm: 0,
        distance: 0,
        bearing: 0,
        bearingCardinal: "N",
        icao24: "",
        originCountry: "",
        squawk: "----",
        metadataSource: "",
        airborneInRadius: 0,
        nearbyFlights: [],
        updatedTime: "--:--",
      },
    },

    // Child Project 3: trainkindle state (TransportTracker)
    train: {
      source: "live",
      mockPreset: 0,
      pollIntervalMs: 30000,
      lastPollMs: 0,
      data: {
        success: true,
        trainFound: true,
        errorMessage: "",
        originStation: "Penrith",
        originPlatform: "Platform 1",
        originCode: "10101252",
        destStation: "Central",
        destPlatform: "Platform 5",
        destCode: "10101100",
        originTime: "10:30 AM",
        destTime: "11:22 AM",
        routeLabel: "T1",
        lineName: "T1 North Shore & Western Line",
        minutesUntil: 4,
        durationMins: 52,
        occupancy: "Many Seats Available",
        cars: "8 Cars",
        realtime: true,
        upcoming: [],
        lastUpdated: "--:--",
      },
    },
  };

  const TRAIN_DEMO_PRESETS = [
    {
      originStation: "Penrith",
      originPlatform: "Platform 1",
      originCode: "10101252",
      destStation: "Central",
      destPlatform: "Platform 5",
      destCode: "10101100",
      originTime: "10:30 AM",
      destTime: "11:18 AM",
      routeLabel: "T1",
      lineName: "T1 North Shore & Western Line",
      minutesUntil: 4,
      durationMins: 48,
      occupancy: "Many Seats Available",
      cars: "8 Cars",
      realtime: true,
      upcoming: [
        { departureTime: "10:46 AM", minutesUntil: 20, routeLabel: "BMT", platform: "Platform 2", arrivalTime: "11:32 AM", lineName: "Blue Mountains Line" },
        { departureTime: "11:00 AM", minutesUntil: 34, routeLabel: "T1", platform: "Platform 1", arrivalTime: "11:48 AM", lineName: "T1 Western Line" },
        { departureTime: "11:15 AM", minutesUntil: 49, routeLabel: "T1", platform: "Platform 1", arrivalTime: "12:03 PM", lineName: "T1 Western Line" },
      ],
    },
    {
      originStation: "Parramatta",
      originPlatform: "Platform 3",
      originCode: "10101229",
      destStation: "Town Hall",
      destPlatform: "Platform 2",
      destCode: "10101101",
      originTime: "10:32 AM",
      destTime: "11:01 AM",
      routeLabel: "T2",
      lineName: "T2 Inner West & Leppington Line",
      minutesUntil: 2,
      durationMins: 29,
      occupancy: "Few Seats Available",
      cars: "8 Cars",
      realtime: true,
      upcoming: [
        { departureTime: "10:38 AM", minutesUntil: 8, routeLabel: "T1", platform: "Platform 4", arrivalTime: "11:03 AM", lineName: "T1 Western Line" },
        { departureTime: "10:44 AM", minutesUntil: 14, routeLabel: "BMT", platform: "Platform 2", arrivalTime: "11:06 AM", lineName: "Blue Mountains Line" },
      ],
    },
    {
      originStation: "Hornsby",
      originPlatform: "Platform 4",
      originCode: "10101127",
      destStation: "Wynyard",
      destPlatform: "Platform 3",
      destCode: "10101102",
      originTime: "10:39 AM",
      destTime: "11:21 AM",
      routeLabel: "T9",
      lineName: "T9 Northern Line",
      minutesUntil: 9,
      durationMins: 42,
      occupancy: "Standing Room Only",
      cars: "8 Cars",
      realtime: true,
      upcoming: [
        { departureTime: "10:48 AM", minutesUntil: 18, routeLabel: "CCN", platform: "Platform 5", arrivalTime: "11:23 AM", lineName: "CCN Intercity" },
        { departureTime: "10:55 AM", minutesUntil: 25, routeLabel: "T1", platform: "Platform 4", arrivalTime: "11:39 AM", lineName: "T1 North Shore Line" },
      ],
    },
    {
      originStation: "Central",
      originPlatform: "Platform 24",
      originCode: "10101100",
      destStation: "Bondi Junction",
      destPlatform: "Platform 1",
      destCode: "10101109",
      originTime: "10:33 AM",
      destTime: "10:45 AM",
      routeLabel: "T4",
      lineName: "T4 Eastern Suburbs Line",
      minutesUntil: 3,
      durationMins: 12,
      occupancy: "Many Seats Available",
      cars: "8 Cars",
      realtime: true,
      upcoming: [
        { departureTime: "10:40 AM", minutesUntil: 10, routeLabel: "T4", platform: "Platform 24", arrivalTime: "10:52 AM", lineName: "T4 Eastern Suburbs Line" },
        { departureTime: "10:47 AM", minutesUntil: 17, routeLabel: "T4", platform: "Platform 25", arrivalTime: "10:59 AM", lineName: "T4 Eastern Suburbs Line" },
      ],
    },
  ];

  const SPOTIFY_DEMO_PRESETS = [
    {
      hasTrack: true,
      isPlaying: true,
      title: "Get Lucky (feat. Pharrell Williams and Nile Rodgers)",
      artist: "Daft Punk, Pharrell Williams, Nile Rodgers",
      album: "Random Access Memories (10th Anniversary Edition)",
      progressMs: 84000,
      durationMs: 369000,
      demoCoverType: "ram",
    },
    {
      hasTrack: true,
      isPlaying: true,
      title: "The Less I Know The Better",
      artist: "Tame Impala",
      album: "Currents",
      progressMs: 42000,
      durationMs: 216000,
      demoCoverType: "currents",
    },
    {
      hasTrack: true,
      isPlaying: true,
      title: "Everything In Its Right Place",
      artist: "Radiohead",
      album: "Kid A",
      progressMs: 115000,
      durationMs: 251000,
      demoCoverType: "kida",
    },
    {
      hasTrack: false,
      isPlaying: false,
      title: "",
      artist: "",
      album: "",
      progressMs: 0,
      durationMs: 0,
      demoCoverType: "none",
    },
  ];

  // Shared Utilities
  function log(msg, type = "info") {
    const now = new Date();
    const ts = now.toTimeString().split(" ")[0];
    const line = document.createElement("div");
    line.className = `log-line ${type}`;
    line.innerHTML = `<span class="ts">[${ts}]</span>${escapeHtml(msg)}`;
    consoleEl.appendChild(line);
    while (consoleEl.children.length > 90) {
      consoleEl.removeChild(consoleEl.firstChild);
    }
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatMsToMinSec(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  }

  function truncateStr(str, maxLen) {
    if (!str) return "";
    const s = String(str);
    if (s.length > maxLen) return s.substring(0, maxLen - 2) + "..";
    return s;
  }

  function truncatePlane(s, maxChars) {
    if (!s) return "";
    const str = String(s);
    if (str.length > maxChars) return str.substring(0, maxChars) + "..";
    return str;
  }

  function formatAltitude(alt) {
    const n = Math.round(Number(alt) || 0);
    if (Math.abs(n) < 1000) return String(n);
    return n.toLocaleString("en-US");
  }

  function headingToCardinal(deg) {
    const dirs = [
      "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
      "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
    ];
    const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
    return dirs[idx];
  }

  function getMarqueeWindow(str, maxLen, tick) {
    if (!str || str.length <= maxLen) return str || "";
    const sep = "   -   ";
    const loopStr = str + sep;
    const cycleLen = loopStr.length;

    const pauseTicks = 2;
    const stepChars = 3;
    const stepsPerCycle = Math.floor((cycleLen + stepChars - 1) / stepChars);
    const totalCycleTicks = pauseTicks + stepsPerCycle;
    const t = tick % totalCycleTicks;

    let offset = 0;
    if (t >= pauseTicks) {
      offset = ((t - pauseTicks) * stepChars) % cycleLen;
    }

    const doubled = loopStr + loopStr;
    return doubled.substring(offset, offset + maxLen);
  }

  function splitTwoLines(str, maxLen) {
    if (!str || str.length <= maxLen) {
      return { line1: str || "", line2: "", overflowed: false };
    }
    let splitIdx = -1;
    for (let i = maxLen; i >= Math.floor(maxLen / 2); i--) {
      if (str[i] === " ") {
        splitIdx = i;
        break;
      }
    }
    let line1, remainder;
    if (splitIdx > 0) {
      line1 = str.substring(0, splitIdx);
      remainder = str.substring(splitIdx + 1).trim();
    } else {
      line1 = str.substring(0, maxLen);
      remainder = str.substring(maxLen).trim();
    }
    return { line1, line2: remainder, overflowed: remainder.length > maxLen };
  }

  function triggerFullEinkFlash() {
    flashEl.classList.remove("flashing");
    void flashEl.offsetWidth;
    flashEl.classList.add("flashing");
    log("[Display] Full E-Ink Pearl waveform flash refresh triggered.");
  }

  function updateCanvasDimensions() {
    const isRecessed = state.model.startsWith("pw1");
    bezelEl.className = `kindle-bezel ${
      isRecessed ? "model-basic" : "model-pw4"
    } orient-${state.orientation}`;

    const modelNames = {
      "pw1-browser": "PW1 (EY21) · FW 5.6.1.1 Browser Mode",
      "pw1-jailbroken": "PW1 (EY21) · Jailbroken Fullscreen (KUAL/eips)",
      pw4: "Kindle Paperwhite 4 (Reference)",
    };
    telemetryModel.textContent = modelNames[state.model] || "Kindle PW1";
    telemetryProject.textContent =
      state.activeProject === "spotify"
        ? "Project: spotifykindle"
        : "Project: planekindle";

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let cssW = 920;
    let cssH = 681;
    let nativeW = 1024;
    let nativeH = 758;

    if (state.engine === "pixel-212") {
      nativeW = 212;
      nativeH = 104;
      if (state.scale === "native") {
        cssW = 212 * 4.0;
        cssH = 104 * 4.0;
      } else if (state.scale === "compact") {
        cssW = 212 * 3.2;
        cssH = 104 * 3.2;
      } else {
        // large (default)
        cssW = 212 * 4.4;
        cssH = 104 * 4.4;
      }
      telemetryRes.textContent = '212 × 104 (LilyGO T5 2.13" High-Res Scaled)';
    } else if (state.orientation === "landscape") {
      nativeW = 1024;
      nativeH = 758;
      if (state.scale === "native") {
        cssW = 1024;
        cssH = 758;
      } else if (state.scale === "compact") {
        cssW = 760;
        cssH = 562;
      } else {
        // large (default)
        cssW = 940;
        cssH = 696;
      }
      telemetryRes.textContent = "1024 × 758 (PW1 212 PPI E-Ink Pearl · Landscape)";
    } else {
      nativeW = 758;
      nativeH = 1024;
      if (state.scale === "native") {
        cssW = 758;
        cssH = 1024;
      } else if (state.scale === "compact") {
        cssW = 500;
        cssH = 675;
      } else {
        // large (default)
        cssW = 600;
        cssH = 810;
      }
      telemetryRes.textContent = "758 × 1024 (PW1 212 PPI E-Ink Pearl · Portrait)";
    }

    state.cssW = cssW;
    state.cssH = cssH;
    state.nativeW = nativeW;
    state.nativeH = nativeH;
    state.dpr = dpr;

    // Physical backing store resolution matches high-DPI monitor pixels:
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = Math.round(cssW) + "px";
    canvas.style.height = Math.round(cssH) + "px";
  }

  function drawFw5611BrowserChrome(W) {
    ctx.fillStyle = EINK_BG;
    ctx.fillRect(0, 0, W, 86);
    ctx.fillStyle = EINK_INK;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Elliot's Kindle", 14, 8);
    const now = new Date();
    const clockStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    ctx.textAlign = "right";
    ctx.fillText(`Wi-Fi   100%   ${clockStr}`, W - 14, 8);
    ctx.textAlign = "left";
    ctx.fillRect(0, 30, W, 1);

    ctx.fillStyle = "#d6d6d0";
    ctx.fillRect(0, 31, W, 53);
    ctx.fillStyle = EINK_BG;
    ctx.strokeStyle = EINK_INK;
    ctx.lineWidth = 2;
    ctx.fillRect(60, 40, W - 180, 34);
    ctx.strokeRect(60, 40, W - 180, 34);

    ctx.fillStyle = EINK_INK;
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("⌂", 22, 48);
    ctx.font = "15px monospace";
    ctx.fillText(state.lanUrl, 72, 49);

    ctx.font = "bold 16px sans-serif";
    ctx.fillText("↻", W - 100, 48);
    ctx.fillText("⋮", W - 45, 48);

    ctx.fillRect(0, 84, W, 2);
    return 86;
  }

  // ==========================================================================
  // CHILD PROJECT 1 RENDERER: SPOTIFYKINDLE
  // ==========================================================================
  function createDemoCoverCanvas(type) {
    const c = document.createElement("canvas");
    c.width = 360;
    c.height = 360;
    const g = c.getContext("2d");

    if (type === "ram") {
      const grad = g.createLinearGradient(0, 0, 360, 360);
      grad.addColorStop(0, "#101010");
      grad.addColorStop(0.5, "#606060");
      grad.addColorStop(1, "#e8e8e8");
      g.fillStyle = grad;
      g.fillRect(0, 0, 360, 360);

      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(180, 165, 108, 0, Math.PI * 2);
      g.fill();

      g.fillStyle = "#181818";
      g.beginPath();
      g.arc(180, 165, 92, 0, Math.PI * 2);
      g.fill();

      const visor = g.createLinearGradient(100, 110, 260, 200);
      visor.addColorStop(0, "#ffffff");
      visor.addColorStop(0.5, "#888888");
      visor.addColorStop(1, "#222222");
      g.fillStyle = visor;
      g.fillRect(108, 128, 144, 58);

      g.fillStyle = "#ffffff";
      g.font = "bold 24px Georgia, serif";
      g.textAlign = "center";
      g.fillText("DAFT PUNK", 180, 320);
    } else if (type === "currents") {
      g.fillStyle = "#f5f5f5";
      g.fillRect(0, 0, 360, 360);
      for (let i = -360; i < 720; i += 15) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 200, 360);
        g.lineWidth = 6;
        g.strokeStyle = "#151515";
        g.stroke();
      }
      const sphere = g.createRadialGradient(165, 165, 10, 180, 180, 85);
      sphere.addColorStop(0, "#ffffff");
      sphere.addColorStop(0.6, "#777777");
      sphere.addColorStop(1, "#111111");
      g.fillStyle = sphere;
      g.beginPath();
      g.arc(180, 180, 82, 0, Math.PI * 2);
      g.fill();
    } else {
      const sky = g.createLinearGradient(0, 0, 0, 360);
      sky.addColorStop(0, "#1c1c1c");
      sky.addColorStop(0.6, "#b8b8b8");
      sky.addColorStop(1, "#ececec");
      g.fillStyle = sky;
      g.fillRect(0, 0, 360, 360);

      g.fillStyle = "#121212";
      g.beginPath();
      g.moveTo(0, 290);
      g.lineTo(75, 155);
      g.lineTo(140, 245);
      g.lineTo(220, 120);
      g.lineTo(295, 235);
      g.lineTo(360, 165);
      g.lineTo(360, 360);
      g.lineTo(0, 360);
      g.closePath();
      g.fill();
    }
    return c;
  }

  function getDitheredArtwork(targetSize) {
    const sp = state.spotify;
    const sourceKey =
      sp.source === "mock"
        ? `mock:${sp.track.demoCoverType}`
        : `url:${sp.artworkLoadedUrl}`;
    const cacheKey = `${sourceKey}|${targetSize}|${sp.dither}`;

    if (sp.ditheredCanvasCache && sp.ditheredCacheKey === cacheKey) {
      return sp.ditheredCanvasCache;
    }

    let srcDrawable = null;
    if (sp.source === "mock") {
      if (sp.track.hasTrack) {
        srcDrawable = createDemoCoverCanvas(sp.track.demoCoverType || "ram");
      }
    } else if (
      sp.artworkImage &&
      sp.artworkImage.complete &&
      sp.artworkImage.naturalWidth > 0
    ) {
      srcDrawable = sp.artworkImage;
    }

    if (!srcDrawable) return null;

    const off = document.createElement("canvas");
    off.width = targetSize;
    off.height = targetSize;
    const octx = off.getContext("2d");
    octx.drawImage(srcDrawable, 0, 0, targetSize, targetSize);

    const imgData = octx.getImageData(0, 0, targetSize, targetSize);
    const data = imgData.data;
    const totalPixels = targetSize * targetSize;
    const gray = new Int16Array(totalPixels);

    let minLuma = 255;
    let maxLuma = 0;
    for (let i = 0; i < totalPixels; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const luma = (r * 77 + g * 150 + b * 29) >> 8;
      gray[i] = luma;
      if (luma < minLuma) minLuma = luma;
      if (luma > maxLuma) maxLuma = luma;
    }

    const range = maxLuma - minLuma;
    if (range > 20) {
      for (let i = 0; i < totalPixels; i++) {
        gray[i] = Math.floor(((gray[i] - minLuma) * 255) / range);
      }
    }

    for (let y = 0; y < targetSize; y++) {
      for (let x = 0; x < targetSize; x++) {
        const idx = y * targetSize + x;
        let oldPixel = gray[idx];
        if (oldPixel < 0) oldPixel = 0;
        if (oldPixel > 255) oldPixel = 255;

        let newPixel;
        if (sp.dither === "gray16") {
          const level = Math.round((oldPixel / 255) * 15);
          newPixel = Math.round((level / 15) * 255);
        } else {
          newPixel = oldPixel < 128 ? 0 : 255;
        }

        const quantError = oldPixel - newPixel;
        gray[idx] = newPixel;

        if (sp.dither === "atkinson1") {
          const err8 = Math.trunc(quantError / 8);
          if (x + 1 < targetSize) gray[y * targetSize + (x + 1)] += err8;
          if (x + 2 < targetSize) gray[y * targetSize + (x + 2)] += err8;
          if (y + 1 < targetSize && x - 1 >= 0)
            gray[(y + 1) * targetSize + (x - 1)] += err8;
          if (y + 1 < targetSize) gray[(y + 1) * targetSize + x] += err8;
          if (y + 1 < targetSize && x + 1 < targetSize)
            gray[(y + 1) * targetSize + (x + 1)] += err8;
          if (y + 2 < targetSize) gray[(y + 2) * targetSize + x] += err8;
        } else {
          if (x + 1 < targetSize)
            gray[y * targetSize + (x + 1)] += Math.trunc((quantError * 7) / 16);
          if (y + 1 < targetSize && x - 1 >= 0)
            gray[(y + 1) * targetSize + (x - 1)] += Math.trunc((quantError * 3) / 16);
          if (y + 1 < targetSize)
            gray[(y + 1) * targetSize + x] += Math.trunc((quantError * 5) / 16);
          if (y + 1 < targetSize && x + 1 < targetSize)
            gray[(y + 1) * targetSize + (x + 1)] += Math.trunc((quantError * 1) / 16);
        }
      }
    }

    for (let i = 0; i < totalPixels; i++) {
      const t = gray[i] / 255;
      data[i * 4] = Math.round(24 + t * (229 - 24));
      data[i * 4 + 1] = Math.round(24 + t * (229 - 24));
      data[i * 4 + 2] = Math.round(24 + t * (224 - 24));
      data[i * 4 + 3] = 255;
    }

    octx.putImageData(imgData, 0, 0);
    sp.ditheredCanvasCache = off;
    sp.ditheredCacheKey = cacheKey;
    return off;
  }

  function renderSpotifyPixel212() {
    const sp = state.spotify;
    const W = 212;
    const H = 104;
    ctx.fillStyle = EINK_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = EINK_INK;
    ctx.strokeStyle = EINK_INK;
    ctx.font = "10px Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const d = sp.track;
    if (!d.success && sp.source === "live") {
      ctx.fillRect(0, 0, W, 14);
      ctx.fillStyle = EINK_BG;
      ctx.fillText("Spotify Player - Error", 5, 2);
      ctx.fillStyle = EINK_INK;
      ctx.fillText(truncateStr(d.errorMessage || "Error", 30), 5, 24);
      return;
    }

    if (!d.hasTrack) {
      ctx.fillRect(0, 0, W, 16);
      ctx.fillStyle = EINK_BG;
      ctx.fillText("SPOTIFY PLAYER", 58, 3);
      ctx.fillStyle = EINK_INK;
      ctx.fillText("No Track Currently Playing", 28, 40);
      ctx.fillText("Play music on Spotify app...", 22, 56);
      return;
    }

    const art = getDitheredArtwork(64);
    if (art) {
      ctx.drawImage(art, 4, 4, 64, 64);
    } else {
      ctx.strokeRect(4.5, 4.5, 63, 63);
      ctx.fillText("NO ART", 18, 30);
    }

    ctx.fillRect(71, 0, 1, 68);

    const maxChars = 22;
    const titleText = d.title || "Unknown Title";
    const artistText = d.artist || "Unknown Artist";
    const albumText = d.album || "";

    if (sp.overflowMode === "marquee") {
      ctx.fillText(getMarqueeWindow(titleText, maxChars, sp.scrollTick), 75, 4);
      ctx.fillText(getMarqueeWindow(artistText, maxChars, sp.scrollTick), 75, 18);
      ctx.fillText(getMarqueeWindow(albumText, maxChars, sp.scrollTick), 75, 32);

      ctx.fillRect(75, 48, 62, 14);
      ctx.fillStyle = EINK_BG;
      ctx.fillText(d.isPlaying ? "PLAYING" : "PAUSED", 82, 50);
      ctx.fillStyle = EINK_INK;
    } else if (sp.overflowMode === "hybrid") {
      const split = splitTwoLines(titleText, maxChars);
      ctx.fillText(split.line1, 75, 4);
      let nextY = 18;
      if (split.line2.length > 0) {
        ctx.fillText(
          split.overflowed
            ? getMarqueeWindow(split.line2, maxChars, sp.scrollTick)
            : split.line2,
          75,
          14
        );
        nextY = 26;
      }
      ctx.fillText(getMarqueeWindow(artistText, maxChars, sp.scrollTick), 75, nextY);
      ctx.fillText(getMarqueeWindow(albumText, maxChars, sp.scrollTick), 75, nextY + 12);

      ctx.fillRect(75, 51, 62, 14);
      ctx.fillStyle = EINK_BG;
      ctx.fillText(d.isPlaying ? "PLAYING" : "PAUSED", 82, 53);
      ctx.fillStyle = EINK_INK;
    } else {
      ctx.fillText(truncateStr(titleText, maxChars), 75, 4);
      ctx.fillText(truncateStr(artistText, maxChars), 75, 18);
      ctx.fillText(truncateStr(albumText, maxChars), 75, 32);
    }

    ctx.fillRect(0, 70, W, 1);

    const timeStr = `${formatMsToMinSec(d.progressMs)} / ${formatMsToMinSec(d.durationMs)}`;
    ctx.fillText(timeStr, 4, 75);

    if (sp.overflowMode === "wrap") {
      ctx.fillRect(96, 74, 54, 12);
      ctx.fillStyle = EINK_BG;
      ctx.fillText(d.isPlaying ? "PLAYING" : "PAUSED", 101, 75);
      ctx.fillStyle = EINK_INK;
    }

    let pct = d.durationMs > 0 ? Math.floor((d.progressMs * 100) / d.durationMs) : 0;
    if (pct > 100) pct = 100;
    ctx.fillText(`${pct}%`, 175, 75);

    ctx.strokeRect(4.5, 90.5, 203, 7);
    let fillW = d.durationMs > 0 ? Math.floor((d.progressMs * 200) / d.durationMs) : 0;
    if (fillW > 200) fillW = 200;
    if (fillW > 0) {
      ctx.fillRect(6, 92, fillW, 4);
    }
  }

  function renderSpotifyPW1() {
    const sp = state.spotify;
    const W = state.nativeW;
    const H = state.nativeH;
    ctx.fillStyle = EINK_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = EINK_INK;
    ctx.strokeStyle = EINK_INK;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    let topY = 0;
    if (state.model === "pw1-browser") {
      topY = drawFw5611BrowserChrome(W);
    }

    const now = new Date();
    const clockStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("SPOTIFY KINDLE  ·  PW1 (EY21)", 28, topY + 14);
    ctx.textAlign = "right";
    ctx.fillText(
      state.model === "pw1-browser"
        ? "[ App: Spotify ]  [ Layout ]  [ Flash ]"
        : `${clockStr}   100%`,
      W - 28,
      topY + 14
    );
    ctx.textAlign = "left";
    ctx.fillRect(0, topY + 44, W, 3);

    const contentY = topY + 47;
    const contentH = H - contentY;
    const d = sp.track;

    if (!d.success && sp.source === "live") {
      ctx.font = "bold 30px Georgia, serif";
      ctx.fillText("Spotify Connection Notice", 48, contentY + 90);
      ctx.font = "20px sans-serif";
      ctx.fillText(d.errorMessage || "Unable to reach Spotify API.", 48, contentY + 145);
      return;
    }

    if (!d.hasTrack) {
      ctx.textAlign = "center";
      ctx.font = "bold 34px Georgia, serif";
      ctx.fillText("No Track Currently Playing", W / 2, contentY + contentH / 2 - 50);
      ctx.font = "20px sans-serif";
      ctx.fillStyle = EINK_MID;
      ctx.fillText(
        "Play a song on Spotify, or click 'Simulator Demo' in the left sidebar.",
        W / 2,
        contentY + contentH / 2 + 5
      );
      ctx.fillStyle = EINK_INK;
      ctx.textAlign = "left";
      return;
    }

    if (state.orientation === "landscape") {
      const bottomBarH = 148;
      const mainAreaH = contentH - bottomBarH;
      const artSize = Math.min(390, mainAreaH - 48);
      const artX = 36;
      const artY = contentY + Math.floor((mainAreaH - artSize) / 2);

      const art = getDitheredArtwork(artSize);
      if (art) {
        ctx.drawImage(art, artX, artY, artSize, artSize);
        ctx.lineWidth = 3;
        ctx.strokeRect(artX, artY, artSize, artSize);
      } else {
        ctx.lineWidth = 3;
        ctx.strokeRect(artX, artY, artSize, artSize);
      }

      const divX = artX + artSize + 34;
      ctx.fillRect(divX, contentY, 3, mainAreaH);

      const metaX = divX + 36;
      const maxChars = 26;
      const titleText = d.title || "Unknown Title";
      const artistText = d.artist || "Unknown Artist";
      const albumText = d.album || "";

      ctx.font = "bold 15px sans-serif";
      ctx.fillStyle = EINK_MID;
      ctx.fillText("NOW PLAYING ON SPOTIFY", metaX, artY + 4);
      ctx.fillStyle = EINK_INK;

      if (sp.overflowMode === "marquee") {
        ctx.font = "bold 36px Georgia, serif";
        ctx.fillText(getMarqueeWindow(titleText, maxChars, sp.scrollTick), metaX, artY + 42);

        ctx.font = "bold 25px sans-serif";
        ctx.fillText(getMarqueeWindow(artistText, 30, sp.scrollTick), metaX, artY + 108);

        ctx.font = "italic 22px Georgia, serif";
        ctx.fillStyle = EINK_MID;
        ctx.fillText(getMarqueeWindow(albumText, 32, sp.scrollTick), metaX, artY + 158);
        ctx.fillStyle = EINK_INK;
      } else {
        const split = splitTwoLines(titleText, maxChars);
        ctx.font = "bold 34px Georgia, serif";
        ctx.fillText(split.line1, metaX, artY + 38);
        let nextY = artY + 92;
        if (split.line2) {
          const line2Txt =
            sp.overflowMode === "hybrid" && split.overflowed
              ? getMarqueeWindow(split.line2, maxChars, sp.scrollTick)
              : truncateStr(split.line2, maxChars);
          ctx.fillText(line2Txt, metaX, artY + 82);
          nextY = artY + 138;
        }
        ctx.font = "bold 24px sans-serif";
        ctx.fillText(
          sp.overflowMode === "hybrid"
            ? getMarqueeWindow(artistText, 30, sp.scrollTick)
            : truncateStr(artistText, 30),
          metaX,
          nextY
        );
        ctx.font = "italic 21px Georgia, serif";
        ctx.fillStyle = EINK_MID;
        ctx.fillText(
          sp.overflowMode === "hybrid"
            ? getMarqueeWindow(albumText, 32, sp.scrollTick)
            : truncateStr(albumText, 32),
          metaX,
          nextY + 42
        );
        ctx.fillStyle = EINK_INK;
      }

      const badgeY = artY + artSize - 48;
      ctx.fillRect(metaX, badgeY, 164, 46);
      ctx.fillStyle = EINK_BG;
      ctx.font = "bold 20px monospace";
      ctx.fillText(d.isPlaying ? "▶ PLAYING" : "❚❚ PAUSED", metaX + 22, badgeY + 12);
      ctx.fillStyle = EINK_INK;

      const sepY = contentY + mainAreaH;
      ctx.fillRect(0, sepY, W, 3);

      const timeStr = `${formatMsToMinSec(d.progressMs)} / ${formatMsToMinSec(d.durationMs)}`;
      ctx.font = "bold 28px monospace";
      ctx.fillText(timeStr, 36, sepY + 24);

      let pct = d.durationMs > 0 ? Math.floor((d.progressMs * 100) / d.durationMs) : 0;
      if (pct > 100) pct = 100;
      ctx.textAlign = "right";
      ctx.fillText(`${pct}%`, W - 36, sepY + 24);
      ctx.textAlign = "left";

      const barX = 36;
      const barY = sepY + 76;
      const barW = W - 72;
      const barH = 34;
      ctx.lineWidth = 3;
      ctx.strokeRect(barX, barY, barW, barH);

      const innerMax = barW - 12;
      const fillW =
        d.durationMs > 0
          ? Math.min(innerMax, Math.floor((d.progressMs * innerMax) / d.durationMs))
          : 0;
      if (fillW > 0) {
        ctx.fillRect(barX + 6, barY + 6, fillW, barH - 12);
      }
    } else {
      const artSize = state.model === "pw1-browser" ? 440 : 490;
      const artX = Math.floor((W - artSize) / 2);
      const artY = contentY + 28;

      const art = getDitheredArtwork(artSize);
      if (art) {
        ctx.drawImage(art, artX, artY, artSize, artSize);
        ctx.lineWidth = 3;
        ctx.strokeRect(artX, artY, artSize, artSize);
      } else {
        ctx.lineWidth = 3;
        ctx.strokeRect(artX, artY, artSize, artSize);
      }

      const textStartY = artY + artSize + 28;
      const maxChars = 28;
      const titleText = d.title || "Unknown Title";
      const artistText = d.artist || "Unknown Artist";
      const albumText = d.album || "";

      ctx.textAlign = "center";
      ctx.font = "bold 34px Georgia, serif";
      ctx.fillText(
        sp.overflowMode === "marquee"
          ? getMarqueeWindow(titleText, maxChars, sp.scrollTick)
          : truncateStr(titleText, maxChars),
        W / 2,
        textStartY
      );

      ctx.font = "bold 25px sans-serif";
      ctx.fillText(
        sp.overflowMode === "marquee"
          ? getMarqueeWindow(artistText, 34, sp.scrollTick)
          : truncateStr(artistText, 34),
        W / 2,
        textStartY + 52
      );

      ctx.font = "italic 21px Georgia, serif";
      ctx.fillStyle = EINK_MID;
      ctx.fillText(truncateStr(albumText, 38), W / 2, textStartY + 94);
      ctx.fillStyle = EINK_INK;

      const badgeW = 160;
      ctx.fillRect((W - badgeW) / 2, textStartY + 138, badgeW, 40);
      ctx.fillStyle = EINK_BG;
      ctx.font = "bold 18px monospace";
      ctx.fillText(d.isPlaying ? "▶ PLAYING" : "❚❚ PAUSED", W / 2, textStartY + 149);
      ctx.fillStyle = EINK_INK;

      ctx.textAlign = "left";
      const sepY = H - 135;
      ctx.fillRect(0, sepY, W, 3);

      const barX = 42;
      const barW = W - 84;
      ctx.font = "bold 24px monospace";
      ctx.fillText(
        `${formatMsToMinSec(d.progressMs)} / ${formatMsToMinSec(d.durationMs)}`,
        barX,
        sepY + 20
      );
      let pct = d.durationMs > 0 ? Math.floor((d.progressMs * 100) / d.durationMs) : 0;
      if (pct > 100) pct = 100;
      ctx.textAlign = "right";
      ctx.fillText(`${pct}%`, W - 42, sepY + 20);
      ctx.textAlign = "left";

      ctx.lineWidth = 3;
      ctx.strokeRect(barX, sepY + 64, barW, 30);
      const innerMax = barW - 10;
      const fillW =
        d.durationMs > 0
          ? Math.min(innerMax, Math.floor((d.progressMs * innerMax) / d.durationMs))
          : 0;
      if (fillW > 0) {
        ctx.fillRect(barX + 5, sepY + 69, fillW, 20);
      }
    }
  }

  // ==========================================================================
  // CHILD PROJECT 2 RENDERER: PLANEKINDLE
  // ==========================================================================
  function renderPlanePixel212() {
    const pl = state.plane;
    const W = 212;
    const H = 104;
    ctx.fillStyle = EINK_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = EINK_INK;
    ctx.strokeStyle = EINK_INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const d = pl.flight;

    if (pl.isSearchingScreen) {
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("Searching...", 50, 43);
      return;
    }

    if (!d.success) {
      ctx.font = "9px Consolas, monospace";
      ctx.fillText(d.updatedTime || "12:00 PM", 150, 5);
      ctx.fillText("Fetch Failed: " + truncatePlane(d.errorMessage || "Error", 26), 5, 25);
      return;
    }

    if (!d.flightFound) {
      ctx.fillRect(0, 16, 212, 1);
      ctx.fillRect(0, 88, 212, 1);
      ctx.font = "9px Consolas, monospace";
      ctx.fillText("Plane Tracker", 5, 4);
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("No flights", 55, 34);
      ctx.font = "9px Consolas, monospace";
      ctx.fillText("in range", 85, 60);
      ctx.fillText("Updated: " + (d.updatedTime || "--:--"), 5, 92);
      ctx.fillText("WiFi", 170, 92);
      return;
    }

    ctx.fillRect(0, 16, 212, 1);
    ctx.fillRect(0, 40, 212, 1);
    ctx.fillRect(0, 64, 212, 1);
    ctx.fillRect(0, 88, 212, 1);

    let callsignText = d.callsign || "UNKNOWN";
    if (d.isLate) callsignText += " LATE";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(callsignText, 5, 2);

    ctx.font = "9px Consolas, monospace";
    ctx.fillText("Plane Tracker", 130, 4);
    ctx.fillText(truncatePlane(d.airline || "N/A", 26), 5, 19);
    ctx.fillText("Type: " + truncatePlane(d.aircraftType || "N/A", 20), 5, 29);

    let depStr = "FROM: " + (d.depIATA || "N/A");
    if (d.depAirport && d.depAirport !== "N/A") {
      depStr += " (" + truncatePlane(d.depAirport, 12) + ")";
    }
    ctx.fillText(depStr, 5, 43);
    if (d.depTime && d.depTime !== "N/A") ctx.fillText(d.depTime, 182, 43);

    let arrStr = "TO:   " + (d.arrIATA || "N/A");
    if (d.arrAirport && d.arrAirport !== "N/A") {
      arrStr += " (" + truncatePlane(d.arrAirport, 12) + ")";
    }
    ctx.fillText(arrStr, 5, 53);
    if (d.arrTime && d.arrTime !== "N/A") ctx.fillText(d.arrTime, 182, 53);

    ctx.fillText(`Alt: ${formatAltitude(d.altitude)}m`, 5, 67);
    ctx.fillText(`Spd: ${Math.round(d.speed)}km/h`, 110, 67);
    ctx.fillText(`Hdg: ${Math.round(d.heading)} deg`, 5, 77);
    ctx.fillText(`Dist: ${Number(d.distance).toFixed(1)}km`, 110, 77);
    ctx.fillText("Updated: " + (d.updatedTime || "--:--"), 5, 92);
    ctx.fillText("WiFi", 170, 92);
  }

  function drawAircraftIcon(cx, cy, headingDeg, size, isPrimary) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((headingDeg || 0) * Math.PI) / 180);
    ctx.fillStyle = EINK_INK;
    ctx.strokeStyle = EINK_INK;
    ctx.lineWidth = isPrimary ? 2 : 1.5;

    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.18, -size * 0.35);
    ctx.lineTo(size * 0.95, size * 0.15);
    ctx.lineTo(size * 0.95, size * 0.32);
    ctx.lineTo(size * 0.2, size * 0.12);
    ctx.lineTo(size * 0.15, size * 0.68);
    ctx.lineTo(size * 0.45, size * 0.88);
    ctx.lineTo(size * 0.45, size * 1.0);
    ctx.lineTo(0, size * 0.85);
    ctx.lineTo(-size * 0.45, size * 1.0);
    ctx.lineTo(-size * 0.45, size * 0.88);
    ctx.lineTo(-size * 0.15, size * 0.68);
    ctx.lineTo(-size * 0.2, size * 0.12);
    ctx.lineTo(-size * 0.95, size * 0.32);
    ctx.lineTo(-size * 0.95, size * 0.15);
    ctx.lineTo(-size * 0.18, -size * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Geographic vector data for Sydney Airspace (Coastline, Harbour, Waterways, Runways, Islands, Fixes)
  const SYD_MAP_DATA = {
    oceanCoast: [
      [-33.555, 151.340], [-33.580, 151.332], [-33.600, 151.328], [-33.618, 151.332],
      [-33.633, 151.334], [-33.652, 151.326], [-33.662, 151.323], [-33.678, 151.314],
      [-33.685, 151.312], [-33.702, 151.306], [-33.715, 151.305], [-33.732, 151.305],
      [-33.745, 151.318], [-33.755, 151.300], [-33.770, 151.296], [-33.782, 151.291],
      [-33.796, 151.290], [-33.801, 151.297], [-33.816, 151.299]
    ],
    harbourNorth: [
      [-33.816, 151.299], [-33.812, 151.282], [-33.801, 151.284], [-33.817, 151.258],
      [-33.805, 151.243], [-33.785, 151.220], [-33.814, 151.243], [-33.826, 151.252],
      [-33.839, 151.244], [-33.848, 151.238], [-33.844, 151.225], [-33.851, 151.215],
      [-33.852, 151.210], [-33.848, 151.190], [-33.838, 151.170], [-33.836, 151.146],
      [-33.820, 151.100], [-33.815, 151.085], [-33.822, 151.050], [-33.815, 151.005]
    ],
    harbourSouth: [
      [-33.815, 151.005], [-33.828, 151.015], [-33.830, 151.065], [-33.845, 151.120],
      [-33.847, 151.155], [-33.853, 151.178], [-33.864, 151.196], [-33.868, 151.200],
      [-33.858, 151.211], [-33.856, 151.216], [-33.861, 151.223], [-33.868, 151.234],
      [-33.863, 151.248], [-33.865, 151.258], [-33.868, 151.266], [-33.847, 151.275],
      [-33.842, 151.281], [-33.833, 151.282]
    ],
    easternCoast: [
      [-33.833, 151.282], [-33.854, 151.283], [-33.891, 151.278], [-33.903, 151.272],
      [-33.912, 151.267], [-33.923, 151.259], [-33.951, 151.258], [-33.966, 151.254],
      [-33.980, 151.249], [-33.998, 151.247]
    ],
    botanyBay: [
      [-33.998, 151.247], [-33.993, 151.235], [-33.978, 151.220], [-33.970, 151.210],
      [-33.959, 151.192], [-33.965, 151.182], [-33.955, 151.162], [-33.968, 151.155],
      [-33.988, 151.152], [-33.998, 151.144], [-34.005, 151.135], [-34.012, 151.160],
      [-34.008, 151.205], [-34.005, 151.225], [-34.018, 151.238]
    ],
    pittwater: [
      [-33.580, 151.332], [-33.605, 151.320], [-33.630, 151.315], [-33.655, 151.300],
      [-33.655, 151.280], [-33.620, 151.285], [-33.585, 151.295], [-33.555, 151.310],
      [-33.550, 151.250]
    ],
    cooksRiver: [
      [-33.918, 151.148], [-33.932, 151.154], [-33.945, 151.162], [-33.955, 151.162]
    ],
    narrabeenLagoon: [
      [-33.715, 151.305], [-33.710, 151.285], [-33.722, 151.272], [-33.728, 151.295], [-33.715, 151.305]
    ],
    middleHarbourBranches: [
      [-33.805, 151.243], [-33.785, 151.220], [-33.774, 151.205], [-33.765, 151.225]
    ],
    islands: [
      [-33.847, 151.171, 3.5, "Cockatoo"],
      [-33.853, 151.196, 2.5, "Goat"],
      [-33.859, 151.261, 2.5, "Shark"],
      [-33.861, 151.246, 2.0, "Clark"],
      [-33.555, 151.310, 4.0, "Lion"]
    ],
    runways: [
      [[-33.930, 151.171], [-33.965, 151.182]], // YSSY 16R / 34L (3,962 m main runway)
      [[-33.938, 151.185], [-33.959, 151.192]], // YSSY 16L / 34R (2,438 m parallel runway)
      [[-33.944, 151.164], [-33.954, 151.188]], // YSSY 07 / 25 (2,530 m cross runway)
    ],
    ysbkRunways: [
      [[-33.922, 150.982], [-33.926, 150.995]], // YSBK Bankstown 11/29
    ],
    extendedApproaches: [
      [[-33.865, 151.135], [-33.930, 151.171]], // 16R North approach guide (8 km)
      [[-34.030, 151.218], [-33.965, 151.182]], // 34L South approach guide (8 km)
    ],
    keyLocations: [
      { name: "YSSY", desc: "SYD AIRPORT", lat: -33.9461, lon: 151.1772, type: "airport" },
      { name: "YSBK", desc: "BANKSTOWN", lat: -33.9242, lon: 150.9883, type: "airport" },
      { name: "CBD / BRG", desc: "HARBOUR BRIDGE", lat: -33.8523, lon: 151.2108, type: "bridge" },
      { name: "MANLY", desc: "MANLY BEACH", lat: -33.7997, lon: 151.2844, type: "beach" },
      { name: "N HEAD", desc: "NORTH HEAD", lat: -33.8160, lon: 151.2990, type: "headland" },
      { name: "S HEAD", desc: "SOUTH HEAD", lat: -33.8330, lon: 151.2820, type: "headland" },
      { name: "BONDI", desc: "BONDI BEACH", lat: -33.8910, lon: 151.2780, type: "beach" },
      { name: "COOGEE", desc: "COOGEE BEACH", lat: -33.9230, lon: 151.2590, type: "beach" },
      { name: "LNG REEF", desc: "LONG REEF", lat: -33.7450, lon: 151.3180, type: "headland" },
      { name: "NARRABEEN", desc: "LAGOON", lat: -33.7150, lon: 151.3050, type: "beach" },
      { name: "PLM BCH", desc: "PALM BEACH", lat: -33.5850, lon: 151.3250, type: "beach" },
      { name: "PARRA", desc: "PARRAMATTA", lat: -33.8150, lon: 151.0050, type: "city" },
      { name: "CHATSWOOD", desc: "CHATSWOOD", lat: -33.7960, lon: 151.1800, type: "city" },
      { name: "HORNSBY", desc: "HORNSBY", lat: -33.7030, lon: 151.0980, type: "city" },
      { name: "OLYMPIC PK", desc: "OLYMPIC PARK", lat: -33.8470, lon: 151.0650, type: "landmark" },
      { name: "BOTANY BAY", desc: "BOTANY BAY", lat: -33.9980, lon: 151.1850, type: "bay" },
    ],
    aviationFixes: [
      { name: "SOSIK", lat: -33.6200, lon: 151.1900 },
      { name: "KABEK", lat: -33.8800, lon: 151.3600 },
      { name: "RIVET", lat: -34.0200, lon: 151.1600 },
    ]
  };

  function drawSydneyRadarMap(cx, cy, radiusPx, d, mapMode) {
    if (mapMode === "off") return;

    const homeLat = Number(d.homeLat) || -33.748115;
    const homeLon = Number(d.homeLon) || 151.154198;
    const maxKm = Number(d.radiusKm) || 25.0;
    const cosLat = Math.cos((homeLat * Math.PI) / 180);
    const pxPerKm = radiusPx / maxKm;

    function toPx(lat, lon) {
      const dx = (lon - homeLon) * 111.32 * cosLat;
      const dy = (lat - homeLat) * 110.57;
      return [cx + dx * pxPerKm, cy - dy * pxPerKm];
    }

    ctx.save();
    // Clip strictly within circular radar scope
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx - 1, 0, Math.PI * 2);
    ctx.clip();

    const waterFill = "#eae9e3"; // E-Ink Level 14 Light Gray tint
    const coastStroke = "#666666";

    function tracePoly(pts) {
      if (!pts || pts.length === 0) return;
      const p0 = toPx(pts[0][0], pts[0][1]);
      ctx.moveTo(p0[0], p0[1]);
      for (let i = 1; i < pts.length; i++) {
        const p = toPx(pts[i][0], pts[i][1]);
        ctx.lineTo(p[0], p[1]);
      }
    }

    // ------------------------------------------------------------------------
    // LAYER A: COASTLINES & WATERWAYS (Drawn in 'detailed' and 'sydney' modes)
    // ------------------------------------------------------------------------
    const isSydneyArea = Math.abs(homeLat - (-33.8)) < 0.8 && Math.abs(homeLon - 151.15) < 0.8;
    if ((mapMode === "detailed" || mapMode === "sydney") && isSydneyArea) {
      // 1. Pacific Ocean (East)
      ctx.beginPath();
      tracePoly(SYD_MAP_DATA.oceanCoast);
      const shPt = toPx(-33.833, 151.282);
      ctx.lineTo(shPt[0], shPt[1]);
      tracePoly(SYD_MAP_DATA.easternCoast);
      const csPt = toPx(-34.018, 151.238);
      ctx.lineTo(csPt[0], csPt[1]);
      const seBound = toPx(-34.15, 151.80);
      const neBound = toPx(-33.40, 151.80);
      ctx.lineTo(seBound[0], seBound[1]);
      ctx.lineTo(neBound[0], neBound[1]);
      ctx.closePath();
      ctx.fillStyle = waterFill;
      ctx.fill();
      ctx.strokeStyle = coastStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 2. Sydney Harbour & Parramatta River
      ctx.beginPath();
      tracePoly(SYD_MAP_DATA.harbourNorth);
      tracePoly(SYD_MAP_DATA.harbourSouth);
      ctx.closePath();
      ctx.fillStyle = waterFill;
      ctx.fill();
      ctx.strokeStyle = coastStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 3. Botany Bay
      ctx.beginPath();
      tracePoly(SYD_MAP_DATA.botanyBay);
      ctx.closePath();
      ctx.fillStyle = waterFill;
      ctx.fill();
      ctx.strokeStyle = coastStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 4. Broken Bay & Pittwater
      ctx.beginPath();
      tracePoly(SYD_MAP_DATA.pittwater);
      ctx.closePath();
      ctx.fillStyle = waterFill;
      ctx.fill();
      ctx.strokeStyle = coastStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 5. Detailed mode extra waterways & islands
      if (mapMode === "detailed") {
        // Cooks River channel
        ctx.beginPath();
        tracePoly(SYD_MAP_DATA.cooksRiver);
        ctx.strokeStyle = coastStroke;
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Narrabeen Lagoon
        ctx.beginPath();
        tracePoly(SYD_MAP_DATA.narrabeenLagoon);
        ctx.closePath();
        ctx.fillStyle = waterFill;
        ctx.fill();
        ctx.strokeStyle = coastStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Middle Harbour upper branch
        ctx.beginPath();
        tracePoly(SYD_MAP_DATA.middleHarbourBranches);
        ctx.strokeStyle = coastStroke;
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Islands (white land with charcoal stroke)
        SYD_MAP_DATA.islands.forEach((isl) => {
          const p = toPx(isl[0], isl[1]);
          ctx.beginPath();
          ctx.arc(p[0], p[1], isl[2], 0, Math.PI * 2);
          ctx.fillStyle = EINK_BG;
          ctx.fill();
          ctx.strokeStyle = coastStroke;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        });
      }
    }

    // ------------------------------------------------------------------------
    // LAYER B: RUNWAYS & EXTENDED APPROACH PATHS (Dynamic Worldwide)
    // ------------------------------------------------------------------------
    const rf = d.radarFeatures;
    const airportsToDraw = (rf && Array.isArray(rf.airports) && rf.airports.length > 0)
      ? rf.airports
      : (isSydneyArea ? [{ iata: "YSSY", lat: -33.9461, lon: 151.1772, runways: SYD_MAP_DATA.runways }] : []);

    airportsToDraw.forEach((ap) => {
      if (Array.isArray(ap.runways)) {
        ap.runways.forEach((rw) => {
          if (rw && rw.length >= 2) {
            const p1 = toPx(rw[0][0], rw[0][1]);
            const p2 = toPx(rw[1][0], rw[1][1]);
            ctx.strokeStyle = EINK_INK;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(p1[0], p1[1]);
            ctx.lineTo(p2[0], p2[1]);
            ctx.stroke();

            // Extended Approach Guide (dashed 8km lines)
            if (mapMode === "detailed" || mapMode === "waypoints") {
              const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
              const extLen = 8 * pxPerKm;
              ctx.strokeStyle = EINK_MID;
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(p1[0], p1[1]);
              ctx.lineTo(p1[0] - Math.cos(angle) * extLen, p1[1] - Math.sin(angle) * extLen);
              ctx.moveTo(p2[0], p2[1]);
              ctx.lineTo(p2[0] + Math.cos(angle) * extLen, p2[1] + Math.sin(angle) * extLen);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
        });
      }

      // Airport code label
      const apP = toPx(ap.lat, ap.lon);
      const dSq = (apP[0] - cx) ** 2 + (apP[1] - cy) ** 2;
      if (dSq < (radiusPx - 10) ** 2) {
        ctx.strokeStyle = EINK_INK;
        ctx.lineWidth = 2.0;
        ctx.strokeRect(apP[0] - 5, apP[1] - 5, 10, 10);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = EINK_INK;
        ctx.textAlign = "left";
        ctx.fillText(ap.iata || ap.icao || "APT", apP[0] + 9, apP[1] - 4);
      }
    });

    // ------------------------------------------------------------------------
    // LAYER C: KEY LOCATIONS & SUBURBS (Dynamic Worldwide)
    // ------------------------------------------------------------------------
    // Aviation Fixes (diamonds ◇ if in Sydney)
    if ((mapMode === "detailed" || mapMode === "waypoints") && isSydneyArea) {
      ctx.strokeStyle = EINK_MID;
      ctx.lineWidth = 1.5;
      SYD_MAP_DATA.aviationFixes.forEach((fix) => {
        const p = toPx(fix.lat, fix.lon);
        const distSq = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
        if (distSq < (radiusPx - 14) ** 2) {
          ctx.beginPath();
          ctx.moveTo(p[0], p[1] - 4);
          ctx.lineTo(p[0] + 4, p[1]);
          ctx.lineTo(p[0], p[1] + 4);
          ctx.lineTo(p[0] - 4, p[1]);
          ctx.closePath();
          ctx.stroke();
          ctx.font = "bold 9px monospace";
          ctx.fillStyle = EINK_MID;
          ctx.textAlign = "center";
          ctx.fillText(`◇${fix.name}`, p[0], p[1] + 12);
        }
      });
    }

    // Dynamic Landmarks & Suburbs
    const locationsToDraw = (rf && Array.isArray(rf.landmarks) && rf.landmarks.length > 0)
      ? rf.landmarks
      : (isSydneyArea ? SYD_MAP_DATA.keyLocations : []);

    locationsToDraw.forEach((loc) => {
      const p = toPx(loc.lat, loc.lon);
      const distSq = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
      if (distSq < (radiusPx - 12) ** 2) {
        if (loc.type === "bridge") {
          ctx.strokeStyle = EINK_INK;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(p[0] - 6, p[1]);
          ctx.lineTo(p[0] + 6, p[1]);
          ctx.stroke();
          ctx.font = "bold 10px monospace";
          ctx.fillStyle = EINK_INK;
          ctx.textAlign = "center";
          ctx.fillText(loc.name, p[0], p[1] - 7);
        } else if (loc.type === "home_area") {
          // Home local suburb/town tag
          ctx.beginPath();
          ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
          ctx.fillStyle = EINK_INK;
          ctx.fill();
          ctx.font = "bold 11px monospace";
          ctx.fillStyle = EINK_INK;
          ctx.textAlign = "center";
          ctx.fillText(loc.name, p[0], p[1] + 14);
        } else if (loc.type === "airport") {
          // Handled in airports loop above
        } else {
          ctx.beginPath();
          ctx.arc(p[0], p[1], mapMode === "waypoints" ? 3.5 : 2.5, 0, Math.PI * 2);
          ctx.fillStyle = mapMode === "waypoints" ? EINK_INK : EINK_MID;
          ctx.fill();
          ctx.font = mapMode === "waypoints" ? "bold 11px monospace" : "bold 9px monospace";
          ctx.fillStyle = mapMode === "waypoints" ? EINK_INK : EINK_MID;
          ctx.textAlign = "center";
          ctx.fillText(loc.name, p[0], p[1] + 12);
        }
      }
    });

    ctx.restore();
  }

  function drawRadarScope(cx, cy, radiusPx, d) {
    const pl = state.plane;
    const maxKm = Number(d.radiusKm) || 25.0;

    // 0. Geographic Map Backdrop (Coastlines, Harbour, Runways)
    if (pl.radarMap !== "off") {
      drawSydneyRadarMap(cx, cy, radiusPx, d, pl.radarMap);
    }

    ctx.save();
    ctx.strokeStyle = EINK_INK;
    ctx.fillStyle = EINK_INK;

    const rings = [0.25, 0.5, 0.75, 1.0];
    rings.forEach((frac, idx) => {
      const r = radiusPx * frac;
      ctx.beginPath();
      ctx.lineWidth = idx === 3 ? 3.5 : 2;
      ctx.setLineDash(idx < 3 ? [4, 4] : []);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      if (idx === 1 || idx === 3) {
        ctx.setLineDash([]);
        const ringKm = (maxKm * frac).toFixed(idx === 1 && maxKm % 2 !== 0 ? 1 : 0);
        ctx.font = "bold 13px monospace";
        ctx.fillStyle = EINK_MID;
        ctx.textAlign = "left";
        ctx.fillText(`${ringKm}km`, cx + 6, cy - r + 5);
      }
    });
    ctx.setLineDash([]);

    ctx.strokeStyle = EINK_LIGHT_GRAY;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - radiusPx, cy);
    ctx.lineTo(cx + radiusPx, cy);
    ctx.moveTo(cx, cy - radiusPx);
    ctx.lineTo(cx, cy + radiusPx);
    ctx.stroke();

    ctx.strokeStyle = EINK_INK;
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = ((deg - 90) * Math.PI) / 180;
      const inner = deg % 90 === 0 ? radiusPx - 12 : radiusPx - 7;
      ctx.lineWidth = deg % 90 === 0 ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
      ctx.lineTo(cx + Math.cos(rad) * radiusPx, cy + Math.sin(rad) * radiusPx);
      ctx.stroke();
    }

    ctx.fillStyle = EINK_INK;
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", cx, cy - radiusPx - 15);
    ctx.fillText("S", cx, cy + radiusPx + 16);
    ctx.fillText("E", cx + radiusPx + 15, cy);
    ctx.fillText("W", cx - radiusPx - 16, cy);

    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "left";
    ctx.fillText("HOME", cx + 8, cy + 12);

    if (pl.radarDetail === "full" && d.sydAirport) {
      const sydDist = Math.min(maxKm * 0.96, d.sydAirport.distanceKm || 22.1);
      const sydBrngRad = (((d.sydAirport.bearingDeg || 174.5) - 90) * Math.PI) / 180;
      const sydR = (sydDist / maxKm) * radiusPx;
      const sx = cx + Math.cos(sydBrngRad) * sydR;
      const sy = cy + Math.sin(sydBrngRad) * sydR;

      ctx.strokeStyle = EINK_MID;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(sx - 6, sy - 6, 12, 12);
      ctx.font = "bold 13px monospace";
      ctx.fillStyle = EINK_MID;
      ctx.textAlign = "center";
      ctx.fillText("SYD", sx, sy - 12);
    }

    const flightsToPlot =
      pl.radarDetail === "full" && Array.isArray(d.nearbyFlights) && d.nearbyFlights.length > 0
        ? d.nearbyFlights
        : d.flightFound
        ? [
            {
              callsign: d.callsign,
              altitude: d.altitude,
              heading: d.heading,
              distance: d.distance,
              bearing: d.bearing,
              isClosest: true,
            },
          ]
        : [];

    flightsToPlot.forEach((f) => {
      if (f.isClosest) return;
      const distClamped = Math.min(maxKm * 0.95, Number(f.distance) || 0);
      const brngRad = (((Number(f.bearing) || 0) - 90) * Math.PI) / 180;
      const r = (distClamped / maxKm) * radiusPx;
      const px = cx + Math.cos(brngRad) * r;
      const py = cy + Math.sin(brngRad) * r;

      drawAircraftIcon(px, py, f.heading, 10, false);
      ctx.font = "bold 13px monospace";
      ctx.fillStyle = EINK_MID;
      ctx.textAlign = "left";
      ctx.fillText(f.callsign || "ACFT", px + 12, py - 4);
    });

    if (d.flightFound) {
      const distClamped = Math.min(maxKm * 0.94, Number(d.distance) || 0);
      const brngRad = (((Number(d.bearing) || 0) - 90) * Math.PI) / 180;
      const r = (distClamped / maxKm) * radiusPx;
      const px = cx + Math.cos(brngRad) * r;
      const py = cy + Math.sin(brngRad) * r;

      ctx.strokeStyle = EINK_MID;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(px, py);
      ctx.stroke();

      const hdgRad = (((Number(d.heading) || 0) - 90) * Math.PI) / 180;
      ctx.strokeStyle = EINK_INK;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(hdgRad) * 40, py + Math.sin(hdgRad) * 40);
      ctx.stroke();

      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.arc(px, py, 20, 0, Math.PI * 2);
      ctx.stroke();

      drawAircraftIcon(px, py, d.heading, 15, true);

      const tagText = `${d.callsign}`;
      ctx.font = "bold 15px monospace";
      const tagW = Math.max(68, ctx.measureText(tagText).width + 16);
      const tagX = px + 22 + tagW > cx + radiusPx ? px - 22 - tagW : px + 22;
      const tagY = py - 14;

      ctx.fillStyle = EINK_INK;
      ctx.fillRect(tagX, tagY, tagW, 26);
      ctx.fillStyle = EINK_BG;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tagText, tagX + tagW / 2, tagY + 13);
    }

    ctx.restore();
  }

  function renderPlanePW1() {
    const pl = state.plane;
    const W = state.nativeW;
    const H = state.nativeH;
    ctx.fillStyle = EINK_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = EINK_INK;
    ctx.strokeStyle = EINK_INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    let topY = 0;
    if (state.model === "pw1-browser") {
      topY = drawFw5611BrowserChrome(W);
    }

    const d = pl.flight;
    const now = new Date();
    const clockStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = EINK_INK;
    ctx.fillText("PLANE TRACKER  ·  SYDNEY RADAR (PW1)", 26, topY + 13);

    ctx.textAlign = "right";
    if (state.model === "pw1-browser") {
      ctx.font = "bold 15px monospace";
      ctx.fillText("[ App: Plane ]  [ Layout ]  [ Flash ]", W - 26, topY + 14);
    } else {
      ctx.font = "bold 16px monospace";
      ctx.fillText(
        `RADIUS ${Number(d.radiusKm || 25).toFixed(0)}KM  ·  ${clockStr}`,
        W - 26,
        topY + 14
      );
    }
    ctx.textAlign = "left";
    ctx.fillRect(0, topY + 44, W, 3);

    const contentY = topY + 47;
    const footerH = 46;
    const mainH = H - contentY - footerH;

    const footerY = H - footerH;
    ctx.fillRect(0, footerY, W, 3);
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = EINK_INK;
    ctx.fillText(
      `Updated: ${d.updatedTime || clockStr}   ·   Geofence: (${Number(d.homeLat).toFixed(
        3
      )}, ${Number(d.homeLon).toFixed(3)}) R=${Number(d.radiusKm || 25).toFixed(1)}km`,
      26,
      footerY + 15
    );
    ctx.textAlign = "right";
    const trafficCount = d.airborneInRadius || (d.flightFound ? 1 : 0);
    ctx.fillText(
      `${trafficCount} AIRBORNE IN RANGE   ·   ${d.success ? "WiFi ONLINE" : "ERROR"}`,
      W - 26,
      footerY + 15
    );
    ctx.textAlign = "left";

    if (pl.isSearchingScreen) {
      ctx.textAlign = "center";
      ctx.font = "bold 44px Georgia, serif";
      ctx.fillText("Searching Airspace...", W / 2, contentY + mainH / 2 - 40);
      ctx.font = "22px sans-serif";
      ctx.fillStyle = EINK_MID;
      ctx.fillText(
        `Scanning OpenSky Network within ${d.radiusKm} km of Sydney home coordinates`,
        W / 2,
        contentY + mainH / 2 + 20
      );
      ctx.textAlign = "left";
      return;
    }

    if (!d.success) {
      ctx.font = "bold 34px Georgia, serif";
      ctx.fillText("OpenSky / Network Fetch Failed", 46, contentY + 80);
      ctx.font = "22px monospace";
      ctx.fillStyle = EINK_MID;
      ctx.fillText(d.errorMessage || "Connection error", 46, contentY + 135);
      ctx.fillStyle = EINK_INK;
      ctx.font = "20px sans-serif";
      ctx.fillText(
        "Tip: Switch to 'Simulator Demo' in the left sidebar to test overhead flights offline.",
        46,
        contentY + 190
      );
      return;
    }

    if (state.orientation === "landscape") {
      const radarColW = 460;
      const radarCx = Math.floor(radarColW / 2);
      const radarCy = contentY + Math.floor(mainH / 2) + 6;
      const radarRadius = Math.min(205, Math.floor(mainH / 2) - 44);

      drawRadarScope(radarCx, radarCy, radarRadius, d);

      ctx.fillStyle = EINK_INK;
      ctx.fillRect(radarColW, contentY, 3, mainH);

      const rightX = radarColW + 28;
      const rightW = W - rightX - 26;

      if (!d.flightFound) {
        ctx.textAlign = "center";
        const centerRightX = radarColW + Math.floor((W - radarColW) / 2);
        ctx.font = "bold 40px Georgia, serif";
        ctx.fillText("No flights in range", centerRightX, contentY + mainH / 2 - 45);
        ctx.font = "22px sans-serif";
        ctx.fillStyle = EINK_MID;
        ctx.fillText(
          `0 airborne aircraft within ${Number(d.radiusKm).toFixed(1)} km radius.`,
          centerRightX,
          contentY + mainH / 2 + 14
        );
        ctx.textAlign = "left";
        return;
      }

      let curY = contentY + 16;
      ctx.font = "bold 52px Georgia, serif";
      ctx.fillStyle = EINK_INK;
      ctx.fillText(d.callsign || "UNKNOWN", rightX, curY);
      const csWidth = ctx.measureText(d.callsign || "UNKNOWN").width;

      let badgeX = rightX + csWidth + 18;
      if (d.isLate) {
        ctx.fillStyle = EINK_INK;
        ctx.fillRect(badgeX, curY + 6, 92, 40);
        ctx.fillStyle = EINK_BG;
        ctx.font = "bold 22px monospace";
        ctx.fillText("LATE", badgeX + 18, curY + 14);
        ctx.fillStyle = EINK_INK;
      }

      const acType =
        d.aircraftType && d.aircraftType !== "N/A" ? `TYPE: ${d.aircraftType}` : "TYPE: N/A";
      ctx.font = "bold 20px monospace";
      const acW = ctx.measureText(acType).width + 26;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(rightX + rightW - acW, curY + 7, acW, 38);
      ctx.fillText(acType, rightX + rightW - acW + 13, curY + 15);

      curY += 62;
      ctx.font = "bold 25px sans-serif";
      ctx.fillStyle = EINK_MID;
      ctx.fillText(truncatePlane(d.airline || "Unknown Airline", 36), rightX, curY);
      ctx.fillStyle = EINK_INK;

      curY += 36;
      ctx.fillRect(rightX, curY, rightW, 2);

      curY += 14;
      const routeBoxH = 138;
      ctx.fillStyle = EINK_PANEL;
      ctx.fillRect(rightX, curY, rightW, routeBoxH);
      ctx.lineWidth = 2.5;
      ctx.strokeRect(rightX, curY, rightW, routeBoxH);
      ctx.fillStyle = EINK_INK;

      ctx.font = "bold 14px monospace";
      ctx.fillStyle = EINK_MID;
      ctx.fillText("ORIGIN / DEPARTURE", rightX + 16, curY + 12);
      ctx.fillStyle = EINK_INK;
      ctx.font = "bold 46px monospace";
      ctx.fillText(d.depIATA || "N/A", rightX + 16, curY + 32);
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(truncatePlane(d.depAirport || "N/A", 22), rightX + 16, curY + 84);
      ctx.font = "bold 18px monospace";
      ctx.fillText(
        d.depTime && d.depTime !== "N/A" ? `SCHED ${d.depTime}` : "SCHED --:--",
        rightX + 16,
        curY + 108
      );

      const midRouteX = rightX + Math.floor(rightW / 2);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(midRouteX - 52, curY + 54);
      ctx.lineTo(midRouteX + 52, curY + 54);
      ctx.stroke();
      drawAircraftIcon(midRouteX, curY + 54, 90, 13, true);

      ctx.textAlign = "right";
      ctx.font = "bold 14px monospace";
      ctx.fillStyle = EINK_MID;
      ctx.fillText("DESTINATION / ARRIVAL", rightX + rightW - 16, curY + 12);
      ctx.fillStyle = EINK_INK;
      ctx.font = "bold 46px monospace";
      ctx.fillText(d.arrIATA || "N/A", rightX + rightW - 16, curY + 32);
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(
        truncatePlane(d.arrAirport || "N/A", 22),
        rightX + rightW - 16,
        curY + 84
      );
      ctx.font = "bold 18px monospace";
      ctx.fillText(
        d.arrTime && d.arrTime !== "N/A" ? `SCHED ${d.arrTime}` : "SCHED --:--",
        rightX + rightW - 16,
        curY + 108
      );
      ctx.textAlign = "left";

      curY += routeBoxH + 16;
      const gridH = Math.max(220, contentY + mainH - curY - 14);
      const cols = 2;
      const rows = 3;
      const cellW = Math.floor((rightW - 14) / cols);
      const cellH = Math.floor((gridH - 20) / rows);

      const vrate = Number(d.verticalRate) || 0;
      const vrateSign = vrate > 0.2 ? "+" : "";
      const vrateTag = vrate > 0.5 ? "CLIMB" : vrate < -0.5 ? "DESCEND" : "LEVEL";

      const cells = [
        {
          label: "ALTITUDE (BARO)",
          primary: `${formatAltitude(d.altitude)} m`,
          sub:
            pl.units === "dual"
              ? `${formatAltitude(d.altitudeFt || Math.round(d.altitude * 3.28084))} ft`
              : "Meters MSL",
        },
        {
          label: "GROUND SPEED",
          primary: `${Math.round(d.speed)} km/h`,
          sub:
            pl.units === "dual"
              ? `${d.speedKts || Math.round(d.speed / 1.852)} kts`
              : "Ground Velocity",
        },
        {
          label: "TRACK HEADING",
          primary: `${Math.round(d.heading)}° ${
            d.headingCardinal || headingToCardinal(d.heading)
          }`,
          sub: "True Track",
        },
        {
          label: "DISTANCE FROM HOME",
          primary: `${Number(d.distance).toFixed(1)} km`,
          sub: `Bearing ${Math.round(d.bearing || 0)}° (${
            d.bearingCardinal || headingToCardinal(d.bearing || 0)
          })`,
        },
        {
          label: "VERTICAL RATE",
          primary: `${vrateSign}${vrate.toFixed(1)} m/s`,
          sub: `${vrateTag} (${vrateSign}${
            d.verticalRateFpm || Math.round(vrate * 196.85)
          } fpm)`,
        },
        {
          label: "TRANSPONDER / SOURCE",
          primary: `ICAO ${(d.icao24 || "------").toUpperCase()}`,
          sub: truncatePlane(d.metadataSource || "Local YSSY DB", 24),
        },
      ];

      cells.forEach((cell, idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        const cx = rightX + c * (cellW + 14);
        const cy = curY + r * (cellH + 10);

        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, cellW, cellH);
        ctx.font = "bold 13px monospace";
        ctx.fillStyle = EINK_MID;
        ctx.fillText(cell.label, cx + 12, cy + 8);
        ctx.font = "bold 28px monospace";
        ctx.fillStyle = EINK_INK;
        ctx.fillText(cell.primary, cx + 12, cy + 26);
        ctx.font = "bold 15px sans-serif";
        ctx.fillStyle = EINK_MID;
        ctx.fillText(cell.sub, cx + 12, cy + 56);
        ctx.fillStyle = EINK_INK;
      });
    } else {
      const radarBoxH = state.model === "pw1-browser" ? 430 : 470;
      const radarCx = Math.floor(W / 2);
      const radarCy = contentY + Math.floor(radarBoxH / 2) + 4;
      const radarRadius = Math.floor(radarBoxH / 2) - 38;

      drawRadarScope(radarCx, radarCy, radarRadius, d);

      const divY = contentY + radarBoxH;
      ctx.fillStyle = EINK_INK;
      ctx.fillRect(0, divY, W, 3);

      if (!d.flightFound) {
        ctx.textAlign = "center";
        ctx.font = "bold 42px Georgia, serif";
        ctx.fillText("No flights in range", W / 2, divY + 120);
        ctx.font = "22px sans-serif";
        ctx.fillStyle = EINK_MID;
        ctx.fillText(
          `No airborne aircraft within ${Number(d.radiusKm).toFixed(1)} km of home.`,
          W / 2,
          divY + 180
        );
        ctx.textAlign = "left";
        return;
      }

      const padX = 32;
      const innerW = W - padX * 2;
      let curY = divY + 18;

      ctx.font = "bold 48px Georgia, serif";
      ctx.fillStyle = EINK_INK;
      ctx.fillText(d.callsign || "UNKNOWN", padX, curY);
      const csW = ctx.measureText(d.callsign || "UNKNOWN").width;

      if (d.isLate) {
        ctx.fillRect(padX + csW + 16, curY + 6, 92, 38);
        ctx.fillStyle = EINK_BG;
        ctx.font = "bold 20px monospace";
        ctx.fillText("LATE", padX + csW + 34, curY + 14);
        ctx.fillStyle = EINK_INK;
      }

      ctx.textAlign = "right";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText(truncatePlane(d.airline || "N/A", 28), W - padX, curY + 4);
      ctx.font = "bold 17px monospace";
      ctx.fillStyle = EINK_MID;
      ctx.fillText(`AIRCRAFT TYPE: ${d.aircraftType || "N/A"}`, W - padX, curY + 32);
      ctx.fillStyle = EINK_INK;
      ctx.textAlign = "left";

      curY += 64;

      const routeH = 130;
      ctx.fillStyle = EINK_PANEL;
      ctx.fillRect(padX, curY, innerW, routeH);
      ctx.lineWidth = 2.5;
      ctx.strokeRect(padX, curY, innerW, routeH);
      ctx.fillStyle = EINK_INK;

      ctx.font = "bold 14px monospace";
      ctx.fillStyle = EINK_MID;
      ctx.fillText("FROM (ORIGIN)", padX + 16, curY + 10);
      ctx.fillStyle = EINK_INK;
      ctx.font = "bold 44px monospace";
      ctx.fillText(d.depIATA || "N/A", padX + 16, curY + 30);
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(truncatePlane(d.depAirport || "N/A", 24), padX + 16, curY + 76);
      ctx.font = "bold 17px monospace";
      ctx.fillText(`DEP: ${d.depTime || "N/A"}`, padX + 16, curY + 98);

      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 60, curY + 52);
      ctx.lineTo(W / 2 + 60, curY + 52);
      ctx.stroke();
      drawAircraftIcon(W / 2, curY + 52, 90, 13, true);

      ctx.textAlign = "right";
      ctx.font = "bold 14px monospace";
      ctx.fillStyle = EINK_MID;
      ctx.fillText("TO (DESTINATION)", W - padX - 16, curY + 10);
      ctx.fillStyle = EINK_INK;
      ctx.font = "bold 44px monospace";
      ctx.fillText(d.arrIATA || "N/A", W - padX - 16, curY + 30);
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(truncatePlane(d.arrAirport || "N/A", 24), W - padX - 16, curY + 76);
      ctx.font = "bold 17px monospace";
      ctx.fillText(`ARR: ${d.arrTime || "N/A"}`, W - padX - 16, curY + 98);
      ctx.textAlign = "left";

      curY += routeH + 18;

      const cols = 3;
      const cellW = Math.floor((innerW - 24) / cols);
      const cellH = 96;
      const vrate = Number(d.verticalRate) || 0;
      const vrateSign = vrate > 0.2 ? "+" : "";

      const cells = [
        {
          label: "ALTITUDE",
          val: `${formatAltitude(d.altitude)} m`,
          sub: `${formatAltitude(d.altitudeFt || Math.round(d.altitude * 3.28084))} ft`,
        },
        {
          label: "GROUND SPEED",
          val: `${Math.round(d.speed)} km/h`,
          sub: `${d.speedKts || Math.round(d.speed / 1.852)} kts`,
        },
        {
          label: "DISTANCE",
          val: `${Number(d.distance).toFixed(1)} km`,
          sub: `Brg ${Math.round(d.bearing || 0)}° ${d.bearingCardinal || ""}`,
        },
        {
          label: "HEADING",
          val: `${Math.round(d.heading)}° ${
            d.headingCardinal || headingToCardinal(d.heading)
          }`,
          sub: "True Track",
        },
        {
          label: "VERT RATE",
          val: `${vrateSign}${vrate.toFixed(1)} m/s`,
          sub: `${vrateSign}${d.verticalRateFpm || Math.round(vrate * 196.85)} fpm`,
        },
        {
          label: "TRANSPONDER",
          val: (d.icao24 || "------").toUpperCase(),
          sub: truncatePlane(d.metadataSource || "Local DB", 18),
        },
      ];

      cells.forEach((cell, idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        const cx = padX + c * (cellW + 12);
        const cy = curY + r * (cellH + 12);

        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, cellW, cellH);
        ctx.font = "bold 12px monospace";
        ctx.fillStyle = EINK_MID;
        ctx.fillText(cell.label, cx + 10, cy + 8);
        ctx.font = "bold 26px monospace";
        ctx.fillStyle = EINK_INK;
        ctx.fillText(cell.val, cx + 10, cy + 28);
        ctx.font = "bold 14px sans-serif";
        ctx.fillStyle = EINK_MID;
        ctx.fillText(cell.sub, cx + 10, cy + 58);
        ctx.fillStyle = EINK_INK;
      });
    }
  }

  // ==========================================================================
  // CHILD PROJECT 3 RENDERER: TRAINKINDLE (TRANSPORTTRACKER)
  // ==========================================================================
  function renderTrainPixel212() {
    const W = state.nativeW; // 212
    const H = state.nativeH; // 104
    const d = state.train.data;

    // Matches displayManager.cpp:
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Header background: fillRect(0, 0, width, 15, GxEPD_BLACK)
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, 15);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px monospace";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    // Origin and Destination names:
    ctx.fillText((d.originStation || "Origin").substring(0, 14), 6, 3);
    ctx.fillText((d.destStation || "Central").substring(0, 14), Math.floor(W / 2) + 6, 3);

    // Separator line:
    ctx.fillStyle = "#000000";
    ctx.fillRect(Math.floor(W / 2), 0, 1, H);

    // Origin Details:
    ctx.font = "bold 10px monospace";
    ctx.fillText(d.originPlatform || "Platform 1", 6, 26);
    ctx.fillText(`Dep: ${d.originTime || "--:--"}`, 6, 44);

    // Destination Details:
    ctx.fillText(d.destPlatform || "Platform 5", Math.floor(W / 2) + 6, 26);
    ctx.fillText(`Arr: ${d.destTime || "--:--"}`, Math.floor(W / 2) + 6, 44);

    // Route Label:
    ctx.font = "bold 11px monospace";
    ctx.fillText(d.routeLabel || "T1", 6, H - 20);

    // Current time:
    const now = new Date();
    const curTime = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    ctx.textAlign = "right";
    ctx.font = "9px monospace";
    ctx.fillText(curTime, W - 6, H - 14);
    ctx.textAlign = "left";
  }

  function renderTrainPW1() {
    const W = state.nativeW;
    const H = state.nativeH;
    const d = state.train.data;

    ctx.fillStyle = EINK_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = EINK_INK;
    ctx.strokeStyle = EINK_INK;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    let topY = 0;
    if (state.model === "pw1-browser") {
      topY = drawFw5611BrowserChrome(W);
    }

    const now = new Date();
    const clockStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    ctx.font = "bold 16px sans-serif";
    ctx.fillText("SYDNEY TRAINS  ·  TRANSPORT TRACKER (PW1)", 28, topY + 14);
    ctx.textAlign = "right";
    ctx.fillText(
      state.model === "pw1-browser"
        ? "[ App: Train ]  [ ⇄ Swap ]  [ Flash ]"
        : `${clockStr}   100%`,
      W - 28,
      topY + 14
    );
    ctx.textAlign = "left";
    ctx.fillRect(0, topY + 44, W, 3);

    const curY = topY + 58;
    const padX = 36;
    const contentW = W - padX * 2;

    // 1. Station Route Banner
    const orig = (d.originStation || "Penrith").toUpperCase();
    const dest = (d.destStation || "Central").toUpperCase();
    ctx.fillRect(padX, curY, contentW, 54);
    ctx.fillStyle = EINK_BG;
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(`${orig}  ➔  ${dest}`, padX + 18, curY + 14);

    const platTxt = (d.originPlatform || "Platform 1").toUpperCase();
    ctx.textAlign = "right";
    ctx.font = "bold 20px monospace";
    ctx.fillText(platTxt, W - padX - 18, curY + 17);
    ctx.textAlign = "left";
    ctx.fillStyle = EINK_INK;

    // 2. Hero Next Train Departure Box
    const heroY = curY + 68;
    const heroH = 175;
    ctx.lineWidth = 3.5;
    ctx.strokeRect(padX, heroY, contentW, heroH);

    // Left Hero: Line info & Platform
    const badgeW = 74;
    const badgeH = 42;
    ctx.fillRect(padX + 22, heroY + 22, badgeW, badgeH);
    ctx.fillStyle = EINK_BG;
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.fillText(d.routeLabel || "T1", padX + 22 + badgeW / 2, heroY + 30);
    ctx.textAlign = "left";
    ctx.fillStyle = EINK_INK;

    ctx.font = "bold 28px sans-serif";
    ctx.fillText(d.lineName || "Sydney Trains Line", padX + 110, heroY + 26);

    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = EINK_MID;
    let occMeta = `${d.cars || "8 Cars"} · ${d.occupancy || "Seats Available"}`;
    if (d.realtime) occMeta = `● Real-time GPS · ${occMeta}`;
    ctx.fillText(occMeta, padX + 110, heroY + 66);

    ctx.font = "18px sans-serif";
    ctx.fillStyle = EINK_INK;
    ctx.fillText(
      `Arrival at ${d.destStation || "Central"}: ${d.destTime || "--:--"} (${d.durationMins || 45} mins trip)`,
      padX + 22,
      heroY + 120
    );

    // Right Hero: Countdown & Huge Departure Time
    ctx.textAlign = "right";
    const mins = d.minutesUntil != null ? d.minutesUntil : 0;
    const cdText = mins <= 0 ? "NOW DEPARTING" : mins === 1 ? "in 1 MIN" : `in ${mins} MINS`;
    const pillW = Math.max(170, ctx.measureText(cdText).width + 30);
    ctx.fillRect(W - padX - 22 - pillW, heroY + 20, pillW, 40);
    ctx.fillStyle = EINK_BG;
    ctx.font = "bold 22px monospace";
    ctx.fillText(cdText, W - padX - 37, heroY + 28);

    ctx.fillStyle = EINK_INK;
    ctx.font = "bold 58px monospace";
    ctx.fillText(d.originTime || "--:--", W - padX - 22, heroY + 74);
    ctx.textAlign = "left";

    // 3. Upcoming Departures Timetable
    const tableY = heroY + heroH + 24;
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("UPCOMING DEPARTURES", padX, tableY);

    const tblStartY = tableY + 32;
    ctx.fillRect(padX, tblStartY, contentW, 36);
    ctx.fillStyle = EINK_BG;
    ctx.font = "bold 16px monospace";
    ctx.fillText("DEP TIME", padX + 18, tblStartY + 10);
    ctx.fillText("COUNTDOWN", padX + 190, tblStartY + 10);
    ctx.fillText("LINE", padX + 370, tblStartY + 10);
    ctx.fillText("PLATFORM", padX + 490, tblStartY + 10);
    ctx.fillText("DEST ARRIVAL", padX + 680, tblStartY + 10);
    ctx.fillStyle = EINK_INK;

    const upcoming = d.upcoming || [];
    const rowH = 46;
    for (let i = 0; i < Math.min(4, upcoming.length); i++) {
      const u = upcoming[i];
      const ry = tblStartY + 36 + i * rowH;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = EINK_LIGHT_GRAY;
      ctx.strokeRect(padX, ry, contentW, rowH);

      ctx.font = "bold 22px monospace";
      ctx.fillText(u.departureTime || "--:--", padX + 18, ry + 12);

      const ucd = u.minutesUntil <= 0 ? "NOW" : `${u.minutesUntil}m`;
      ctx.fillRect(padX + 190, ry + 10, 64, 26);
      ctx.fillStyle = EINK_BG;
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText(ucd, padX + 190 + 32, ry + 15);
      ctx.textAlign = "left";
      ctx.fillStyle = EINK_INK;

      ctx.font = "bold 19px monospace";
      ctx.fillText(u.routeLabel || "T1", padX + 370, ry + 13);
      ctx.fillText(u.platform || "Platform 1", padX + 490, ry + 13);
      ctx.fillText(u.arrivalTime || "--:--", padX + 680, ry + 13);
    }

    if (upcoming.length === 0) {
      const ry = tblStartY + 36;
      ctx.font = "italic 18px sans-serif";
      ctx.fillStyle = EINK_MID;
      ctx.fillText("No further scheduled services found in this window.", padX + 18, ry + 16);
      ctx.fillStyle = EINK_INK;
    }

    // 4. Bottom Kindle Touch Bar
    const btmY = H - 76;
    ctx.fillRect(0, btmY - 14, W, 2);
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = EINK_MID;
    ctx.fillText(`Last updated: ${d.lastUpdated || clockStr} · TfNSW Open Data`, padX, btmY + 6);

    ctx.textAlign = "right";
    ctx.fillText(`[ ⇄ Tap to Swap Direction ]   [ ↻ Tap to Refresh ]`, W - padX, btmY + 6);
    ctx.textAlign = "left";
    ctx.fillStyle = EINK_INK;
  }

  // ==========================================================================
  // MASTER DISPATCHER & DATA POLLING
  // ==========================================================================
  function render() {
    ctx.resetTransform();
    const scaleX = (state.cssW * state.dpr) / state.nativeW;
    const scaleY = (state.cssH * state.dpr) / state.nativeH;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    if (state.activeProject === "spotify") {
      telemetryTick.textContent = `Tick: ${state.spotify.scrollTick}`;
      if (state.engine === "pixel-212") {
        renderSpotifyPixel212();
      } else {
        renderSpotifyPW1();
      }
    } else if (state.activeProject === "plane") {
      telemetryTick.textContent = `Sweeps: ${state.plane.sweepCount}`;
      if (state.engine === "pixel-212") {
        renderPlanePixel212();
      } else {
        renderPlanePW1();
      }
    } else if (state.activeProject === "train") {
      telemetryTick.textContent = `Route: ${state.train.data.routeLabel || "T1"}`;
      if (state.engine === "pixel-212") {
        renderTrainPixel212();
      } else {
        renderTrainPW1();
      }
    }
  }

  function loadSpotifyArtwork(url) {
    const sp = state.spotify;
    if (!url) {
      sp.artworkImage = null;
      sp.artworkLoadedUrl = "";
      sp.ditheredCanvasCache = null;
      render();
      return;
    }
    if (url === sp.artworkLoadedUrl && sp.artworkImage) return;
    sp.artworkLoadedUrl = url;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      sp.artworkImage = img;
      sp.ditheredCanvasCache = null;
      log("[SpotifyKindle] Downloaded & dithered album cover.", "spot");
      if (state.activeProject === "spotify") render();
    };
    img.src = `/api/artwork?url=${encodeURIComponent(url)}`;
  }

  async function pollSpotify() {
    const sp = state.spotify;
    if (sp.source !== "live") return;
    sp.lastPollMs = Date.now();
    try {
      const resp = await fetch("/api/now-playing");
      const data = await resp.json();

      if (data.lanIp && data.port) {
        state.lanUrl = `http://${data.lanIp}:${data.port}/kindle`;
        kindleUrlBox.textContent = state.lanUrl;
      }

      const prevTitle = sp.track.title;
      const prevPlaying = sp.track.isPlaying;
      const prevHasTrack = sp.track.hasTrack;

      if (data.success) {
        if (state.activeProject === "spotify") {
          apiBadge.textContent = data.hasTrack
            ? data.isPlaying
              ? "Spotify Playing"
              : "Spotify Paused"
            : "Spotify Idle (204)";
          apiBadge.className = "status-pill online";
        }

        if (data.hasTrack) {
          const changed =
            !prevHasTrack || data.title !== prevTitle || data.isPlaying !== prevPlaying;
          if (changed) {
            sp.track = data;
            sp.scrollTick = 0;
            log(
              `[SpotifyKindle] "${data.title}" — ${data.artist} (${
                data.isPlaying ? "PLAYING" : "PAUSED"
              })`,
              "spot"
            );
          } else {
            const drift = data.progressMs - sp.track.progressMs;
            if (Math.abs(drift) > 2000) sp.track.progressMs = data.progressMs;
            sp.track.durationMs = data.durationMs;
          }
          const chosenArt =
            state.engine === "pixel-212"
              ? data.artworkUrlSmall || data.artworkUrl
              : data.artworkUrl || data.artworkUrlSmall;
          loadSpotifyArtwork(chosenArt);
          sp.pollIntervalMs = data.isPlaying ? 5000 : 12000;
          if (state.activeProject === "spotify") {
            telemetryStatus.textContent = `Spotify Live: ${data.title} (${formatMsToMinSec(
              sp.track.progressMs
            )})`;
          }
        } else {
          sp.track = data;
          sp.pollIntervalMs = 10000;
          if (state.activeProject === "spotify") {
            telemetryStatus.textContent =
              "Spotify Live: Idle (Play music or switch to Simulator Demo)";
          }
        }
      } else {
        sp.track = data;
        if (state.activeProject === "spotify") {
          apiBadge.textContent = "Spotify Error";
          apiBadge.className = "status-pill error";
          telemetryStatus.textContent = `Error: ${data.errorMessage}`;
        }
      }
      if (state.activeProject === "spotify") render();
    } catch (e) {}
  }

  function applySpotifyMockPreset(idx) {
    const sp = state.spotify;
    const preset = SPOTIFY_DEMO_PRESETS[idx] || SPOTIFY_DEMO_PRESETS[0];
    sp.track = {
      success: true,
      hasTrack: preset.hasTrack,
      isPlaying: preset.isPlaying,
      title: preset.title,
      artist: preset.artist,
      album: preset.album,
      progressMs: preset.progressMs,
      durationMs: preset.durationMs,
      demoCoverType: preset.demoCoverType,
      errorMessage: "",
    };
    sp.scrollTick = 0;
    sp.ditheredCanvasCache = null;
    log(
      preset.hasTrack
        ? `[SpotifyKindle Demo] Loaded "${preset.title}"`
        : "[SpotifyKindle Demo] Loaded Idle Screen",
      "spot"
    );
    if (state.activeProject === "spotify") {
      apiBadge.textContent = "Spotify Demo";
      apiBadge.className = "status-pill online";
      telemetryStatus.textContent = preset.hasTrack
        ? `Spotify Demo: ${preset.title}`
        : "Spotify Demo: Idle";
      render();
    }
  }

  async function pollPlane(force = false) {
    const pl = state.plane;
    pl.lastPollMs = Date.now();
    try {
      let url = "/api/flights";
      if (pl.source === "mock") {
        if (pl.mockPreset === 5) {
          pl.isSearchingScreen = true;
          pl.sweepCount++;
          if (state.activeProject === "plane") {
            apiBadge.textContent = "Startup Search";
            apiBadge.className = "status-pill connecting";
            telemetryStatus.textContent = "PlaneKindle Demo: displaySearching()";
            render();
          }
          return;
        }
        pl.isSearchingScreen = false;
        const serverPreset = pl.mockPreset === 6 ? 5 : pl.mockPreset;
        url = `/api/flights?mode=mock&preset=${serverPreset}`;
      } else {
        pl.isSearchingScreen = false;
        url = `/api/flights?mode=live${force ? "&force=1" : ""}`;
      }

      const resp = await fetch(url);
      const data = await resp.json();

      if (data.lanIp && data.port) {
        state.lanUrl = `http://${data.lanIp}:${data.port}/kindle`;
        kindleUrlBox.textContent = state.lanUrl;
      }
      if (data.pollIntervalMs) pl.pollIntervalMs = data.pollIntervalMs;

      pl.flight = data;
      pl.sweepCount++;

      if (state.activeProject === "plane") {
        if (!data.success) {
          apiBadge.textContent = "OpenSky Error";
          apiBadge.className = "status-pill error";
          telemetryStatus.textContent = `Error: ${data.errorMessage}`;
        } else if (
          data.metadataSource &&
          (data.metadataSource.indexOf("429") !== -1 ||
            data.metadataSource.indexOf("Cooldown") !== -1)
        ) {
          apiBadge.textContent = "429 Cooldown";
          apiBadge.className = "status-pill connecting";
          telemetryStatus.textContent = `OpenSky Rate Limited (HTTP 429) · ${
            data.flightFound
              ? `${data.callsign} (${data.depIATA} → ${data.arrIATA}) · Fallback Radar`
              : "Pausing live calls to recover quota"
          }`;
          log(
            `[PlaneKindle] Rate limit cooldown active (HTTP 429). Serving fallback radar for ${
              data.nearestAirport ? data.nearestAirport.name : "local region"
            }.`,
            "flight"
          );
        } else if (data.flightFound) {
          apiBadge.textContent = pl.source === "mock" ? "Plane Demo" : "Flight in Range";
          apiBadge.className = "status-pill online";
          telemetryStatus.textContent = `Closest: ${data.callsign} (${data.depIATA} → ${
            data.arrIATA
          }) · ${Number(data.distance).toFixed(1)} km`;
          log(
            `[PlaneKindle] Closest: ${data.callsign} (${Number(data.distance).toFixed(
              1
            )}km, Alt ${Math.round(data.altitude)}m, ${data.depIATA}->${data.arrIATA})`,
            "flight"
          );
        } else {
          apiBadge.textContent = "0 In Range";
          apiBadge.className = "status-pill online";
          telemetryStatus.textContent = `OpenSky OK · 0 airborne within ${data.radiusKm} km`;
        }
        render();
      }
    } catch (e) {}
  }

  function stepPlaneMockMotion(seconds = 2) {
    const pl = state.plane;
    if (pl.source !== "mock" || pl.isSearchingScreen) return;
    const d = pl.flight;
    if (!d.success || !d.flightFound) return;

    const speedKms = (Number(d.speed) || 400) / 3600.0;
    const stepKm = speedKms * seconds;
    const brngRad = ((Number(d.bearing) || 0) * Math.PI) / 180;
    const hdgRad = ((Number(d.heading) || 0) * Math.PI) / 180;

    let xKm = Math.sin(brngRad) * d.distance + Math.sin(hdgRad) * stepKm;
    let yKm = Math.cos(brngRad) * d.distance + Math.cos(hdgRad) * stepKm;

    let newDist = Math.sqrt(xKm * xKm + yKm * yKm);
    const maxR = (Number(d.radiusKm) || 25) * 0.9;
    if (newDist > maxR) {
      xKm *= -0.7;
      yKm *= -0.7;
      newDist = Math.sqrt(xKm * xKm + yKm * yKm);
    }
    const newBearing = ((Math.atan2(xKm, yKm) * 180) / Math.PI + 360) % 360;

    d.distance = Number(newDist.toFixed(2));
    d.bearing = Number(newBearing.toFixed(1));
    d.bearingCardinal = headingToCardinal(d.bearing);
    d.altitude = Math.max(300, Math.round(d.altitude + (d.verticalRate || 0) * seconds));
    d.altitudeFt = Math.round(d.altitude * 3.28084);

    if (Array.isArray(d.nearbyFlights)) {
      d.nearbyFlights.forEach((nf) => {
        if (nf.isClosest) {
          nf.distance = d.distance;
          nf.bearing = d.bearing;
          nf.altitude = d.altitude;
        }
      });
    }
    pl.sweepCount++;
    if (state.activeProject === "plane") render();
  }

  async function pollTrain(force = false) {
    const tr = state.train;
    tr.lastPollMs = Date.now();
    try {
      let url = "/api/trains";
      if (tr.source === "mock") {
        url = `/api/trains?mode=mock&preset=${tr.mockPreset}`;
      } else {
        url = `/api/trains?mode=live${force ? "&force=1" : ""}`;
      }

      const resp = await fetch(url);
      const data = await resp.json();

      if (data.lanIp && data.port) {
        state.lanUrl = `http://${data.lanIp}:${data.port}/kindle`;
        kindleUrlBox.textContent = state.lanUrl;
      }
      if (data.pollIntervalMs) tr.pollIntervalMs = data.pollIntervalMs;

      tr.data = data;

      if (state.activeProject === "train") {
        if (!data.success) {
          apiBadge.textContent = "TfNSW Error";
          apiBadge.className = "status-pill error";
          telemetryStatus.textContent = `Error: ${data.errorMessage}`;
        } else if (data.trainFound) {
          apiBadge.textContent = tr.source === "mock" ? "Train Demo" : "Train Scheduled";
          apiBadge.className = "status-pill online";
          const minsTxt = data.minutesUntil <= 0 ? "Now" : `in ${data.minutesUntil}m`;
          telemetryStatus.textContent = `${data.originStation} → ${data.destStation} · ${data.routeLabel} ${data.originTime} (${minsTxt}) · Plat ${data.originPlatform}`;
          log(
            `[TrainKindle] ${data.originStation} → ${data.destStation} | ${data.routeLabel} at ${data.originTime} (${minsTxt}) Plat ${data.originPlatform}`,
            "train"
          );
        } else {
          apiBadge.textContent = "0 Scheduled";
          apiBadge.className = "status-pill online";
          telemetryStatus.textContent = "TfNSW OK · No upcoming departures found";
        }
        render();
      }
    } catch (e) {
      if (state.activeProject === "train") {
        telemetryStatus.textContent = `Network Error: ${e}`;
      }
    }
  }

  function applyTrainMockPreset(idx) {
    const tr = state.train;
    const p = TRAIN_DEMO_PRESETS[idx] || TRAIN_DEMO_PRESETS[0];
    tr.data = {
      success: true,
      trainFound: true,
      errorMessage: "",
      originStation: p.originStation,
      originPlatform: p.originPlatform,
      originCode: p.originCode,
      destStation: p.destStation,
      destPlatform: p.destPlatform,
      destCode: p.destCode,
      originTime: p.originTime,
      destTime: p.destTime,
      routeLabel: p.routeLabel,
      lineName: p.lineName,
      minutesUntil: p.minutesUntil,
      durationMins: p.durationMins,
      occupancy: p.occupancy,
      cars: p.cars,
      realtime: p.realtime,
      upcoming: p.upcoming || [],
      lastUpdated: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    if (state.activeProject === "train") {
      apiBadge.textContent = "Train Demo";
      apiBadge.className = "status-pill online";
      telemetryStatus.textContent = `${p.originStation} → ${p.destStation} · ${p.routeLabel} ${p.originTime} (in ${p.minutesUntil}m)`;
      render();
    }
  }

  async function syncActiveAppToHub(appName) {
    if (!document.getElementById("sync-kindle-chk").checked) return;
    try {
      await fetch("/api/hub/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeApp: appName }),
      });
    } catch (e) {}
  }

  function switchProject(projectId) {
    state.activeProject = projectId;
    document
      .querySelectorAll("#project-toggle button")
      .forEach((b) => b.classList.toggle("active", b.dataset.project === projectId));

    document
      .getElementById("panel-spotify")
      .classList.toggle("hidden", projectId !== "spotify");
    document
      .getElementById("panel-plane")
      .classList.toggle("hidden", projectId !== "plane");
    document
      .getElementById("panel-train")
      .classList.toggle("hidden", projectId !== "train");

    const accentMap = {
      spotify: "#1db954",
      plane: "#38bdf8",
      train: "#f59e0b",
    };
    document.documentElement.style.setProperty(
      "--accent-color",
      accentMap[projectId] || "#1db954"
    );

    updateCanvasDimensions();
    triggerFullEinkFlash();
    syncActiveAppToHub(projectId);

    if (projectId === "spotify") {
      log("[Hub] Switched active simulator project to ./spotifykindle", "spot");
      if (state.spotify.source === "live") {
        pollSpotify();
      } else {
        applySpotifyMockPreset(
          Number(document.getElementById("spotify-mock-preset").value)
        );
      }
    } else if (projectId === "plane") {
      log("[Hub] Switched active simulator project to ./planekindle", "flight");
      pollPlane(false);
    } else if (projectId === "train") {
      log("[Hub] Switched active simulator project to ./trainkindle (TransportTracker)", "train");
      if (state.train.source === "live") {
        pollTrain(false);
      } else {
        applyTrainMockPreset(
          Number(document.getElementById("train-mock-preset").value)
        );
      }
    }
    render();
  }

  // 1Hz Master Loop
  setInterval(() => {
    const sp = state.spotify;
    if (state.activeProject === "spotify") {
      if (sp.track.hasTrack && sp.track.isPlaying) {
        sp.scrollTick++;
        sp.track.progressMs += 1000;
        if (sp.track.durationMs > 0 && sp.track.progressMs >= sp.track.durationMs) {
          if (sp.source === "mock") {
            sp.track.progressMs = 0;
          } else {
            sp.track.progressMs = sp.track.durationMs;
            pollSpotify();
          }
        }
        render();
      }
      if (sp.source === "live" && Date.now() - sp.lastPollMs >= sp.pollIntervalMs) {
        pollSpotify();
      }
    } else if (state.activeProject === "plane") {
      const pl = state.plane;
      if (pl.source === "mock" && pl.mockMotion) {
        stepPlaneMockMotion(1.5);
      }
      if (pl.source === "live" && Date.now() - pl.lastPollMs >= pl.pollIntervalMs) {
        pollPlane(false);
      }
    } else if (state.activeProject === "train") {
      const tr = state.train;
      if (tr.source === "live" && Date.now() - tr.lastPollMs >= tr.pollIntervalMs) {
        pollTrain(false);
      }
    }
  }, 1000);

  // Event Listeners
  document.getElementById("project-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-project]");
    if (!btn) return;
    switchProject(btn.dataset.project);
  });

  // Spotify Controls
  document.getElementById("spotify-source-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-source]");
    if (!btn) return;
    document
      .querySelectorAll("#spotify-source-toggle button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.spotify.source = btn.dataset.source;
    document
      .getElementById("spotify-mock-controls")
      .classList.toggle("hidden", state.spotify.source !== "mock");
    if (state.spotify.source === "mock") {
      applySpotifyMockPreset(
        Number(document.getElementById("spotify-mock-preset").value)
      );
    } else {
      state.spotify.ditheredCanvasCache = null;
      pollSpotify();
    }
  });

  document.getElementById("spotify-mock-preset").addEventListener("change", (e) => {
    applySpotifyMockPreset(Number(e.target.value));
  });

  document.getElementById("spotify-play-btn").addEventListener("click", () => {
    if (!state.spotify.track.hasTrack) return;
    state.spotify.track.isPlaying = !state.spotify.track.isPlaying;
    render();
  });

  document.getElementById("spotify-seek-btn").addEventListener("click", () => {
    if (!state.spotify.track.hasTrack) return;
    state.spotify.track.progressMs = Math.min(
      state.spotify.track.durationMs,
      state.spotify.track.progressMs + 15000
    );
    render();
  });

  async function sendSpotifyPlayerCommand(cmd) {
    if (state.spotify.source === "mock") {
      if (cmd === "toggle") {
        state.spotify.track.isPlaying = !state.spotify.track.isPlaying;
      } else if (cmd === "next") {
        const sel = document.getElementById("spotify-mock-preset");
        let nextIdx = (Number(sel.value) + 1) % 4;
        sel.value = nextIdx;
        applySpotifyMockPreset(nextIdx);
      } else if (cmd === "previous") {
        const sel = document.getElementById("spotify-mock-preset");
        let prevIdx = (Number(sel.value) + 3) % 4;
        sel.value = prevIdx;
        applySpotifyMockPreset(prevIdx);
      }
      render();
      return;
    }

    try {
      log(`[SpotifyKindle] Playback action: ${cmd}...`, "spotify");
      const resp = await fetch("/api/player/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await resp.json();
      if (data.success) {
        log(`[SpotifyKindle] ${data.message}`, "spotify");
        if (data.playback) {
          state.spotify.track = data.playback;
          render();
        }
        setTimeout(pollSpotify, 500);
      } else {
        log(`[SpotifyKindle] Error: ${data.message}`, "spotify");
        telemetryStatus.textContent = data.message;
      }
    } catch (e) {
      log(`[SpotifyKindle] Network error sending command: ${e}`, "spotify");
    }
  }

  document.getElementById("spotify-prev-btn").addEventListener("click", () => {
    sendSpotifyPlayerCommand("previous");
  });

  document.getElementById("spotify-toggle-btn").addEventListener("click", () => {
    sendSpotifyPlayerCommand("toggle");
  });

  document.getElementById("spotify-next-btn").addEventListener("click", () => {
    sendSpotifyPlayerCommand("next");
  });

  document.getElementById("spotify-poll-btn").addEventListener("click", () => {
    pollSpotify();
  });

  document.getElementById("dither-select").addEventListener("change", (e) => {
    state.spotify.dither = e.target.value;
    state.spotify.ditheredCanvasCache = null;
    render();
  });

  document.getElementById("overflow-select").addEventListener("change", (e) => {
    state.spotify.overflowMode = e.target.value;
    state.spotify.scrollTick = 0;
    render();
  });

  // Plane Controls
  document.getElementById("plane-source-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-source]");
    if (!btn) return;
    document
      .querySelectorAll("#plane-source-toggle button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.plane.source = btn.dataset.source;
    document
      .getElementById("plane-mock-controls")
      .classList.toggle("hidden", state.plane.source !== "mock");
    if (state.plane.source === "mock") {
      state.plane.mockPreset = Number(
        document.getElementById("plane-mock-preset").value
      );
    }
    pollPlane(true);
  });

  document.getElementById("plane-mock-preset").addEventListener("change", (e) => {
    state.plane.mockPreset = Number(e.target.value);
    pollPlane(true);
  });

  document.getElementById("plane-motion-btn").addEventListener("click", (e) => {
    state.plane.mockMotion = !state.plane.mockMotion;
    e.target.textContent = state.plane.mockMotion
      ? "Pause Radar Motion"
      : "Resume Radar Motion";
  });

  document.getElementById("plane-step-btn").addEventListener("click", () => {
    stepPlaneMockMotion(5);
  });

  let pollCooldownTimer = null;
  function startPollCooldown(seconds = 30) {
    const btn = document.getElementById("plane-poll-btn");
    if (!btn) return;
    if (pollCooldownTimer) clearInterval(pollCooldownTimer);
    let remaining = seconds;
    btn.disabled = true;
    btn.style.opacity = "0.6";
    btn.textContent = `Poll (${remaining}s)`;
    pollCooldownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(pollCooldownTimer);
        pollCooldownTimer = null;
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.textContent = "Poll OpenSky";
      } else {
        btn.textContent = `Poll (${remaining}s)`;
      }
    }, 1000);
  }

  document.getElementById("plane-poll-btn").addEventListener("click", () => {
    pollPlane(true);
    startPollCooldown(30);
  });

  document.getElementById("toggle-geofence-btn").addEventListener("click", () => {
    document.getElementById("geofence-panel").classList.toggle("hidden");
  });

  async function loadServerConfig() {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) return;
      const cfg = await res.json();
      if (cfg.home_lat != null) document.getElementById("cfg-lat").value = cfg.home_lat;
      if (cfg.home_lon != null) document.getElementById("cfg-lon").value = cfg.home_lon;
      if (cfg.radius_km != null) document.getElementById("cfg-radius").value = cfg.radius_km;
      if (cfg.opensky_user) document.getElementById("cfg-opensky-user").value = cfg.opensky_user;
      if (cfg.opensky_pass_set) {
        document.getElementById("cfg-opensky-pass").placeholder = "•••••••• (Saved)";
      }
    } catch (e) {}
  }

  document.getElementById("save-geofence-btn").addEventListener("click", async () => {
    const home_lat = parseFloat(document.getElementById("cfg-lat").value);
    const home_lon = parseFloat(document.getElementById("cfg-lon").value);
    const radius_km = parseFloat(document.getElementById("cfg-radius").value);
    const userEl = document.getElementById("cfg-opensky-user");
    const passEl = document.getElementById("cfg-opensky-pass");
    const opensky_user = userEl ? userEl.value.trim() : "";
    const opensky_pass = passEl ? passEl.value.trim() : "";

    const payload = { home_lat, home_lon, radius_km, opensky_user };
    if (opensky_pass) {
      payload.opensky_pass = opensky_pass;
    }

    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      log(
        `[PlaneKindle] Updated geofence (${home_lat.toFixed(4)}, ${home_lon.toFixed(
          4
        )}) R=${radius_km}km`,
        "flight"
      );
      if (opensky_user) {
        log(`[PlaneKindle] OpenSky account configured: ${opensky_user}`, "flight");
        if (passEl) passEl.value = "";
        if (passEl) passEl.placeholder = "•••••••• (Saved)";
      }
      pollPlane(true);
      startPollCooldown(30);
    } catch (e) {}
  });

  document.getElementById("radar-select").addEventListener("change", (e) => {
    state.plane.radarDetail = e.target.value;
    render();
  });

  document.getElementById("map-select").addEventListener("change", (e) => {
    state.plane.radarMap = e.target.value;
    render();
  });

  document.getElementById("units-select").addEventListener("change", (e) => {
    state.plane.units = e.target.value;
    render();
  });

  // Train Controls
  document.getElementById("train-source-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-source]");
    if (!btn) return;
    document
      .querySelectorAll("#train-source-toggle button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.train.source = btn.dataset.source;
    document
      .getElementById("train-mock-controls")
      .classList.toggle("hidden", state.train.source !== "mock");
    if (state.train.source === "mock") {
      applyTrainMockPreset(
        Number(document.getElementById("train-mock-preset").value)
      );
    } else {
      pollTrain(true);
    }
  });

  document.getElementById("train-mock-preset").addEventListener("change", (e) => {
    applyTrainMockPreset(Number(e.target.value));
  });

  document.getElementById("train-poll-btn").addEventListener("click", () => {
    pollTrain(true);
  });

  document.getElementById("train-swap-btn").addEventListener("click", async () => {
    const origSel = document.getElementById("train-origin-select");
    const destSel = document.getElementById("train-dest-select");
    const temp = origSel.value;
    origSel.value = destSel.value;
    destSel.value = temp;

    const payload = { origin_code: origSel.value, destination_code: destSel.value };
    try {
      await fetch("/api/trains/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const oTxt = origSel.options[origSel.selectedIndex] ? origSel.options[origSel.selectedIndex].text : origSel.value;
      const dTxt = destSel.options[destSel.selectedIndex] ? destSel.options[destSel.selectedIndex].text : destSel.value;
      log(`[TrainKindle] Swapped route to: ${oTxt} ➔ ${dTxt}`, "train");
      pollTrain(true);
    } catch (e) {}
  });

  document.getElementById("train-save-btn").addEventListener("click", async () => {
    const origSel = document.getElementById("train-origin-select");
    const destSel = document.getElementById("train-dest-select");
    const payload = { origin_code: origSel.value, destination_code: destSel.value };
    try {
      await fetch("/api/trains/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const oTxt = origSel.options[origSel.selectedIndex] ? origSel.options[origSel.selectedIndex].text : origSel.value;
      const dTxt = destSel.options[destSel.selectedIndex] ? destSel.options[destSel.selectedIndex].text : destSel.value;
      log(`[TrainKindle] Saved route: ${oTxt} ➔ ${dTxt}`, "train");
      pollTrain(true);
    } catch (e) {}
  });

  async function loadTrainConfigAndStations() {
    try {
      const [cfgRes, stRes] = await Promise.all([
        fetch("/api/trains/config"),
        fetch("/api/trains/stations"),
      ]);
      const cfg = await cfgRes.json();
      const stations = await stRes.json();

      const origSel = document.getElementById("train-origin-select");
      const destSel = document.getElementById("train-dest-select");

      if (Array.isArray(stations) && stations.length > 0) {
        origSel.innerHTML = "";
        destSel.innerHTML = "";
        stations.forEach((s) => {
          const opt1 = document.createElement("option");
          opt1.value = s.code;
          opt1.textContent = s.name;
          origSel.appendChild(opt1);

          const opt2 = document.createElement("option");
          opt2.value = s.code;
          opt2.textContent = s.name;
          destSel.appendChild(opt2);
        });
      }

      if (cfg.origin_code) origSel.value = cfg.origin_code;
      if (cfg.destination_code) destSel.value = cfg.destination_code;
    } catch (e) {}
  }

  // Shared Hardware Controls
  document.getElementById("model-select").addEventListener("change", (e) => {
    state.model = e.target.value;
    updateCanvasDimensions();
    render();
  });

  document.getElementById("orientation-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-orient]");
    if (!btn) return;
    document
      .querySelectorAll("#orientation-toggle button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.orientation = btn.dataset.orient;
    state.spotify.ditheredCanvasCache = null;
    updateCanvasDimensions();
    triggerFullEinkFlash();
    render();
  });

  document.getElementById("scale-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-scale]");
    if (!btn) return;
    document
      .querySelectorAll("#scale-toggle button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.scale = btn.dataset.scale;
    updateCanvasDimensions();
    render();
  });

  document.getElementById("engine-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-engine]");
    if (!btn) return;
    document
      .querySelectorAll("#engine-toggle button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.engine = btn.dataset.engine;
    state.spotify.ditheredCanvasCache = null;
    updateCanvasDimensions();
    triggerFullEinkFlash();
    render();
  });

  document.getElementById("frontlight-slider").addEventListener("input", (e) => {
    const val = e.target.value;
    document.getElementById("light-val").textContent = `${val}%`;
    document.documentElement.style.setProperty("--eink-light", `${val}%`);
  });

  document.getElementById("full-refresh-btn").addEventListener("click", () => {
    triggerFullEinkFlash();
    render();
  });

  document.getElementById("clear-log-btn").addEventListener("click", () => {
    consoleEl.innerHTML = "";
  });

  log("=== Kindle E-Ink Hub Simulator Ready (Mounted: ./spotifykindle, ./planekindle & ./trainkindle) ===");
  loadServerConfig();
  loadTrainConfigAndStations();
  updateCanvasDimensions();
  render();
  pollSpotify();
})();
