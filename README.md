# Radar Data Downloader
This is a small utility to grab the latest NEXRAD radar data.

## Running
If you are on windows you can download and extract the [release](https://github.com/JordanSchlick/radar-data/releases/latest) windows zip and skip to step 5  
1. Download this repository
2. Install node.js from https://nodejs.org/en/
3. Run `npm install` inside the unpacked radar-data repository
4. Replace the 4 letter site in `config.js` with the one you are interested in
5. Launch with `node main.js` or by `start.bat` on Windows
6. The radar files will be downloaded into the data directory