//@ts-check
var config = require("./config")
var axios = require("axios").default
axios.defaults.adapter = require('axios/lib/adapters/http')
var fsPromises = require("fs").promises
var fs = require("fs")
var path = require("path")

/**
 * 
 * @param {string[]} urlParts
 * @returns {string}
 */
function joinURL(urlParts){
	var url = ""
	for(var x in urlParts){
		if(url){
			if(url[url.length-1]!="/"){
				url += "/"
			}
			url = (new URL(urlParts[x],url)).href
		}else{
			//console.log(urlParts[x])
			url = (new URL(urlParts[x])).href
		}
		
	}
	return url
}

/**
 * 
 * @param {Number} milliseconds
 * @returns {Promise<void>}
 */
function sleep(milliseconds){
	return new Promise((resolve) => {
		setTimeout(resolve,milliseconds)
	})
}


function eventAwait(emitter,event){
	return new Promise((resolve,reject)=>{
		emitter.once(event,resolve)
		emitter.once("error",reject)
	})
}


var actions = []
globalThis.actions = actions
async function executeActions(){
	
	// var testLoc = 15000
	// var testReq = await axios.request({
	// 	url:"https://nomads.ncep.noaa.gov/pub/data/nccf/radar/nexrad_level2/KMKX/",
	// 	responseType:"stream",
	// 	headers:{
	// 		"Range": "bytes="+testLoc+"-"+(testLoc+100)
	// 	}
	// })
	// if(!testReq.headers["content-range"]){
	// 	throw new Error("response missing content-range")
	// }
	// var testStats = null
	// try{
	// 	testStats = await fsPromises.stat("test.txt")
	// }catch(a){}
	// var testFileWriter = fs.createWriteStream("test.txt",{
	// 	flags: (testStats)?"r+":"w+",
	// 	start: testLoc
	// })
	// testReq.data.pipe(testFileWriter)
	// await eventAwait(testFileWriter,"close")
	
	while(true){
		if(actions.length > 0){
			try{
				let action = actions.shift()
				if(action.action == "downloadFile"){
					let filepath = action.path
					let fileURL = action.url
					console.log("downloading "+filepath)
					/**@type {fs.Stats} */
					let stats = null
					try{
						stats = await fsPromises.stat(filepath)
					}catch(a){}
					let offset = 0
					if(stats){
						offset = stats.size
					}else{
						await fsPromises.mkdir(path.dirname(filepath),{recursive:true})
					}
					let req = await axios.request({
						url:fileURL,
						responseType:"stream",
						headers:{
							"Range": "bytes="+offset+"-"
						},
						timeout: Math.min(10000, config.pollInterval * 1000),
					})
					if(req.status != 206 && !(req.status == 200 && offset == 0)){
						//console.log(offset)
						//var size = 0
						//req.data.on("data",(data)=>size+=data.length)
						//await sleep(1000)
						//console.log(size)
						req.data.destroy()
						// The server can sometimes return a 200 status code. 
						// The connection is still destroyed because a 200 entails downloading all the data we currently have and very likely nothing new.
						if(req.status == 200){
							throw new Error("server returned status code 200, should be 206 for partial downloads")
						}
						throw new Error("bad response status code " + req.status)
					}
					if(!req.headers["content-range"] && offset != 0){
						req.data.destroy()
						throw new Error("response missing content-range")
					}
					let fileWriter = fs.createWriteStream(filepath,{
						flags: (stats)?"r+":"w+",
						start: offset
					})
					req.data.pipe(fileWriter)
					req.data.on("error",async (e)=>{
						if(e && e.stack){
							console.error("Connection " + e.stack)
						}else if(e){
							console.error(e)
						}
						await sleep(100)
						// end event is never fired, fileWriter needs to be closed manually
						fileWriter.close()
					})
					
					if(fileWriter.writable && req.data.readable){
						await eventAwait(fileWriter,"close")
					}else{
						// this can probably never happen but it is here to be safe
						await sleep(100)
						fileWriter.close()
					}
					fileWriter.close()
					console.log("downloaded "+fileWriter.bytesWritten+" bytes ("+req.headers["content-range"]+")")
				}
			}catch(e){
				if(e && e.stack){
					console.error(e.stack)
				}else if(e){
					console.error(e)
				}
				await sleep(1000)
			}
			await sleep(10)
		}else{
			await sleep(100)
		}
		
	}
}

async function polling(){
	while(true){
		try{
			console.log("polling")
			let pendingActions = []
			for(let si in config.sites){
				let site = config.sites[si]
				let listReq = await axios.request({
					url: joinURL([config.url,site,config.listFileName]),
					responseType: "text",
					timeout: Math.min(10000, config.pollInterval * 1000)
				})
				let filesRaw = listReq.data.split("\n")
				let files = []
				for(let x in filesRaw){
					let str = filesRaw[x]
					let spaceLocation = str.indexOf(" ")
					let size = parseInt(str.substring(0,spaceLocation))
					let name = str.substring(spaceLocation+1)
					if(name == ""){
						continue
					}
					files.push({
						name: name,
						size: size,
						url: joinURL([config.url,site,name]),
					})
				}
				for(let x in files){
					let file = files[x]
					let filePath = path.join(config.dataDir,site,file.name)
					filePath = filePath.split(".")[0]
					let currentSize = 0
					/**@type {fs.Stats} */
					let stats = null
					try{
						stats = await fsPromises.stat(filePath)
					}catch(a){}
					if(stats){
						currentSize = stats.size
					}
					if(config.doublePollFileSize && parseInt(x) == files.length - 1){
						try{
							let lastFileHead = await axios.head(file.url, {
								responseType: "text",
								timeout: Math.min(5000, config.pollInterval * 1000),
							})
							//console.log(lastFileHead.headers["content-length"], file.size)
							if(lastFileHead.headers["content-length"]){
								file.size = parseInt(lastFileHead.headers["content-length"])
							}
						}catch(a){
							console.error(a)
						}
					}
					if(currentSize < file.size){
						pendingActions.push({
							action: "downloadFile",
							url: file.url,
							path: filePath
						})
					}
				}
			}
			for(let x in pendingActions){
				let isNew = true
				for(let y in actions){
					if(pendingActions[x].path == actions[y].path){
						isNew = false
						break
					}
				}
				if(isNew){
					actions.push(pendingActions[x])
				}
			}
			console.log("finished polling, "+actions.length+" actions in queue")
		}catch(e){
			if(e && e.stack){
				console.error(e.stack)
			}else{
				console.error(e)
			}
			await sleep(1000)
		}
		await sleep(config.pollInterval * 1000)
	}
	console.log("exited poling")
}


executeActions()
polling()

//url:"https://nomads.ncep.noaa.gov/pub/data/nccf/radar/nexrad_level2/KMKX/",
//actions.push({action:"downloadFile",url:"https://example.com/",path:"test.html"})