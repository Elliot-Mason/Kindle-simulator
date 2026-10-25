# Installed Kindle Apps

Drop or clone any standalone Kindle app repository into this directory to automatically mount it in the Kindle Simulator.

### Installing an App
```bash
git clone https://github.com/Elliot-Mason/Kindle-spotify.git spotify
git clone https://github.com/Elliot-Mason/Kindle-plane-radar.git plane
git clone https://github.com/Elliot-Mason/Kindle-sydney-trains.git trains
```

### Developing a New App
To test an app in development outside this directory, run the simulator with:
```bash
python server.py --app "/path/to/my-kindle-app"
```
Each app requires a `kindle-app.json` manifest at its root.
