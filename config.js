// radar sites can be found at https://www.weather.gov/nl2/NEXRADView

module.exports = {
	url: "https://nomads.ncep.noaa.gov/pub/data/nccf/radar/nexrad_level2/", // location to get data from
	sites: ["KMKX"], // sites to download
	listFileName: "dir.list", // name of file to poll
	dataDir: "data", // directory to write data to
	pollInterval: 60, // seconds between polls
	doublePollFileSize: false,
}

try{
	var configLocal = require("./config-local.js")
	for(var x in configLocal){
		module.exports[x] = configLocal[x]
	}
}catch(a){}

console.log(module.exports)
//https://nomads.ncep.noaa.gov/pub/data/nccf/radar/nexrad_level2/
//https://mesonet-nexrad.agron.iastate.edu/level2/raw/