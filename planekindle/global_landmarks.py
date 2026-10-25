import math
import os
import json
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH = os.path.join(BASE_DIR, "geofence_cache.json")

def haversine(lat1, lon1, lat2, lon2):
    """Calculate the great-circle distance between two points in km."""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2.0) ** 2
    )
    return 6371.0 * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

def bearing(lat1, lon1, lat2, lon2):
    """Calculate initial compass bearing from (lat1, lon1) to (lat2, lon2) in degrees [0, 360)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)
    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    deg = math.degrees(math.atan2(y, x))
    return (deg + 360.0) % 360.0

GLOBAL_AIRPORTS = [
    # --- Australia & New Zealand ---
    {
        "iata": "SYD", "icao": "YSSY", "name": "Sydney Kingsford Smith", "city": "Sydney", "country": "AU",
        "lat": -33.9461, "lon": 151.1772,
        "runways": [
            [[-33.930, 151.171], [-33.965, 151.182]], # 16R / 34L
            [[-33.938, 151.185], [-33.959, 151.192]], # 16L / 34R
            [[-33.944, 151.164], [-33.954, 151.188]], # 07 / 25
        ]
    },
    {
        "iata": "YSBK", "icao": "YSBK", "name": "Bankstown Airport", "city": "Sydney", "country": "AU",
        "lat": -33.9242, "lon": 150.9883,
        "runways": [[[-33.922, 150.982], [-33.926, 150.995]]]
    },
    {
        "iata": "MEL", "icao": "YMML", "name": "Melbourne Tullamarine", "city": "Melbourne", "country": "AU",
        "lat": -37.6733, "lon": 144.8433,
        "runways": [
            [[-37.658, 144.832], [-37.689, 144.851]], # 16 / 34
            [[-37.669, 144.855], [-37.678, 144.831]], # 09 / 27
        ]
    },
    {
        "iata": "YMEN", "icao": "YMEN", "name": "Essendon Fields", "city": "Melbourne", "country": "AU",
        "lat": -37.7281, "lon": 144.9019,
        "runways": [[[-37.722, 144.901], [-37.734, 144.903]]]
    },
    {
        "iata": "YMMB", "icao": "YMMB", "name": "Moorabbin Airport", "city": "Melbourne", "country": "AU",
        "lat": -37.9758, "lon": 145.1022,
        "runways": [[[-37.971, 145.099], [-37.980, 145.105]]]
    },
    {
        "iata": "BNE", "icao": "YBBN", "name": "Brisbane Airport", "city": "Brisbane", "country": "AU",
        "lat": -27.3842, "lon": 153.1175,
        "runways": [
            [[-27.371, 153.111], [-27.399, 153.127]], # 01R / 19L
            [[-27.368, 153.101], [-27.394, 153.115]], # 01L / 19R
        ]
    },
    {
        "iata": "PER", "icao": "YPPH", "name": "Perth Airport", "city": "Perth", "country": "AU",
        "lat": -31.9403, "lon": 115.9669,
        "runways": [[[-31.925, 115.955], [-31.954, 115.978]]]
    },
    {
        "iata": "ADL", "icao": "YPAD", "name": "Adelaide Airport", "city": "Adelaide", "country": "AU",
        "lat": -34.9450, "lon": 138.5306,
        "runways": [[[-34.933, 138.523], [-34.957, 138.538]]]
    },
    {
        "iata": "OOL", "icao": "YBCG", "name": "Gold Coast Airport", "city": "Gold Coast", "country": "AU",
        "lat": -28.1644, "lon": 153.5047,
        "runways": [[[-28.156, 153.501], [-28.172, 153.508]]]
    },
    {
        "iata": "CBR", "icao": "YSCB", "name": "Canberra Airport", "city": "Canberra", "country": "AU",
        "lat": -35.3069, "lon": 149.1950,
        "runways": [[[-35.295, 149.192], [-35.318, 149.198]]]
    },
    {
        "iata": "AKL", "icao": "NZAA", "name": "Auckland Airport", "city": "Auckland", "country": "NZ",
        "lat": -37.0082, "lon": 174.7917,
        "runways": [[[-37.005, 174.775], [-37.011, 174.808]]]
    },
    {
        "iata": "WLG", "icao": "NZWN", "name": "Wellington Airport", "city": "Wellington", "country": "NZ",
        "lat": -41.3272, "lon": 174.8053,
        "runways": [[[-41.318, 174.805], [-41.336, 174.805]]]
    },
    # --- United Kingdom & Ireland ---
    {
        "iata": "LHR", "icao": "EGLL", "name": "London Heathrow", "city": "London", "country": "GB",
        "lat": 51.4700, "lon": -0.4543,
        "runways": [
            [[51.477, -0.485], [51.464, -0.423]], # 09L / 27R
            [[51.470, -0.480], [51.458, -0.418]], # 09R / 27L
        ]
    },
    {
        "iata": "LGW", "icao": "EGKK", "name": "London Gatwick", "city": "London", "country": "GB",
        "lat": 51.1481, "lon": -0.1903,
        "runways": [[[51.148, -0.213], [51.148, -0.167]]]
    },
    {
        "iata": "LCY", "icao": "EGLC", "name": "London City", "city": "London", "country": "GB",
        "lat": 51.5053, "lon": 0.0553,
        "runways": [[[51.505, 0.045], [51.505, 0.065]]]
    },
    {
        "iata": "STN", "icao": "EGSS", "name": "London Stansted", "city": "London", "country": "GB",
        "lat": 51.8850, "lon": 0.2350,
        "runways": [[[51.890, 0.220], [51.880, 0.250]]]
    },
    {
        "iata": "MAN", "icao": "EGCC", "name": "Manchester Airport", "city": "Manchester", "country": "GB",
        "lat": 53.3537, "lon": -2.2750,
        "runways": [[[53.360, -2.290], [53.348, -2.260]]]
    },
    {
        "iata": "EDI", "icao": "EGPH", "name": "Edinburgh Airport", "city": "Edinburgh", "country": "GB",
        "lat": 55.9500, "lon": -3.3725,
        "runways": [[[55.955, -3.390], [55.945, -3.355]]]
    },
    {
        "iata": "DUB", "icao": "EIDW", "name": "Dublin Airport", "city": "Dublin", "country": "IE",
        "lat": 53.4213, "lon": -6.2700,
        "runways": [[[53.425, -6.290], [53.418, -6.250]]]
    },
    # --- Europe ---
    {
        "iata": "CDG", "icao": "LFPG", "name": "Paris Charles de Gaulle", "city": "Paris", "country": "FR",
        "lat": 49.0097, "lon": 2.5479,
        "runways": [[[49.015, 2.520], [49.005, 2.575]]]
    },
    {
        "iata": "ORY", "icao": "LFPO", "name": "Paris Orly", "city": "Paris", "country": "FR",
        "lat": 48.7262, "lon": 2.3652,
        "runways": [[[48.728, 2.345], [48.724, 2.385]]]
    },
    {
        "iata": "AMS", "icao": "EHAM", "name": "Amsterdam Schiphol", "city": "Amsterdam", "country": "NL",
        "lat": 52.3086, "lon": 4.7639,
        "runways": [
            [[52.315, 4.730], [52.301, 4.798]],
            [[52.325, 4.760], [52.295, 4.768]]
        ]
    },
    {
        "iata": "FRA", "icao": "EDDF", "name": "Frankfurt Airport", "city": "Frankfurt", "country": "DE",
        "lat": 50.0379, "lon": 8.5622,
        "runways": [[[50.038, 8.530], [50.038, 8.595]]]
    },
    {
        "iata": "BER", "icao": "EDDB", "name": "Berlin Brandenburg", "city": "Berlin", "country": "DE",
        "lat": 52.3667, "lon": 13.5033,
        "runways": [[[52.362, 13.480], [52.371, 13.526]]]
    },
    {
        "iata": "MAD", "icao": "LEMD", "name": "Madrid Barajas", "city": "Madrid", "country": "ES",
        "lat": 40.4839, "lon": -3.5680,
        "runways": [[[40.495, -3.570], [40.473, -3.566]]]
    },
    {
        "iata": "FCO", "icao": "LIRF", "name": "Rome Fiumicino", "city": "Rome", "country": "IT",
        "lat": 41.8003, "lon": 12.2389,
        "runways": [[[41.810, 12.235], [41.790, 12.242]]]
    },
    {
        "iata": "ZRH", "icao": "LSZH", "name": "Zurich Airport", "city": "Zurich", "country": "CH",
        "lat": 47.4581, "lon": 8.5555,
        "runways": [[[47.465, 8.545], [47.450, 8.565]]]
    },
    # --- United States ---
    {
        "iata": "JFK", "icao": "KJFK", "name": "New York JFK", "city": "New York", "country": "US",
        "lat": 40.6413, "lon": -73.7781,
        "runways": [
            [[40.630, -73.790], [40.652, -73.766]], # 04L / 22R
            [[40.635, -73.760], [40.647, -73.796]], # 13R / 31L
        ]
    },
    {
        "iata": "LGA", "icao": "KLGA", "name": "New York LaGuardia", "city": "New York", "country": "US",
        "lat": 40.7769, "lon": -73.8740,
        "runways": [[[40.773, -73.882], [40.781, -73.866]]]
    },
    {
        "iata": "EWR", "icao": "KEWR", "name": "Newark Liberty", "city": "New York", "country": "US",
        "lat": 40.6895, "lon": -74.1745,
        "runways": [[[40.678, -74.178], [40.701, -74.171]]]
    },
    {
        "iata": "LAX", "icao": "KLAX", "name": "Los Angeles Intl", "city": "Los Angeles", "country": "US",
        "lat": 33.9425, "lon": -118.4081,
        "runways": [
            [[33.948, -118.430], [33.937, -118.386]],
            [[33.942, -118.430], [33.931, -118.386]]
        ]
    },
    {
        "iata": "SFO", "icao": "KSFO", "name": "San Francisco Intl", "city": "San Francisco", "country": "US",
        "lat": 37.6213, "lon": -122.3790,
        "runways": [
            [[37.615, -122.390], [37.627, -122.368]],
            [[37.625, -122.390], [37.617, -122.368]]
        ]
    },
    {
        "iata": "ORD", "icao": "KORD", "name": "Chicago O'Hare", "city": "Chicago", "country": "US",
        "lat": 41.9742, "lon": -87.9073,
        "runways": [[[41.975, -87.930], [41.973, -87.885]]]
    },
    {
        "iata": "ATL", "icao": "KATL", "name": "Atlanta Hartsfield", "city": "Atlanta", "country": "US",
        "lat": 33.6407, "lon": -84.4277,
        "runways": [[[33.640, -84.450], [33.640, -84.405]]]
    },
    {
        "iata": "MIA", "icao": "KMIA", "name": "Miami Intl", "city": "Miami", "country": "US",
        "lat": 25.7959, "lon": -80.2870,
        "runways": [[[25.795, -80.305], [25.795, -80.269]]]
    },
    {
        "iata": "SEA", "icao": "KSEA", "name": "Seattle-Tacoma", "city": "Seattle", "country": "US",
        "lat": 47.4502, "lon": -122.3088,
        "runways": [[[47.465, -122.312], [47.435, -122.305]]]
    },
    # --- Asia & Middle East ---
    {
        "iata": "HND", "icao": "RJTT", "name": "Tokyo Haneda", "city": "Tokyo", "country": "JP",
        "lat": 35.5494, "lon": 139.7798,
        "runways": [[[35.540, 139.765], [35.558, 139.795]]]
    },
    {
        "iata": "NRT", "icao": "RJAA", "name": "Tokyo Narita", "city": "Tokyo", "country": "JP",
        "lat": 35.7647, "lon": 140.3863,
        "runways": [[[35.750, 140.380], [35.780, 140.392]]]
    },
    {
        "iata": "SIN", "icao": "WSSS", "name": "Singapore Changi", "city": "Singapore", "country": "SG",
        "lat": 1.3644, "lon": 103.9915,
        "runways": [[[1.350, 103.985], [1.378, 103.998]]]
    },
    {
        "iata": "HKG", "icao": "VHHH", "name": "Hong Kong Intl", "city": "Hong Kong", "country": "HK",
        "lat": 22.3080, "lon": 113.9185,
        "runways": [[[22.305, 113.900], [22.311, 113.937]]]
    },
    {
        "iata": "DXB", "icao": "OMDB", "name": "Dubai Intl", "city": "Dubai", "country": "AE",
        "lat": 25.2532, "lon": 55.3657,
        "runways": [[[25.260, 55.345], [25.246, 55.386]]]
    }
]

GLOBAL_LANDMARKS = [
    # --- Sydney Region ---
    {"name": "CBD / BRG", "city": "Sydney", "type": "bridge", "lat": -33.8523, "lon": 151.2108},
    {"name": "MANLY", "city": "Sydney", "type": "beach", "lat": -33.7997, "lon": 151.2844},
    {"name": "N HEAD", "city": "Sydney", "type": "headland", "lat": -33.8160, "lon": 151.2990},
    {"name": "S HEAD", "city": "Sydney", "type": "headland", "lat": -33.8330, "lon": 151.2820},
    {"name": "BONDI", "city": "Sydney", "type": "beach", "lat": -33.8910, "lon": 151.2780},
    {"name": "COOGEE", "city": "Sydney", "type": "beach", "lat": -33.9230, "lon": 151.2590},
    {"name": "LNG REEF", "city": "Sydney", "type": "headland", "lat": -33.7450, "lon": 151.3180},
    {"name": "NARRABEEN", "city": "Sydney", "type": "beach", "lat": -33.7150, "lon": 151.3050},
    {"name": "PLM BCH", "city": "Sydney", "type": "beach", "lat": -33.5850, "lon": 151.3250},
    {"name": "PARRA", "city": "Sydney", "type": "city", "lat": -33.8150, "lon": 151.0050},
    {"name": "CHATSWOOD", "city": "Sydney", "type": "city", "lat": -33.7960, "lon": 151.1800},
    {"name": "HORNSBY", "city": "Sydney", "type": "city", "lat": -33.7030, "lon": 151.0980},
    {"name": "OLYMPIC PK", "city": "Sydney", "type": "landmark", "lat": -33.8470, "lon": 151.0650},
    {"name": "BOTANY BAY", "city": "Sydney", "type": "bay", "lat": -33.9980, "lon": 151.1850},
    # --- Melbourne Region ---
    {"name": "MELB CBD", "city": "Melbourne", "type": "city", "lat": -37.8136, "lon": 144.9631},
    {"name": "ST KILDA", "city": "Melbourne", "type": "beach", "lat": -37.8640, "lon": 144.9820},
    {"name": "BRIGHTON", "city": "Melbourne", "type": "beach", "lat": -37.9060, "lon": 144.9900},
    {"name": "WILLIAMSTOWN", "city": "Melbourne", "type": "bay", "lat": -37.8630, "lon": 144.8980},
    {"name": "PORT PHILLIP", "city": "Melbourne", "type": "bay", "lat": -37.9500, "lon": 144.9200},
    {"name": "DANDENONG", "city": "Melbourne", "type": "city", "lat": -37.9870, "lon": 145.2150},
    {"name": "GEELONG", "city": "Melbourne", "type": "city", "lat": -38.1499, "lon": 144.3617},
    # --- Brisbane & Gold Coast ---
    {"name": "BRIS CBD", "city": "Brisbane", "type": "city", "lat": -27.4698, "lon": 153.0251},
    {"name": "MORETON BAY", "city": "Brisbane", "type": "bay", "lat": -27.3500, "lon": 153.2500},
    {"name": "SURFERS", "city": "Gold Coast", "type": "beach", "lat": -28.0028, "lon": 153.4295},
    # --- Perth ---
    {"name": "PERTH CBD", "city": "Perth", "type": "city", "lat": -31.9505, "lon": 115.8605},
    {"name": "FREMANTLE", "city": "Perth", "type": "port", "lat": -32.0569, "lon": 115.7439},
    {"name": "COTTESLOE", "city": "Perth", "type": "beach", "lat": -31.9950, "lon": 115.7530},
    # --- Auckland ---
    {"name": "AKL CBD", "city": "Auckland", "type": "city", "lat": -36.8485, "lon": 174.7633},
    {"name": "TAKAPUNA", "city": "Auckland", "type": "beach", "lat": -36.7880, "lon": 174.7730},
    {"name": "MANUKAU", "city": "Auckland", "type": "bay", "lat": -36.9920, "lon": 174.8780},
    # --- London Region ---
    {"name": "WESTMINSTER", "city": "London", "type": "landmark", "lat": 51.5007, "lon": -0.1246},
    {"name": "TOWER BRG", "city": "London", "type": "bridge", "lat": 51.5055, "lon": -0.0754},
    {"name": "CANARY WHARF", "city": "London", "type": "city", "lat": 51.5054, "lon": -0.0235},
    {"name": "GREENWICH", "city": "London", "type": "landmark", "lat": 51.4826, "lon": -0.0077},
    {"name": "WEMBLEY", "city": "London", "type": "landmark", "lat": 51.5560, "lon": -0.2795},
    {"name": "RICHMOND", "city": "London", "type": "city", "lat": 51.4613, "lon": -0.3037},
    {"name": "CROYDON", "city": "London", "type": "city", "lat": 51.3762, "lon": -0.0982},
    # --- New York Region ---
    {"name": "MANHATTAN", "city": "New York", "type": "city", "lat": 40.7831, "lon": -73.9712},
    {"name": "BROOKLYN", "city": "New York", "type": "city", "lat": 40.6782, "lon": -73.9442},
    {"name": "QUEENS", "city": "New York", "type": "city", "lat": 40.7282, "lon": -73.7949},
    {"name": "STATUE LIB", "city": "New York", "type": "landmark", "lat": 40.6892, "lon": -74.0445},
    {"name": "CENTRAL PK", "city": "New York", "type": "park", "lat": 40.7829, "lon": -73.9654},
    # --- Los Angeles Region ---
    {"name": "DOWNTOWN LA", "city": "Los Angeles", "type": "city", "lat": 34.0522, "lon": -118.2437},
    {"name": "SANTA MONICA", "city": "Los Angeles", "type": "beach", "lat": 34.0195, "lon": -118.4912},
    {"name": "HOLLYWOOD", "city": "Los Angeles", "type": "landmark", "lat": 34.0928, "lon": -118.3287},
    {"name": "LONG BEACH", "city": "Los Angeles", "type": "port", "lat": 33.7701, "lon": -118.1937},
    # --- San Francisco ---
    {"name": "GOLDEN GATE", "city": "San Francisco", "type": "bridge", "lat": 37.8199, "lon": -122.4783},
    {"name": "SF DOWNTOWN", "city": "San Francisco", "type": "city", "lat": 37.7749, "lon": -122.4194},
    {"name": "OAKLAND", "city": "San Francisco", "type": "city", "lat": 37.8044, "lon": -122.2712},
    # --- Paris ---
    {"name": "EIFFEL TWR", "city": "Paris", "type": "landmark", "lat": 48.8584, "lon": 2.2945},
    {"name": "LOUVRE", "city": "Paris", "type": "landmark", "lat": 48.8606, "lon": 2.3376},
    {"name": "NOTRE DAME", "city": "Paris", "type": "landmark", "lat": 48.8530, "lon": 2.3499},
    # --- Tokyo ---
    {"name": "SHIBUYA", "city": "Tokyo", "type": "city", "lat": 35.6580, "lon": 139.7016},
    {"name": "SHINJUKU", "city": "Tokyo", "type": "city", "lat": 35.6938, "lon": 139.7034},
    {"name": "TOKYO TWR", "city": "Tokyo", "type": "landmark", "lat": 35.6586, "lon": 139.7454},
    {"name": "GINZA", "city": "Tokyo", "type": "city", "lat": 35.6719, "lon": 139.7648},
    # --- Singapore ---
    {"name": "MARINA BAY", "city": "Singapore", "type": "landmark", "lat": 1.2847, "lon": 103.8610},
    {"name": "SENTOSA", "city": "Singapore", "type": "island", "lat": 1.2494, "lon": 103.8303},
]

def load_cached_geofences():
    if os.path.exists(CACHE_PATH):
        try:
            with open(CACHE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_cached_geofence(key, data):
    cache = load_cached_geofences()
    cache[key] = data
    try:
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
    except Exception:
        pass

def reverse_geocode_suburb(lat, lon):
    """Fallback reverse geocode via OpenStreetMap Nominatim for anywhere in the world."""
    url = f"https://nominatim.openstreetmap.org/reverse?lat={lat:.5f}&lon={lon:.5f}&format=json&zoom=14"
    req = urllib.request.Request(url, headers={"User-Agent": "KindlePlaneTracker/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            addr = data.get("address", {})
            suburb = addr.get("suburb") or addr.get("neighbourhood") or addr.get("village") or addr.get("town") or addr.get("borough")
            city = addr.get("city") or addr.get("municipality") or addr.get("county")
            return {
                "suburb": suburb,
                "city": city,
                "state": addr.get("state"),
                "country": addr.get("country")
            }
    except Exception:
        return None

def get_radar_features(home_lat, home_lon, radius_km):
    """
    Given any (home_lat, home_lon) and radius_km anywhere on Earth:
    1. Returns all airports within radius_km (with runway coordinates).
    2. Identifies the nearest primary commercial airport.
    3. Finds all curated landmarks within radius_km.
    4. Auto-discovers local suburb / city via Nominatim if not cached.
    """
    max_search_km = max(radius_km * 1.35, 30.0)

    # 1. Nearby Airports
    airports_in_range = []
    nearest_airport = None
    min_ap_dist = float("inf")

    for ap in GLOBAL_AIRPORTS:
        dist = haversine(home_lat, home_lon, ap["lat"], ap["lon"])
        brg = bearing(home_lat, home_lon, ap["lat"], ap["lon"])
        if dist < min_ap_dist:
            min_ap_dist = dist
            nearest_airport = {
                "iata": ap["iata"],
                "icao": ap["icao"],
                "name": ap["name"],
                "lat": ap["lat"],
                "lon": ap["lon"],
                "distanceKm": round(dist, 1),
                "bearingDeg": round(brg, 1)
            }
        if dist <= max_search_km:
            ap_copy = dict(ap)
            ap_copy["distanceKm"] = round(dist, 1)
            ap_copy["bearingDeg"] = round(brg, 1)
            airports_in_range.append(ap_copy)

    # Sort airports by distance
    airports_in_range.sort(key=lambda x: x["distanceKm"])

    # 2. Nearby Landmarks from Curated Global Set
    landmarks_in_range = []
    for lm in GLOBAL_LANDMARKS:
        dist = haversine(home_lat, home_lon, lm["lat"], lm["lon"])
        brg = bearing(home_lat, home_lon, lm["lat"], lm["lon"])
        if dist <= radius_km * 1.05:
            lm_copy = dict(lm)
            lm_copy["distanceKm"] = round(dist, 1)
            lm_copy["bearingDeg"] = round(brg, 1)
            landmarks_in_range.append(lm_copy)

    landmarks_in_range.sort(key=lambda x: x["distanceKm"])

    # 3. Dynamic Local Suburb / Town Discovery (for anywhere else in the world)
    cache_key = f"{round(home_lat, 3)}_{round(home_lon, 3)}"
    cached = load_cached_geofences().get(cache_key)

    if not cached:
        geo = reverse_geocode_suburb(home_lat, home_lon)
        if geo:
            cached = geo
            save_cached_geofence(cache_key, cached)

    local_suburb_name = cached.get("suburb") if cached else None
    local_city_name = cached.get("city") if cached else None

    # If home location has a discovered suburb, add it as a primary reference point if not duplicate
    if local_suburb_name:
        already_has = any(l["name"].upper() == local_suburb_name.upper() for l in landmarks_in_range)
        if not already_has:
            landmarks_in_range.insert(0, {
                "name": local_suburb_name.upper(),
                "city": local_city_name or "Local",
                "type": "home_area",
                "lat": home_lat,
                "lon": home_lon,
                "distanceKm": 0.0,
                "bearingDeg": 0.0
            })

    return {
        "homeLat": home_lat,
        "homeLon": home_lon,
        "radiusKm": radius_km,
        "nearestAirport": nearest_airport,
        "airports": airports_in_range,
        "landmarks": landmarks_in_range,
        "localArea": cached or {}
    }
