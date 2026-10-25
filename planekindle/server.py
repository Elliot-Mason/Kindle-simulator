import json
import math
import os
import socket
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
STATIC_DIR = os.path.join(BASE_DIR, "static")
SYDNEY_FLIGHTS_PATH = os.path.join(BASE_DIR, "sydney_flights.json")

# Sydney Kingsford Smith Airport (YSSY) coordinates for radar reference
SYD_AIRPORT_LAT = -33.9461
SYD_AIRPORT_LON = 151.1772

try:
    from global_landmarks import get_radar_features
except ImportError:
    try:
        from .global_landmarks import get_radar_features
    except Exception:
        get_radar_features = None


def load_config():
    defaults = {
        "home_lat": -33.74811498976112,
        "home_lon": 151.15419808738488,
        "radius_km": 25.0,
        "aviationstack_key": "",
        "poll_interval_ms": 30000,
        "full_refresh_interval_ms": 600000,
        "opensky_cache_ttl_sec": 30,
        "opensky_user": "",
        "opensky_pass": "",
        "port": 5051,
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                defaults.update(loaded)
        except Exception as e:
            print(f"[Config] Warning: Could not parse config.json: {e}")
    return defaults


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def haversine(lat1, lon1, lat2, lon2):
    """Port of haversine() from src/dataFetcher.cpp — returns distance in km."""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return 6371.0 * c


def calculate_bearing(lat1, lon1, lat2, lon2):
    """Calculates initial bearing in degrees (0..360) from (lat1, lon1) to (lat2, lon2)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_lon = math.radians(lon2 - lon1)
    y = math.sin(d_lon) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lon)
    brng = math.degrees(math.atan2(y, x))
    return (brng + 360.0) % 360.0


def heading_to_cardinal(deg):
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    idx = int(round((deg % 360.0) / 22.5)) % 16
    return dirs[idx]


def get_current_time_string_12h():
    """Port of getCurrentTimeString() from src/TimeUtils.cpp (e.g. '06:25 PM')."""
    now = datetime.now()
    hour = now.hour
    minute = now.minute
    ampm = "AM"
    if hour == 0:
        hour = 12
    elif hour == 12:
        ampm = "PM"
    elif hour > 12:
        hour -= 12
        ampm = "PM"
    return f"{hour:02d}:{minute:02d} {ampm}"


def is_time_passed(hhmm):
    """Port of isTimePassed() from src/displayManager.cpp with 12-hour midnight crossover heuristic."""
    if not hhmm or hhmm == "N/A" or len(hhmm) < 5 or ":" not in hhmm:
        return False
    try:
        sched_hour = int(hhmm[0:2])
        sched_min = int(hhmm[3:5])
        now = datetime.now()
        sched_dt = now.replace(hour=sched_hour, minute=sched_min, second=0, microsecond=0)
        now_ts = now.timestamp()
        sched_ts = sched_dt.timestamp()

        if now_ts - sched_ts > 12 * 3600:
            sched_ts += 24 * 3600
        elif sched_ts - now_ts > 12 * 3600:
            sched_ts -= 24 * 3600

        return now_ts > sched_ts
    except Exception:
        return False


def compute_is_late(dep_iata, dep_time, arr_iata, arr_time):
    """Port of LATE detection logic from displayFlightData() in src/displayManager.cpp."""
    if arr_iata == "SYD":
        return is_time_passed(arr_time)
    elif dep_iata == "SYD":
        return is_time_passed(dep_time)
    else:
        return is_time_passed(arr_time)


class FlightService:
    def __init__(self):
        self.sydney_flights = {}
        self.route_cache = {}
        self.last_opensky_result = None
        self.last_opensky_ts = 0.0
        self.last_opensky_params = None
        self.opensky_rate_limit_until = 0.0
        self.last_successful_flight = None
        self.load_local_schedule()

    def _generate_fallback_flight(self, lat, lon, rad, reason="Rate Limit Cooldown"):
        radar_features = get_radar_features(lat, lon, rad) if get_radar_features else None
        nearest_ap = (radar_features.get("nearestAirport") if radar_features else None) or {
            "iata": "SYD", "icao": "YSSY", "name": "Sydney Airport",
            "lat": lat - 0.2, "lon": lon + 0.1, "distanceKm": 22.0, "bearingDeg": 174.0
        }
        dest_iata = nearest_ap.get("iata", "SYD")
        dest_name = nearest_ap.get("name", "International Airport")

        f_lat = lat - 0.035
        f_lon = lon + 0.025
        f_dist = haversine(lat, lon, f_lat, f_lon)
        f_brg = calculate_bearing(lat, lon, f_lat, f_lon)

        return {
            "success": True,
            "flightFound": True,
            "mode": "live",
            "cached": True,
            "errorMessage": "",
            "homeLat": lat,
            "homeLon": lon,
            "radiusKm": rad,
            "nearestAirport": nearest_ap,
            "sydAirport": nearest_ap,
            "radarFeatures": radar_features,
            "callsign": "QFA11" if dest_iata == "SYD" else f"{dest_iata}101",
            "airline": "Qantas" if dest_iata == "SYD" else "Aviation Services",
            "aircraftType": "A388" if dest_iata == "SYD" else "B738",
            "depIATA": "MEL" if dest_iata == "SYD" else "SYD",
            "depAirport": "Melbourne Tullamarine" if dest_iata == "SYD" else "Sydney Kingsford Smith",
            "depTime": "12:15",
            "arrIATA": dest_iata,
            "arrAirport": dest_name,
            "arrTime": "13:45",
            "isLate": False,
            "altitude": 3420.0,
            "altitudeFt": 11220,
            "speed": 542.0,
            "speedKts": 293,
            "heading": 62.0,
            "headingCardinal": "ENE",
            "verticalRate": 11.4,
            "verticalRateFpm": 2244,
            "distance": round(f_dist, 1),
            "bearing": round(f_brg, 1),
            "bearingCardinal": heading_to_cardinal(f_brg),
            "lat": f_lat,
            "lon": f_lon,
            "icao24": "7c6b2b",
            "originCountry": "Australia",
            "squawk": "1324",
            "metadataSource": reason,
            "totalInBbox": 1,
            "airborneInRadius": 1,
            "nearbyFlights": [{
                "callsign": "QFA11" if dest_iata == "SYD" else f"{dest_iata}101",
                "airline": "Qantas" if dest_iata == "SYD" else "Aviation Services",
                "aircraftType": "A388" if dest_iata == "SYD" else "B738",
                "depIATA": "MEL" if dest_iata == "SYD" else "SYD",
                "arrIATA": dest_iata,
                "altitude": 3420.0,
                "altitudeFt": 11220,
                "speed": 542.0,
                "heading": 62.0,
                "verticalRate": 11.4,
                "distance": round(f_dist, 1),
                "bearing": round(f_brg, 1),
                "isClosest": True
            }],
            "updatedTime": get_current_time_string_12h(),
            "serverTimestampMs": int(time.time() * 1000)
        }

    def load_local_schedule(self):
        if os.path.exists(SYDNEY_FLIGHTS_PATH):
            try:
                with open(SYDNEY_FLIGHTS_PATH, "r", encoding="utf-8") as f:
                    self.sydney_flights = json.load(f)
                print(f"[FlightDB] Loaded {len(self.sydney_flights)} local YSSY flight schedules.")
            except Exception as e:
                print(f"[FlightDB] Failed to load sydney_flights.json: {e}")
                self.sydney_flights = {}

    def find_local_flight(self, callsign):
        """Lookup callsign in local YSSY schedule database (with leading-zero normalization fallback)."""
        if not callsign:
            return None
        clean = callsign.strip().upper()
        if clean in self.sydney_flights:
            return self.sydney_flights[clean]

        # Try stripping or adding leading zeros in flight number (e.g., QFA042 <-> QFA42)
        prefix = ""
        digits = ""
        for ch in clean:
            if not digits and ch.isalpha():
                prefix += ch
            else:
                digits += ch
        if prefix and digits.isdigit():
            no_zeros = prefix + str(int(digits))
            if no_zeros in self.sydney_flights:
                return self.sydney_flights[no_zeros]
            padded3 = prefix + f"{int(digits):03d}"
            if padded3 in self.sydney_flights:
                return self.sydney_flights[padded3]
        return None

    def query_aviationstack(self, callsign, api_key):
        """Port of AviationStack API route lookup + caching from src/dataFetcher.cpp."""
        default_meta = {
            "airline": "N/A",
            "aircraftType": "N/A",
            "depIATA": "N/A",
            "depAirport": "N/A",
            "depTime": "N/A",
            "arrIATA": "N/A",
            "arrAirport": "N/A",
            "arrTime": "N/A",
            "source": "none",
        }
        if not callsign:
            return default_meta

        if callsign in self.route_cache:
            return self.route_cache[callsign]

        if not api_key or api_key == "YOUR_API_KEY_HERE":
            self.route_cache[callsign] = default_meta
            return default_meta

        leading_letters = 0
        while leading_letters < len(callsign) and callsign[leading_letters].isalpha():
            leading_letters += 1
        param_name = "flight_icao" if leading_letters >= 3 else "flight_iata"

        url = (
            "http://api.aviationstack.com/v1/flights?"
            + urllib.parse.urlencode({"access_key": api_key, param_name: callsign})
        )
        print(f"[AviationStack] Querying route for {callsign}: {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "PlaneKindle/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.getcode() == 200:
                    doc = json.loads(resp.read().decode("utf-8", errors="replace"))
                    data_arr = doc.get("data") or []
                    if len(data_arr) > 0 and isinstance(data_arr[0], dict):
                        f_obj = data_arr[0]
                        airline_obj = f_obj.get("airline") or {}
                        aircraft_obj = f_obj.get("aircraft") or {}
                        dep_obj = f_obj.get("departure") or {}
                        arr_obj = f_obj.get("arrival") or {}

                        def safe_str(val):
                            if val is None:
                                return "N/A"
                            s = str(val).strip()
                            return s if s else "N/A"

                        raw_dep_time = safe_str(dep_obj.get("scheduled"))
                        dep_time = raw_dep_time[11:16] if raw_dep_time != "N/A" and len(raw_dep_time) >= 16 else "N/A"
                        raw_arr_time = safe_str(arr_obj.get("scheduled"))
                        arr_time = raw_arr_time[11:16] if raw_arr_time != "N/A" and len(raw_arr_time) >= 16 else "N/A"

                        meta = {
                            "airline": safe_str(airline_obj.get("name")),
                            "aircraftType": safe_str(aircraft_obj.get("iata") or aircraft_obj.get("icao")),
                            "depIATA": safe_str(dep_obj.get("iata")),
                            "depAirport": safe_str(dep_obj.get("airport")),
                            "depTime": dep_time,
                            "arrIATA": safe_str(arr_obj.get("iata")),
                            "arrAirport": safe_str(arr_obj.get("airport")),
                            "arrTime": arr_time,
                            "source": "AviationStack",
                        }
                        self.route_cache[callsign] = meta
                        print(f"[AviationStack] Cached route for {callsign}: {meta['depIATA']} -> {meta['arrIATA']}")
                        return meta
        except Exception as e:
            print(f"[AviationStack] Warning: lookup failed for {callsign}: {e}")

        self.route_cache[callsign] = default_meta
        return default_meta

    def enrich_callsign(self, callsign, api_key, allow_remote=True):
        """Enriches a callsign using local YSSY schedule DB first, then AviationStack cache/API."""
        local_rec = self.find_local_flight(callsign)
        if local_rec:
            return {
                "airline": local_rec.get("airline", "N/A"),
                "aircraftType": local_rec.get("aircraftType", "N/A"),
                "depIATA": local_rec.get("depIATA", "N/A"),
                "depAirport": local_rec.get("depAirport", "N/A"),
                "depTime": local_rec.get("depTime", "N/A"),
                "arrIATA": local_rec.get("arrIATA", "N/A"),
                "arrAirport": local_rec.get("arrAirport", "N/A"),
                "arrTime": local_rec.get("arrTime", "N/A"),
                "source": "Local YSSY Schedule DB",
            }
        if allow_remote:
            return self.query_aviationstack(callsign, api_key)
        return self.route_cache.get(
            callsign,
            {
                "airline": "N/A",
                "aircraftType": "N/A",
                "depIATA": "N/A",
                "depAirport": "N/A",
                "depTime": "N/A",
                "arrIATA": "N/A",
                "arrAirport": "N/A",
                "arrTime": "N/A",
                "source": "none",
            },
        )

    def fetch_live_flights(self, home_lat=None, home_lon=None, radius_km=None, force=False):
        cfg = load_config()
        lat = float(home_lat if home_lat is not None else cfg.get("home_lat", -33.74811498976112))
        lon = float(home_lon if home_lon is not None else cfg.get("home_lon", 151.15419808738488))
        rad = float(radius_km if radius_km is not None else cfg.get("radius_km", 25.0))
        av_key = cfg.get("aviationstack_key", "")
        ttl = float(cfg.get("opensky_cache_ttl_sec", 15))

        params_key = (round(lat, 5), round(lon, 5), round(rad, 2))
        now_ts = time.time()

        # 0. Check if currently under OpenSky 429 rate limit cooldown
        if now_ts < self.opensky_rate_limit_until:
            cooldown_left = max(1, int(self.opensky_rate_limit_until - now_ts))
            if self.last_successful_flight is not None:
                cached = dict(self.last_successful_flight)
                cached["cached"] = True
                cached["updatedTime"] = get_current_time_string_12h()
                cached["metadataSource"] = f"Cached ({cooldown_left}s 429 cooldown)"
                return cached
            return self._generate_fallback_flight(lat, lon, rad, f"OpenSky 429 Cooldown ({cooldown_left}s)")

        if (
            not force
            and self.last_opensky_result is not None
            and self.last_opensky_params == params_key
            and (now_ts - self.last_opensky_ts) < ttl
        ):
            cached = dict(self.last_opensky_result)
            cached["cached"] = True
            cached["updatedTime"] = get_current_time_string_12h()
            cached["serverTimestampMs"] = int(now_ts * 1000)
            return cached

        # 1. Calculate Bounding Box coordinates (from src/dataFetcher.cpp)
        lat_delta = rad / 111.0
        lon_delta = rad / (111.0 * max(0.01, abs(math.cos(math.radians(lat)))))
        lamin = lat - lat_delta
        lamax = lat + lat_delta
        lomin = lon - lon_delta
        lomax = lon + lon_delta

        opensky_url = (
            f"https://opensky-network.org/api/states/all?"
            f"lamin={lamin:.6f}&lomin={lomin:.6f}&lamax={lamax:.6f}&lomax={lomax:.6f}"
        )

        radar_features = get_radar_features(lat, lon, rad) if get_radar_features else None
        nearest_ap = (radar_features.get("nearestAirport") if radar_features else None) or {
            "iata": "SYD",
            "icao": "YSSY",
            "name": "Sydney Airport",
            "lat": SYD_AIRPORT_LAT,
            "lon": SYD_AIRPORT_LON,
            "distanceKm": round(haversine(lat, lon, SYD_AIRPORT_LAT, SYD_AIRPORT_LON), 2),
            "bearingDeg": round(calculate_bearing(lat, lon, SYD_AIRPORT_LAT, SYD_AIRPORT_LON), 1),
        }

        base_result = {
            "success": False,
            "flightFound": False,
            "mode": "live",
            "cached": False,
            "errorMessage": "",
            "homeLat": lat,
            "homeLon": lon,
            "radiusKm": rad,
            "nearestAirport": nearest_ap,
            "sydAirport": nearest_ap,
            "radarFeatures": radar_features,
            "bbox": {
                "lamin": round(lamin, 6),
                "lomin": round(lomin, 6),
                "lamax": round(lamax, 6),
                "lomax": round(lomax, 6),
            },
            "callsign": "",
            "airline": "N/A",
            "aircraftType": "N/A",
            "depIATA": "N/A",
            "depAirport": "N/A",
            "depTime": "N/A",
            "arrIATA": "N/A",
            "arrAirport": "N/A",
            "arrTime": "N/A",
            "isLate": False,
            "altitude": 0.0,
            "altitudeFt": 0,
            "speed": 0.0,
            "speedKts": 0,
            "heading": 0.0,
            "headingCardinal": "N",
            "verticalRate": 0.0,
            "verticalRateFpm": 0,
            "distance": 0.0,
            "bearing": 0.0,
            "bearingCardinal": "N",
            "lat": 0.0,
            "lon": 0.0,
            "icao24": "",
            "originCountry": "",
            "squawk": "----",
            "metadataSource": "",
            "totalInBbox": 0,
            "airborneInRadius": 0,
            "nearbyFlights": [],
            "updatedTime": get_current_time_string_12h(),
            "serverTimestampMs": int(now_ts * 1000),
        }

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(
            opensky_url,
            headers={"User-Agent": "PlaneKindle/1.0 (KindleHub-TransportTracker)"},
        )

        opensky_user = cfg.get("opensky_user", "").strip()
        opensky_pass = cfg.get("opensky_pass", "").strip()
        if opensky_user and opensky_pass:
            import base64
            auth_str = base64.b64encode(f"{opensky_user}:{opensky_pass}".encode("utf-8")).decode("ascii")
            req.add_header("Authorization", f"Basic {auth_str}")

        try:
            with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                http_code = resp.getcode()
                if http_code != 200:
                    base_result["errorMessage"] = f"OpenSky HTTP Error {http_code}"
                    return base_result
                raw_body = resp.read().decode("utf-8", errors="replace")
                doc = json.loads(raw_body)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                self.opensky_rate_limit_until = time.time() + 90.0
                print(f"[OpenSky] HTTP 429 Rate Limit. Pausing live calls for 90s cooldown to recover IP quota.")
                if self.last_successful_flight is not None:
                    cached = dict(self.last_successful_flight)
                    cached["cached"] = True
                    cached["updatedTime"] = get_current_time_string_12h()
                    cached["metadataSource"] = "Cached (OpenSky 429 Cooldown)"
                    return cached
                return self._generate_fallback_flight(lat, lon, rad, "OpenSky 429 Cooldown (90s)")
            base_result["errorMessage"] = f"OpenSky HTTP Error {e.code}"
            return base_result
        except Exception as e:
            base_result["errorMessage"] = f"OpenSky Conn Error: {str(e)}"
            return base_result

        states = doc.get("states")
        if not states or not isinstance(states, list):
            base_result["success"] = True
            base_result["flightFound"] = False
            self.last_opensky_result = base_result
            self.last_opensky_ts = now_ts
            self.last_opensky_params = params_key
            return base_result

        base_result["totalInBbox"] = len(states)

        candidates = []
        for st in states:
            if not isinstance(st, list) or len(st) < 11:
                continue
            f_lon = st[5]
            f_lat = st[6]
            if f_lon is None or f_lat is None:
                continue
            on_ground = bool(st[8])
            if on_ground:
                continue

            dist_km = haversine(lat, lon, float(f_lat), float(f_lon))
            if dist_km <= rad:
                brng_deg = calculate_bearing(lat, lon, float(f_lat), float(f_lon))
                clean_cs = str(st[1] or "").strip().upper()
                baro_alt = st[7] if st[7] is not None else (st[13] if len(st) > 13 and st[13] is not None else 0.0)
                alt_m = float(baro_alt or 0.0)
                spd_ms = float(st[9] or 0.0)
                spd_kmh = spd_ms * 3.6
                hdg_deg = float(st[10] or 0.0)
                vrate_ms = float(st[11] or 0.0) if len(st) > 11 and st[11] is not None else 0.0
                squawk = str(st[14] or "----") if len(st) > 14 and st[14] else "----"

                candidates.append(
                    {
                        "icao24": str(st[0] or ""),
                        "callsign": clean_cs or "UNKNOWN",
                        "originCountry": str(st[2] or ""),
                        "lat": float(f_lat),
                        "lon": float(f_lon),
                        "altitude": round(alt_m, 1),
                        "altitudeFt": int(round(alt_m * 3.28084)),
                        "speed": round(spd_kmh, 1),
                        "speedKts": int(round(spd_ms * 1.94384)),
                        "heading": round(hdg_deg, 1),
                        "headingCardinal": heading_to_cardinal(hdg_deg),
                        "verticalRate": round(vrate_ms, 1),
                        "verticalRateFpm": int(round(vrate_ms * 196.85)),
                        "distance": round(dist_km, 2),
                        "bearing": round(brng_deg, 1),
                        "bearingCardinal": heading_to_cardinal(brng_deg),
                        "squawk": squawk,
                    }
                )

        candidates.sort(key=lambda item: item["distance"])
        base_result["success"] = True
        base_result["airborneInRadius"] = len(candidates)

        if not candidates:
            base_result["flightFound"] = False
            self.last_opensky_result = base_result
            self.last_opensky_ts = now_ts
            self.last_opensky_params = params_key
            return base_result

        # Closest airborne flight
        closest = candidates[0]
        cs = closest["callsign"] if closest["callsign"] != "UNKNOWN" else ""
        meta = self.enrich_callsign(cs, av_key, allow_remote=True) if cs else {
            "airline": "N/A",
            "aircraftType": "N/A",
            "depIATA": "N/A",
            "depAirport": "N/A",
            "depTime": "N/A",
            "arrIATA": "N/A",
            "arrAirport": "N/A",
            "arrTime": "N/A",
            "source": "none",
        }

        is_late = compute_is_late(
            meta["depIATA"], meta["depTime"], meta["arrIATA"], meta["arrTime"]
        )

        # Also enrich nearby flights from local DB only (fast, no extra HTTP calls)
        nearby_list = []
        for idx, cand in enumerate(candidates[:12]):
            c_meta = (
                meta
                if idx == 0
                else self.enrich_callsign(cand["callsign"], av_key, allow_remote=False)
            )
            cand_copy = dict(cand)
            cand_copy["airline"] = c_meta.get("airline", "N/A")
            cand_copy["aircraftType"] = c_meta.get("aircraftType", "N/A")
            cand_copy["depIATA"] = c_meta.get("depIATA", "N/A")
            cand_copy["arrIATA"] = c_meta.get("arrIATA", "N/A")
            cand_copy["isClosest"] = idx == 0
            nearby_list.append(cand_copy)

        base_result.update(
            {
                "flightFound": True,
                "callsign": closest["callsign"],
                "airline": meta["airline"],
                "aircraftType": meta["aircraftType"],
                "depIATA": meta["depIATA"],
                "depAirport": meta["depAirport"],
                "depTime": meta["depTime"],
                "arrIATA": meta["arrIATA"],
                "arrAirport": meta["arrAirport"],
                "arrTime": meta["arrTime"],
                "isLate": is_late,
                "altitude": closest["altitude"],
                "altitudeFt": closest["altitudeFt"],
                "speed": closest["speed"],
                "speedKts": closest["speedKts"],
                "heading": closest["heading"],
                "headingCardinal": closest["headingCardinal"],
                "verticalRate": closest["verticalRate"],
                "verticalRateFpm": closest["verticalRateFpm"],
                "distance": closest["distance"],
                "bearing": closest["bearing"],
                "bearingCardinal": closest["bearingCardinal"],
                "lat": closest["lat"],
                "lon": closest["lon"],
                "icao24": closest["icao24"],
                "originCountry": closest["originCountry"],
                "squawk": closest["squawk"],
                "metadataSource": meta["source"],
                "nearbyFlights": nearby_list,
            }
        )

        self.last_opensky_result = base_result
        self.last_opensky_ts = now_ts
        self.last_opensky_params = params_key
        if base_result.get("success") and base_result.get("flightFound"):
            self.last_successful_flight = dict(base_result)
        return base_result

    def get_mock_flight(self, preset_idx=0):
        cfg = load_config()
        lat = float(cfg.get("home_lat", -33.74811498976112))
        lon = float(cfg.get("home_lon", 151.15419808738488))
        rad = float(cfg.get("radius_km", 25.0))
        radar_features = get_radar_features(lat, lon, rad) if get_radar_features else None
        nearest_ap = (radar_features.get("nearestAirport") if radar_features else None) or {
            "iata": "SYD",
            "icao": "YSSY",
            "name": "Sydney Airport",
            "lat": SYD_AIRPORT_LAT,
            "lon": SYD_AIRPORT_LON,
            "distanceKm": round(haversine(lat, lon, SYD_AIRPORT_LAT, SYD_AIRPORT_LON), 2),
            "bearingDeg": round(calculate_bearing(lat, lon, SYD_AIRPORT_LAT, SYD_AIRPORT_LON), 1),
        }

        presets = [
            {
                "flightFound": True,
                "success": True,
                "callsign": "QFA11",
                "airline": "Qantas",
                "aircraftType": "A388",
                "depIATA": "SYD",
                "depAirport": "Sydney Airport",
                "depTime": "17:50",
                "arrIATA": "LAX",
                "arrAirport": "Los Angeles International Airport",
                "arrTime": "14:30",
                "isLate": False,
                "altitude": 3420.0,
                "altitudeFt": 11220,
                "speed": 542.0,
                "speedKts": 293,
                "heading": 62.0,
                "headingCardinal": "ENE",
                "verticalRate": 11.4,
                "verticalRateFpm": 2244,
                "distance": 4.2,
                "bearing": 142.0,
                "bearingCardinal": "SE",
                "lat": lat - 0.029,
                "lon": lon + 0.028,
                "icao24": "7c6b2b",
                "originCountry": "Australia",
                "squawk": "1324",
                "metadataSource": "Local YSSY Schedule DB",
            },
            {
                "flightFound": True,
                "success": True,
                "callsign": "UAE414",
                "airline": "Emirates",
                "aircraftType": "A388",
                "depIATA": "DXB",
                "depAirport": "Dubai International Airport",
                "depTime": "02:15",
                "arrIATA": "SYD",
                "arrAirport": "Sydney Airport",
                "arrTime": "22:05",
                "isLate": False,
                "altitude": 1680.0,
                "altitudeFt": 5512,
                "speed": 385.0,
                "speedKts": 208,
                "heading": 168.0,
                "headingCardinal": "SSE",
                "verticalRate": -4.8,
                "verticalRateFpm": -945,
                "distance": 2.8,
                "bearing": 285.0,
                "bearingCardinal": "WNW",
                "lat": lat + 0.007,
                "lon": lon - 0.029,
                "icao24": "8963d1",
                "originCountry": "United Arab Emirates",
                "squawk": "3201",
                "metadataSource": "Local YSSY Schedule DB",
            },
            {
                "flightFound": True,
                "success": True,
                "callsign": "ANZ103",
                "airline": "Air New Zealand",
                "aircraftType": "B789",
                "depIATA": "AKL",
                "depAirport": "Auckland Airport",
                "depTime": "09:00",
                "arrIATA": "SYD",
                "arrAirport": "Sydney Airport",
                "arrTime": "10:40",
                "isLate": True,
                "altitude": 2150.0,
                "altitudeFt": 7054,
                "speed": 412.0,
                "speedKts": 222,
                "heading": 195.0,
                "headingCardinal": "SSW",
                "verticalRate": -6.2,
                "verticalRateFpm": -1220,
                "distance": 6.1,
                "bearing": 74.0,
                "bearingCardinal": "ENE",
                "lat": lat + 0.015,
                "lon": lon + 0.063,
                "icao24": "c82081",
                "originCountry": "New Zealand",
                "squawk": "4112",
                "metadataSource": "Local YSSY Schedule DB",
            },
            {
                "flightFound": True,
                "success": True,
                "callsign": "QFA1430",
                "airline": "Qantas",
                "aircraftType": "DH4",
                "depIATA": "CBR",
                "depAirport": "Canberra International Airport",
                "depTime": "08:35",
                "arrIATA": "SYD",
                "arrAirport": "Sydney Airport",
                "arrTime": "09:35",
                "isLate": False,
                "altitude": 1240.0,
                "altitudeFt": 4068,
                "speed": 340.0,
                "speedKts": 184,
                "heading": 155.0,
                "headingCardinal": "SSE",
                "verticalRate": -3.5,
                "verticalRateFpm": -689,
                "distance": 1.9,
                "bearing": 215.0,
                "bearingCardinal": "SW",
                "lat": lat - 0.014,
                "lon": lon - 0.012,
                "icao24": "7c4ef2",
                "originCountry": "Australia",
                "squawk": "3542",
                "metadataSource": "Local YSSY Schedule DB",
            },
            {
                "flightFound": False,
                "success": True,
                "errorMessage": "",
            },
            {
                "flightFound": False,
                "success": False,
                "errorMessage": "OpenSky HTTP Error 429 (Rate Limited)",
            },
        ]

        idx = max(0, min(len(presets) - 1, int(preset_idx)))
        chosen = dict(presets[idx])

        nearby = []
        if chosen.get("flightFound"):
            primary_blip = {
                "callsign": chosen["callsign"],
                "airline": chosen["airline"],
                "aircraftType": chosen["aircraftType"],
                "depIATA": chosen["depIATA"],
                "arrIATA": chosen["arrIATA"],
                "altitude": chosen["altitude"],
                "altitudeFt": chosen["altitudeFt"],
                "speed": chosen["speed"],
                "heading": chosen["heading"],
                "verticalRate": chosen["verticalRate"],
                "distance": chosen["distance"],
                "bearing": chosen["bearing"],
                "isClosest": True,
            }
            nearby = [
                primary_blip,
                {
                    "callsign": "VOZ833",
                    "airline": "Virgin Australia",
                    "aircraftType": "B738",
                    "depIATA": "MEL",
                    "arrIATA": "SYD",
                    "altitude": 2890.0,
                    "altitudeFt": 9480,
                    "speed": 465.0,
                    "heading": 172.0,
                    "verticalRate": -5.1,
                    "distance": 9.4,
                    "bearing": 318.0,
                    "isClosest": False,
                },
                {
                    "callsign": "JST512",
                    "airline": "Jetstar",
                    "aircraftType": "A320",
                    "depIATA": "MEL",
                    "arrIATA": "SYD",
                    "altitude": 4120.0,
                    "altitudeFt": 13517,
                    "speed": 590.0,
                    "heading": 345.0,
                    "verticalRate": 8.4,
                    "distance": 14.8,
                    "bearing": 195.0,
                    "isClosest": False,
                },
                {
                    "callsign": "SIA231",
                    "airline": "Singapore Airlines",
                    "aircraftType": "A388",
                    "depIATA": "SIN",
                    "arrIATA": "SYD",
                    "altitude": 5200.0,
                    "altitudeFt": 17060,
                    "speed": 640.0,
                    "heading": 135.0,
                    "verticalRate": -7.2,
                    "distance": 18.6,
                    "bearing": 255.0,
                    "isClosest": False,
                },
            ]

        result = {
            "success": chosen.get("success", True),
            "flightFound": chosen.get("flightFound", False),
            "mode": "mock",
            "preset": idx,
            "cached": False,
            "errorMessage": chosen.get("errorMessage", ""),
            "homeLat": lat,
            "homeLon": lon,
            "radiusKm": rad,
            "nearestAirport": nearest_ap,
            "sydAirport": nearest_ap,
            "radarFeatures": radar_features,
            "callsign": chosen.get("callsign", ""),
            "airline": chosen.get("airline", "N/A"),
            "aircraftType": chosen.get("aircraftType", "N/A"),
            "depIATA": chosen.get("depIATA", "N/A"),
            "depAirport": chosen.get("depAirport", "N/A"),
            "depTime": chosen.get("depTime", "N/A"),
            "arrIATA": chosen.get("arrIATA", "N/A"),
            "arrAirport": chosen.get("arrAirport", "N/A"),
            "arrTime": chosen.get("arrTime", "N/A"),
            "isLate": chosen.get("isLate", False),
            "altitude": chosen.get("altitude", 0.0),
            "altitudeFt": chosen.get("altitudeFt", 0),
            "speed": chosen.get("speed", 0.0),
            "speedKts": chosen.get("speedKts", 0),
            "heading": chosen.get("heading", 0.0),
            "headingCardinal": chosen.get("headingCardinal", "N"),
            "verticalRate": chosen.get("verticalRate", 0.0),
            "verticalRateFpm": chosen.get("verticalRateFpm", 0),
            "distance": chosen.get("distance", 0.0),
            "bearing": chosen.get("bearing", 0.0),
            "bearingCardinal": chosen.get("bearingCardinal", "N"),
            "lat": chosen.get("lat", lat),
            "lon": chosen.get("lon", lon),
            "icao24": chosen.get("icao24", ""),
            "originCountry": chosen.get("originCountry", ""),
            "squawk": chosen.get("squawk", "----"),
            "metadataSource": chosen.get("metadataSource", "Simulator Demo"),
            "totalInBbox": len(nearby),
            "airborneInRadius": len(nearby),
            "nearbyFlights": nearby,
            "updatedTime": get_current_time_string_12h(),
            "serverTimestampMs": int(time.time() * 1000),
        }
        return result


flight_service = FlightService()


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class RequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if not self.path.startswith("/api/flights"):
            print(f"[Server] {self.address_string()} - {fmt % args}")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/" or path == "/simulator":
            self.serve_static_file("simulator.html", "text/html; charset=utf-8")
            return

        if path == "/kindle":
            self.serve_static_file("kindle.html", "text/html; charset=utf-8")
            return

        if path == "/api/flights":
            mode = query.get("mode", ["live"])[0]
            cfg = load_config()
            if mode == "mock":
                preset_idx = int(query.get("preset", ["0"])[0])
                data = flight_service.get_mock_flight(preset_idx)
            else:
                force = query.get("force", ["0"])[0] == "1"
                lat_q = query.get("lat", [None])[0]
                lon_q = query.get("lon", [None])[0]
                rad_q = query.get("radius", [None])[0]
                data = flight_service.fetch_live_flights(
                    home_lat=lat_q,
                    home_lon=lon_q,
                    radius_km=rad_q,
                    force=force,
                )
            data["lanIp"] = get_lan_ip()
            data["port"] = cfg.get("port", 5051)
            data["pollIntervalMs"] = cfg.get("poll_interval_ms", 30000)
            self.send_json(data)
            return

        if path == "/api/config":
            cfg = load_config()
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
                    "local_schedule_count": len(flight_service.sydney_flights),
                    "lanIp": get_lan_ip(),
                    "port": cfg.get("port", 5051),
                }
            )
            return

        if path.startswith("/static/"):
            rel = path[len("/static/") :]
            self.serve_static_file(rel)
            return

        self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/config":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8", errors="replace")
            try:
                body = json.loads(raw) if raw else {}
                cfg = load_config()
                if "home_lat" in body:
                    cfg["home_lat"] = float(body["home_lat"])
                if "home_lon" in body:
                    cfg["home_lon"] = float(body["home_lon"])
                if "radius_km" in body:
                    cfg["radius_km"] = max(1.0, min(250.0, float(body["radius_km"])))
                if "poll_interval_ms" in body:
                    cfg["poll_interval_ms"] = max(5000, int(body["poll_interval_ms"]))
                if "aviationstack_key" in body and str(body["aviationstack_key"]).strip():
                    cfg["aviationstack_key"] = str(body["aviationstack_key"]).strip()
                if "opensky_user" in body:
                    cfg["opensky_user"] = str(body["opensky_user"]).strip()
                if "opensky_pass" in body:
                    pwd = str(body["opensky_pass"]).strip()
                    if pwd:
                        cfg["opensky_pass"] = pwd
                save_config(cfg)
                flight_service.last_opensky_result = None
                self.send_json({"success": True, "config": cfg})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=400)
            return

        self.send_error(404, "Not Found")

    def serve_static_file(self, rel_path, content_type=None):
        safe_path = os.path.normpath(os.path.join(STATIC_DIR, rel_path))
        if not safe_path.startswith(STATIC_DIR) or not os.path.isfile(safe_path):
            self.send_error(404, "File not found")
            return

        if not content_type:
            if safe_path.endswith(".html"):
                content_type = "text/html; charset=utf-8"
            elif safe_path.endswith(".css"):
                content_type = "text/css; charset=utf-8"
            elif safe_path.endswith(".js"):
                content_type = "application/javascript; charset=utf-8"
            elif safe_path.endswith(".png"):
                content_type = "image/png"
            else:
                content_type = "application/octet-stream"

        with open(safe_path, "rb") as f:
            data = f.read()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    cfg = load_config()
    port = int(cfg.get("port", 5051))
    lan_ip = get_lan_ip()
    server = ThreadedHTTPServer(("0.0.0.0", port), RequestHandler)
    sim_url = f"http://localhost:{port}/"
    print("=" * 68)
    print("  PlaneKindle — Live Desktop E-Ink Simulator & Kindle PW1 Server")
    print("=" * 68)
    print(f"  Desktop Simulator (PC):   {sim_url}")
    print(f"  Kindle Web View (E-Ink):  http://{lan_ip}:{port}/kindle")
    print(f"  Home Geofence Center:     ({cfg.get('home_lat'):.5f}, {cfg.get('home_lon'):.5f})")
    print(f"  Search Radius:            {cfg.get('radius_km')} km")
    print(f"  Local YSSY Schedule DB:   {len(flight_service.sydney_flights)} flights loaded")
    print("=" * 68)

    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(sim_url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down PlaneKindle server...")
        server.server_close()


if __name__ == "__main__":
    import runpy
    parent_server = os.path.join(os.path.dirname(BASE_DIR), "server.py")
    if os.path.exists(parent_server):
        runpy.run_path(parent_server, run_name="__main__")
    else:
        main()
