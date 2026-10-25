import json
import os
import re
import sys
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_OUTPUT_PATH = os.path.join(BASE_DIR, "sydney_flights.json")
ORIGINAL_HEADER_PATH = r"C:\Users\Elliot\Documents\PlatformIO\Projects\TransportTracker - Plane\include\sydneyFlights.h"


def import_from_header(header_path=ORIGINAL_HEADER_PATH):
    """Parse StaticFlightRecord entries from the original C++ sydneyFlights.h header."""
    if not os.path.exists(header_path):
        print(f"Header file not found at: {header_path}")
        return {}

    pattern = re.compile(
        r'\{\s*"([^"]*)"\s*,\s*"((?:\\"|[^"])*)"\s*,\s*"((?:\\"|[^"])*)"\s*,\s*'
        r'"([^"]*)"\s*,\s*"((?:\\"|[^"])*)"\s*,\s*"([^"]*)"\s*,\s*'
        r'"([^"]*)"\s*,\s*"((?:\\"|[^"])*)"\s*,\s*"([^"]*)"\s*\}'
    )

    flights = {}
    with open(header_path, "r", encoding="utf-8") as f:
        for line in f:
            m = pattern.search(line)
            if m:
                callsign, airline, aircraft, dep_iata, dep_airport, dep_time, arr_iata, arr_airport, arr_time = [
                    s.replace('\\"', '"') for s in m.groups()
                ]
                flights[callsign] = {
                    "callsign": callsign,
                    "airline": airline,
                    "aircraftType": aircraft,
                    "depIATA": dep_iata,
                    "depAirport": dep_airport,
                    "depTime": dep_time,
                    "arrIATA": arr_iata,
                    "arrAirport": arr_airport,
                    "arrTime": arr_time,
                }

    with open(JSON_OUTPUT_PATH, "w", encoding="utf-8") as out:
        json.dump(flights, out, indent=2)
    print(f"Imported {len(flights)} flight records from {header_path} -> {JSON_OUTPUT_PATH}")
    return flights


def update_from_flightradar24():
    """Fetch fresh Sydney (YSSY) flight schedules from FlightRadar24 API."""
    try:
        from FlightRadarAPI import FlightRadar24API
    except ImportError:
        import subprocess
        print("FlightRadarAPI package not found. Installing now...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "FlightRadarAPI"])
        from FlightRadarAPI import FlightRadar24API

    def format_scheduled_time(time_utc, offset):
        if not time_utc:
            return "N/A"
        try:
            offset_val = offset if offset is not None else 0
            return datetime.utcfromtimestamp(time_utc + offset_val).strftime("%H:%M")
        except Exception:
            return "N/A"

    fr_api = FlightRadar24API()
    flights = {}

    if os.path.exists(JSON_OUTPUT_PATH):
        try:
            with open(JSON_OUTPUT_PATH, "r", encoding="utf-8") as f:
                flights = json.load(f)
        except Exception:
            flights = {}

    for page_num in range(1, 7):
        print(f"Fetching YSSY schedule details page {page_num}...")
        try:
            details = fr_api.get_airport_details("YSSY", page=page_num)
        except Exception as e:
            print(f"Error fetching page {page_num} from FlightRadar24: {e}")
            continue

        if "airport" not in details or "pluginData" not in details["airport"]:
            continue

        schedule = details["airport"]["pluginData"]["schedule"]

        for direction, is_arrival in [("arrivals", True), ("departures", False)]:
            items = schedule.get(direction, {}).get("data", [])
            print(f"Page {page_num}: Retrieved {len(items)} {direction}.")
            for item in items:
                flight = item.get("flight")
                if not flight:
                    continue
                identification = flight.get("identification", {})
                callsign = identification.get("callsign")

                if not callsign:
                    number_info = identification.get("number", {})
                    flight_num = number_info.get("default")
                    if flight_num:
                        airline_info = flight.get("airline") or {}
                        airline_code = airline_info.get("code") or {}
                        iata = airline_code.get("iata")
                        icao = airline_code.get("icao")
                        if iata and icao and flight_num.startswith(iata):
                            callsign = icao + flight_num[len(iata):]
                        else:
                            callsign = flight_num

                if not callsign:
                    continue

                airline = (flight.get("airline") or {}).get("name", "N/A")
                aircraft = ((flight.get("aircraft") or {}).get("model") or {}).get("code", "N/A")
                airports = flight.get("airport") or {}

                if is_arrival:
                    orig = airports.get("origin") or {}
                    dest = airports.get("destination") or {}
                    dep_iata = (orig.get("code") or {}).get("iata") or "N/A"
                    dep_name = orig.get("name") or "N/A"
                    dest_iata = (dest.get("code") or {}).get("iata") or "SYD"
                    dest_name = dest.get("name") or "Sydney Airport"
                else:
                    orig = airports.get("origin") or {}
                    dest = airports.get("destination") or {}
                    dep_iata = (orig.get("code") or {}).get("iata") or "SYD"
                    dep_name = orig.get("name") or "Sydney Airport"
                    dest_iata = (dest.get("code") or {}).get("iata") or "N/A"
                    dest_name = dest.get("name") or "N/A"

                time_info = flight.get("time") or {}
                sched = time_info.get("scheduled") or {}
                dep_offset = ((airports.get("origin") or {}).get("timezone") or {}).get("offset", 0)
                dest_offset = ((airports.get("destination") or {}).get("timezone") or {}).get("offset", 0)

                flights[callsign] = {
                    "callsign": callsign,
                    "airline": airline,
                    "aircraftType": aircraft,
                    "depIATA": dep_iata,
                    "depAirport": dep_name,
                    "depTime": format_scheduled_time(sched.get("departure"), dep_offset),
                    "arrIATA": dest_iata,
                    "arrAirport": dest_name,
                    "arrTime": format_scheduled_time(sched.get("arrival"), dest_offset),
                }

    sorted_flights = dict(sorted(flights.items(), key=lambda kv: kv[0]))
    with open(JSON_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted_flights, f, indent=2)
    print(f"Saved {len(sorted_flights)} unique flights to {JSON_OUTPUT_PATH}")


if __name__ == "__main__":
    if "--live" in sys.argv:
        update_from_flightradar24()
    else:
        flights = import_from_header()
        if not flights:
            update_from_flightradar24()
