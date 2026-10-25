import importlib.util
import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
SIMULATOR_DIR = os.path.join(ROOT_DIR, "simulator")
APPS_DIR = os.path.join(ROOT_DIR, "apps")
SPOTIFY_DIR = os.path.join(ROOT_DIR, "spotifykindle")
PLANE_DIR = os.path.join(ROOT_DIR, "planekindle")
TRAIN_DIR = os.path.join(ROOT_DIR, "trainkindle")
if PLANE_DIR not in sys.path:
    sys.path.insert(0, PLANE_DIR)
if TRAIN_DIR not in sys.path:
    sys.path.insert(0, TRAIN_DIR)


def load_child_module(module_name, file_path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


# Dynamically load child project backends
spotify_mod = load_child_module(
    "spotifykindle_server", os.path.join(SPOTIFY_DIR, "server.py")
)
plane_mod = load_child_module(
    "planekindle_server", os.path.join(PLANE_DIR, "server.py")
)
train_mod = load_child_module(
    "trainkindle_server", os.path.join(TRAIN_DIR, "server.py")
)


def discover_apps(extra_app_path=None):
    """Auto-discovers apps containing a kindle-app.json manifest from:
    1. --app <path> CLI argument
    2. ./apps/<app_dir>
    3. Built-in ./spotifykindle, ./planekindle, ./trainkindle
    """
    discovered = {}
    candidate_paths = []

    if extra_app_path and os.path.isdir(extra_app_path):
        candidate_paths.append(os.path.abspath(extra_app_path))

    if os.path.isdir(APPS_DIR):
        for entry in sorted(os.listdir(APPS_DIR)):
            p = os.path.join(APPS_DIR, entry)
            if os.path.isdir(p):
                candidate_paths.append(p)

    for p in [SPOTIFY_DIR, PLANE_DIR, TRAIN_DIR]:
        if os.path.isdir(p) and p not in candidate_paths:
            candidate_paths.append(p)

    for app_path in candidate_paths:
        manifest_path = os.path.join(app_path, "kindle-app.json")
        if os.path.isfile(manifest_path):
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                app_id = manifest.get("id") or os.path.basename(app_path)
                manifest["_path"] = app_path
                manifest["_folder"] = os.path.basename(app_path)
                discovered[app_id] = manifest
            except Exception as e:
                print(f"[KindleHub] Error reading manifest in {app_path}: {e}")

    return discovered


discovered_apps = discover_apps()


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# Shared Hub state (allows switching the active app on the physical Kindle from the PC simulator)
hub_state = {
    "activeApp": "spotify",  # 'spotify' | 'plane'
    "updatedAt": int(time.time() * 1000),
}


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class HubRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if not (
            self.path.startswith("/api/now-playing")
            or self.path.startswith("/api/flights")
            or self.path.startswith("/api/hub/state")
        ):
            print(f"[KindleHub] {self.address_string()} - {fmt % args}")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, html_str, status=200):
        body = html_str.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        lan_ip = get_lan_ip()
        port = 5050

        # 1. Unified Desktop Simulator & Real Kindle Hub View
        if path in ("/", "/simulator"):
            self.serve_file(os.path.join(SIMULATOR_DIR, "index.html"))
            return

        if path == "/kindle":
            self.serve_file(os.path.join(SIMULATOR_DIR, "kindle.html"))
            return

        if path.startswith("/simulator/"):
            rel = path[len("/simulator/") :]
            self.serve_safe_from_dir(SIMULATOR_DIR, rel)
            return

        # 2. Hub State API (for syncing active project with physical Kindle)
        if path == "/api/hub/state":
            project_list = []
            for app_id, app in discovered_apps.items():
                project_list.append(
                    {
                        "id": app_id,
                        "name": app.get("name", app_id),
                        "folder": app.get("_folder", app_id),
                        "description": app.get("description", ""),
                        "icon": app.get("icon", "📱"),
                        "pollIntervalMs": app.get("pollIntervalMs", 30000),
                    }
                )
            self.send_json(
                {
                    "activeApp": hub_state["activeApp"],
                    "updatedAt": hub_state["updatedAt"],
                    "lanIp": lan_ip,
                    "port": port,
                    "projects": project_list,
                }
            )
            return

        # Serve static or client files from discovered apps: /apps/<app_id>/...
        if path.startswith("/apps/"):
            parts = path.strip("/").split("/", 2)
            if len(parts) >= 2:
                app_id = parts[1]
                rel_path = parts[2] if len(parts) > 2 else "kindle.html"
                if app_id in discovered_apps:
                    app_folder = discovered_apps[app_id]["_path"]
                    self.serve_safe_from_dir(app_folder, rel_path)
                    return

        # 3. Child Project 1: spotifykindle APIs
        if path == "/api/now-playing":
            data = spotify_mod.spotify_service.fetch_currently_playing()
            data["lanIp"] = lan_ip
            data["port"] = port
            self.send_json(data)
            return

        if path == "/api/player/command":
            cmd = query.get("action", ["toggle"])[0]
            ok, msg, updated = spotify_mod.spotify_service.control_playback(cmd)
            self.send_json(
                {
                    "success": ok,
                    "command": cmd,
                    "message": msg,
                    "playback": updated,
                }
            )
            return

        if path == "/api/artwork":
            img_url = query.get("url", [""])[0]
            if not img_url or not (
                img_url.startswith("https://") or img_url.startswith("http://")
            ):
                self.send_error(400, "Invalid artwork url")
                return
            try:
                req = urllib.request.Request(
                    img_url, headers={"User-Agent": "SpotifyKindle/1.0"}
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    img_bytes = resp.read()
                    ctype = resp.headers.get("Content-Type", "image/jpeg")
                    self.send_response(200)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Cache-Control", "public, max-age=86400")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(img_bytes)))
                    self.end_headers()
                    self.wfile.write(img_bytes)
            except Exception as e:
                self.send_error(502, f"Artwork fetch failed: {e}")
            return

        if path == "/auth":
            self.serve_spotify_auth_portal()
            return

        if path == "/callback":
            code = query.get("code", [""])[0]
            if not code:
                self.serve_spotify_auth_portal("No authorization code received.")
                return
            cfg = spotify_mod.load_config()
            host = self.headers.get("Host", f"127.0.0.1:{port}")
            redirect_uri = f"http://{host}/callback"
            ok, err = spotify_mod.spotify_service.exchange_auth_code(
                cfg, code, redirect_uri
            )
            if ok:
                self.send_html(
                    "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#121212;color:#1DB954;text-align:center;padding:40px;'>"
                    "<h2>&#10003; Spotify Account Linked!</h2>"
                    "<p><a href='/' style='color:#1DB954;'>Return to Unified Kindle Simulator</a></p></body></html>"
                )
            else:
                self.serve_spotify_auth_portal(err)
            return

        # 4. Child Project 2: planekindle APIs
        if path == "/api/flights":
            mode = query.get("mode", ["live"])[0]
            cfg = plane_mod.load_config()
            if mode == "mock":
                preset_idx = int(query.get("preset", ["0"])[0])
                data = plane_mod.flight_service.get_mock_flight(preset_idx)
            else:
                force = query.get("force", ["0"])[0] == "1"
                lat_q = query.get("lat", [None])[0]
                lon_q = query.get("lon", [None])[0]
                rad_q = query.get("radius", [None])[0]
                data = plane_mod.flight_service.fetch_live_flights(
                    home_lat=lat_q,
                    home_lon=lon_q,
                    radius_km=rad_q,
                    force=force,
                )
            data["lanIp"] = lan_ip
            data["port"] = port
            data["pollIntervalMs"] = cfg.get("poll_interval_ms", 30000)
            self.send_json(data)
            return

        if path == "/api/radar-map":
            cfg = plane_mod.load_config()
            try:
                lat = float(query.get("lat", [cfg.get("home_lat", -33.7481)])[0])
                lon = float(query.get("lon", [cfg.get("home_lon", 151.1542)])[0])
                rad = float(query.get("radius", [cfg.get("radius_km", 25.0)])[0])
            except Exception:
                lat, lon, rad = -33.7481, 151.1542, 25.0
            from planekindle.global_landmarks import get_radar_features
            features = get_radar_features(lat, lon, rad)
            self.send_json(features)
            return

        if path == "/api/config":
            cfg = plane_mod.load_config()
            self.send_json(
                {
                    "home_lat": cfg.get("home_lat"),
                    "home_lon": cfg.get("home_lon"),
                    "radius_km": cfg.get("radius_km"),
                    "poll_interval_ms": cfg.get("poll_interval_ms", 30000),
                    "opensky_user": cfg.get("opensky_user", ""),
                    "opensky_pass_set": bool(cfg.get("opensky_pass", "")),
                    "opensky_cache_ttl_sec": cfg.get("opensky_cache_ttl_sec", 30),
                    "aviationstack_configured": bool(
                        cfg.get("aviationstack_key")
                        and cfg.get("aviationstack_key") != "YOUR_API_KEY_HERE"
                    ),
                    "local_schedule_count": len(plane_mod.flight_service.sydney_flights),
                    "lanIp": lan_ip,
                    "port": port,
                }
            )
            return

        # 5. Child Project 3: trainkindle APIs
        if path == "/api/trains":
            mode = query.get("mode", ["live"])[0]
            if mode == "mock":
                preset_idx = int(query.get("preset", ["0"])[0])
                data = train_mod.train_service.get_mock_train(preset_idx)
            else:
                orig = query.get("origin", [None])[0]
                dest = query.get("destination", [None])[0]
                force = query.get("force", ["0"])[0] == "1"
                data = train_mod.train_service.fetch_live_trains(orig, dest, force=force)
            data["lanIp"] = lan_ip
            data["port"] = port
            data["pollIntervalMs"] = train_mod.load_config().get("poll_interval_ms", 30000)
            self.send_json(data)
            return

        if path == "/api/trains/stations":
            self.send_json(train_mod.train_service.stations)
            return

        if path == "/api/trains/config":
            cfg = train_mod.load_config()
            self.send_json(
                {
                    "origin_code": cfg.get("origin_code"),
                    "origin_name": train_mod.train_service.get_station_name(
                        cfg.get("origin_code"), cfg.get("origin_name", "Penrith")
                    ),
                    "destination_code": cfg.get("destination_code"),
                    "destination_name": train_mod.train_service.get_station_name(
                        cfg.get("destination_code"), cfg.get("destination_name", "Central")
                    ),
                    "poll_interval_ms": cfg.get("poll_interval_ms", 30000),
                    "lanIp": lan_ip,
                    "port": port,
                }
            )
            return

        self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/player/command":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8", errors="replace")
            try:
                body = json.loads(raw) if raw else {}
            except Exception:
                body = {}
            query = urllib.parse.parse_qs(parsed.query)
            cmd = body.get("command") or query.get("action", ["toggle"])[0]
            ok, msg, updated = spotify_mod.spotify_service.control_playback(cmd)
            self.send_json(
                {
                    "success": ok,
                    "command": cmd,
                    "message": msg,
                    "playback": updated,
                }
            )
            return

        if path == "/api/hub/state":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8", errors="replace")
            try:
                body = json.loads(raw) if raw else {}
                target_app = body.get("activeApp")
                if target_app in discovered_apps or target_app in ("spotify", "plane", "train"):
                    hub_state["activeApp"] = target_app
                    hub_state["updatedAt"] = int(time.time() * 1000)
                self.send_json({"success": True, **hub_state})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=400)
            return

        if path == "/exchange":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            params = urllib.parse.parse_qs(body)
            raw_input = params.get("code_input", [""])[0]
            redirect_uri = params.get(
                "redirect_uri", ["http://127.0.0.1:8888/callback"]
            )[0]
            code = spotify_mod.extract_code_from_input(raw_input)
            cfg = spotify_mod.load_config()
            ok, err = spotify_mod.spotify_service.exchange_auth_code(
                cfg, code, redirect_uri
            )
            if ok:
                self.send_html(
                    "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#121212;color:#1DB954;text-align:center;padding:40px;'>"
                    "<h2>&#10003; Spotify Account Linked!</h2>"
                    "<p style='color:#fff;'>Saved to spotifykindle/config.json.</p>"
                    "<p><a href='/' style='color:#1DB954;font-weight:bold;'>Back to Unified Kindle Simulator</a></p></body></html>"
                )
            else:
                self.serve_spotify_auth_portal(err)
            return

        if path == "/api/config":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8", errors="replace")
            try:
                body = json.loads(raw) if raw else {}
                cfg = plane_mod.load_config()
                if "home_lat" in body:
                    cfg["home_lat"] = float(body["home_lat"])
                if "home_lon" in body:
                    cfg["home_lon"] = float(body["home_lon"])
                if "radius_km" in body:
                    cfg["radius_km"] = max(1.0, min(250.0, float(body["radius_km"])))
                if "opensky_user" in body:
                    cfg["opensky_user"] = str(body["opensky_user"]).strip()
                if "opensky_pass" in body:
                    pwd = str(body["opensky_pass"]).strip()
                    if pwd:
                        cfg["opensky_pass"] = pwd
                plane_mod.save_config(cfg)
                plane_mod.flight_service.last_opensky_result = None
                self.send_json({"success": True, "config": cfg})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=400)
            return

        if path == "/api/trains/config":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8", errors="replace")
            try:
                body = json.loads(raw) if raw else {}
                cfg = train_mod.load_config()
                if "origin_code" in body:
                    cfg["origin_code"] = str(body["origin_code"]).strip()
                    cfg["origin_name"] = train_mod.train_service.get_station_name(cfg["origin_code"])
                if "destination_code" in body:
                    cfg["destination_code"] = str(body["destination_code"]).strip()
                    cfg["destination_name"] = train_mod.train_service.get_station_name(cfg["destination_code"])
                if "poll_interval_ms" in body:
                    cfg["poll_interval_ms"] = max(5000, int(body["poll_interval_ms"]))
                train_mod.save_config(cfg)
                train_mod.train_service.cached_result = None
                self.send_json({"success": True, "config": cfg})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=400)
            return

        self.send_error(404, "Not Found")

    def serve_safe_from_dir(self, base_dir, rel_path):
        safe_path = os.path.normpath(os.path.join(base_dir, rel_path))
        if not safe_path.startswith(base_dir) or not os.path.isfile(safe_path):
            self.send_error(404, "File not found")
            return
        self.serve_file(safe_path)

    def serve_file(self, full_path):
        if not os.path.isfile(full_path):
            self.send_error(404, "File not found")
            return
        content_type = "application/octet-stream"
        if full_path.endswith(".html"):
            content_type = "text/html; charset=utf-8"
        elif full_path.endswith(".css"):
            content_type = "text/css; charset=utf-8"
        elif full_path.endswith(".js"):
            content_type = "application/javascript; charset=utf-8"
        elif full_path.endswith(".png"):
            content_type = "image/png"

        with open(full_path, "rb") as f:
            data = f.read()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def serve_spotify_auth_portal(self, last_error=""):
        cfg = spotify_mod.load_config()
        client_id = cfg.get("spotify_client_id", "")
        local_loopback_uri = "http://127.0.0.1:8888/callback"
        auth_url_loopback = (
            "https://accounts.spotify.com/authorize?"
            + urllib.parse.urlencode(
                {
                    "client_id": client_id,
                    "response_type": "code",
                    "redirect_uri": local_loopback_uri,
                    "scope": "user-read-currently-playing user-read-playback-state user-modify-playback-state",
                }
            )
        )
        err_html = f"<div class='err'>{last_error}</div>" if last_error else ""
        html = f"""<!DOCTYPE html><html><head><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Link Spotify - Kindle Hub</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#121212;color:#fff;margin:0;padding:20px;display:flex;justify-content:center;}}
.card{{max-width:460px;width:100%;background:#181818;border-radius:12px;padding:24px;box-sizing:border-box;box-shadow:0 8px 24px rgba(0,0,0,0.5);}}
h2{{margin:0 0 8px;color:#1DB954;}}
p{{font-size:14px;line-height:1.5;color:#b3b3b3;margin:8px 0 16px;}}
.btn{{display:block;width:100%;background:#1DB954;color:#000;font-weight:700;text-align:center;padding:14px;border-radius:24px;text-decoration:none;border:none;font-size:15px;cursor:pointer;box-sizing:border-box;margin:10px 0;}}
.btn-sec{{background:#282828;color:#fff;font-weight:600;}}
input[type=text]{{width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#222;color:#fff;box-sizing:border-box;font-size:13px;margin:8px 0;}}
.err{{background:#4a151b;border-left:4px solid #e91429;padding:10px;border-radius:4px;font-size:13px;color:#ffb3b8;margin-bottom:14px;word-break:break-word;}}
code{{background:#282828;padding:2px 6px;border-radius:4px;color:#1DB954;font-size:12px;word-break:break-all;}}
</style></head><body><div class='card'>
<h2>Link Your Spotify (Kindle Hub)</h2>
<p>Connect your Spotify account for the SpotifyKindle project.</p>
{err_html}
<a class='btn btn-sec' href='{auth_url_loopback}' target='_blank'>1. Open Spotify Login</a>
<form method='POST' action='/exchange'>
<p style='font-size:12px;margin:6px 0;'>2. After clicking Agree, copy the full URL from your browser's address bar (starting with <code>http://127.0.0.1:8888/callback?code=...</code>) and paste it below:</p>
<input type='text' name='code_input' placeholder='Paste redirected URL or code here...' required>
<input type='hidden' name='redirect_uri' value='{local_loopback_uri}'>
<button type='submit' class='btn'>3. Complete Link</button>
</form>
<p style='text-align:center;margin-top:16px;'><a href='/' style='color:#b3b3b3;font-size:13px;'>&larr; Back to Unified Simulator</a></p>
</div></body></html>"""
        self.send_html(html)


def main():
    try:
        if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
            sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    global discovered_apps
    extra_app = None
    if "--app" in sys.argv:
        try:
            idx = sys.argv.index("--app")
            if idx + 1 < len(sys.argv):
                extra_app = sys.argv[idx + 1]
                print(f"[KindleHub] Mounting external app from: {extra_app}")
        except Exception:
            pass

    discovered_apps = discover_apps(extra_app)
    if extra_app:
        for app_id, app in discovered_apps.items():
            if os.path.abspath(app["_path"]) == os.path.abspath(extra_app):
                hub_state["activeApp"] = app_id
                break

    port = 5050
    lan_ip = get_lan_ip()
    server = ThreadedHTTPServer(("0.0.0.0", port), HubRequestHandler)
    sim_url = f"http://localhost:{port}/"
    print("=" * 70)
    print("  Kindle E-Ink Hub — Modular Simulator & Paperwhite Runtime Host")
    print("=" * 70)
    print(f"  Desktop Simulator (PC):    {sim_url}")
    print(f"  Real Kindle PW1 (EY21):    http://{lan_ip}:{port}/kindle")
    print(f"  Discovered Apps ({len(discovered_apps)} mounted):")
    for idx, (app_id, app) in enumerate(discovered_apps.items(), start=1):
        name = app.get("name", app_id)
        desc = app.get("description", "")
        folder = app.get("_folder", "")
        print(f"    {idx}. [{app_id}] {name} ({folder}) - {desc}")
    print("=" * 70)

    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(sim_url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Kindle E-Ink Hub...")
        server.server_close()


if __name__ == "__main__":
    main()
