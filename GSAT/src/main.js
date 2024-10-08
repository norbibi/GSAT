const { register, addAsarToLookupPaths } = require('asar-node');

register();
addAsarToLookupPaths();

const { app, BrowserWindow, ipcMain, session } = require('electron');
const { Worker } = require("worker_threads");
const { exec, execSync, spawn } = require('node:child_process');
const { exit } = require('node:process');
const pie = require("puppeteer-in-electron");
const puppeteer = require("puppeteer-core");
const path = require('node:path');
const os = require('os');

const rootPath = app.isPackaged?process.resourcesPath:path.join(__dirname, '/../../src');
const debug = app.commandLine.hasSwitch("dbg");
const network = app.commandLine.getSwitchValue("network")?app.commandLine.getSwitchValue("network"):'polygon';
const subnet = app.commandLine.getSwitchValue("subnet")?app.commandLine.getSwitchValue("subnet"):'public';
const logLevel = app.commandLine.getSwitchValue("logLevel")?app.commandLine.getSwitchValue("logLevel"):'none';
const hfToken = app.commandLine.getSwitchValue("hfToken")?app.commandLine.getSwitchValue("hfToken"):(process.env.HF_TOKEN?process.env.HF_TOKEN:'none');

const selectorStart = '#startStreaming';
const selectorStop = '#stopStreaming';

const imageHash = "1db0f8ad1366e9eed7b1d352a23efa7bbdc2449d08b00600d98e5dbc";

let yagnaAddress;
let yagnaAppKey;
let browser;
let mainWindow;
let sstWorker;
let isRunning = false;
let childBrowsers = [];

function check(e, cb) {
	if(e.error || e.stderr)
		return e;
	else
		return cb(); 
}

function checkPattern(e, pattern, cb) {
	if(e.error || e.stderr)
		return e;
	else if(!e.stdout.includes(pattern))
		return cb();
	else
		return {error: null, stderr: null, stdout: null};
}

function ExePromise(cmd) {
	return new Promise(async (resolve) => exec(cmd, (error, stdout, stderr) => resolve({error: error, stdout: stdout, stderr: stderr})));
}

async function configureLinuxAudio() {
	await ExePromise('pactl list')
	.then((e) => { return checkPattern(	e, "Golem_Virtual_Speaker",
		() => ExePromise('pactl load-module module-null-sink sink_name=golem_virtual_speaker sink_properties=device.description=Golem_Virtual_Speaker'));})
	.then((e) => check(e, () => ExePromise('pactl list')))
	.then((e) => { return checkPattern(e, "Golem_Microphone",
		() => ExePromise('pactl load-module module-remap-source master=golem_virtual_speaker.monitor source_name=golem_virtual_speaker source_properties=device.description=Golem_Microphone'));})
	.then((e) => check(e, () => ExePromise('pactl list')))
	.then((e) => { return checkPattern(e, "Golem_Speaker",
		() => ExePromise('pactl load-module module-null-sink sink_name=golem_speaker sink_properties=device.description=Golem_Speaker'));})
	.then((e) => check(e, () => ExePromise('pactl list')))
	.then((e) => { return checkPattern(e, "Golem_Virtual_Microphone",
		() => ExePromise('pactl load-module module-remap-source master=golem_speaker.monitor source_name=golem_speaker source_properties=device.description=Golem_Virtual_Microphone'));})
	.then((e) => {
		if(e.error) {
			console.log(e.error);
			exit();
		}
		else if(e.stderr) {
			console.log(e.stderr);
			exit();
		}
	});
}

async function scanProviders() {
	const myScanWorkerData = {
		network: network,
		subnet: subnet,
		timeoutSecond: 10,
		minCpuThreads: 8,
		minMemGib: 8,
		minStorageGib: 10,
		minGpuMemGib: 16,
		yagnaAppKey: yagnaAppKey,
		imageHash
	};

	return new Promise(function (resolve, reject) {
		const scanWorker = new Worker(path.join(rootPath, '/scripts', 'golem_scan.js'), {workerData: myScanWorkerData});
		scanWorker.on("message", (data) => resolve(data));
	});
}

async function runSst(startupTimeoutMinutes,
											timeoutMinutes,
											providerId,
											maxStartPrice,
											maxCpuPerHourPrice,
											maxEnvPerHourPrice,
											outputLanguage,
											inputLanguage) {

	const mySstWorkerData = {
		network: network,
		subnet: subnet,
		startupTimeoutMinutes: startupTimeoutMinutes,
		timeoutMinutes: timeoutMinutes,
		providerId: providerId,
		maxStartPrice: maxStartPrice,
		maxCpuPerHourPrice: maxCpuPerHourPrice,
		maxEnvPerHourPrice: maxEnvPerHourPrice,
		outputLanguage: outputLanguage,
		inputLanguage: inputLanguage,
		logLevel: logLevel,
		debug: debug,
		yagnaAppKey: yagnaAppKey,
		hfToken: hfToken,
		imageHash
	};

	isRunning = true;
	sstWorker = new Worker(path.join(rootPath, '/scripts','golem_sst.js'), {workerData: mySstWorkerData});
	sstWorker.on("message", (data) => {
		if(['AppFront', 'All'].includes(data.dest))
			mainWindow.webContents.send('sst:message', data);
		if(data.msg == 'stopped') {
			for(childBrowser of childBrowsers)
				childBrowser.close();
			childBrowsers = [];
			isRunning = false;
		}
		else if(data.msg == 'startStreamer')
			startStreamer(data.url);
	});
}

function startStreamer(url) {
	let childBrowser = new BrowserWindow({ parent: browser, show: debug, frame: false });
	if(debug)
		childBrowser.webContents.openDevTools();
	childBrowsers.push(childBrowser);
	childBrowser.loadURL(url).then(() => {
		return pie.getPage(browser, childBrowser);
	}).then((res) => {
		page = res;
		return page.waitForSelector(selectorStart)
	}).then(() => {return page.click(selectorStart)
	}).then(() => {return page.waitForSelector(selectorStop)
	}).then(() => {sstWorker.postMessage({dest: 'Sst', msg: 'streamerReady'})
	});
}

const createWindow = () => {
	mainWindow = new BrowserWindow({
		width: debug?2000:1352,
		height: debug?700:350,
		useContentSize: true,
		icon: path.join(rootPath, '/img','gsat.png'),
		webPreferences: {
			preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
			nodeIntegrationInWorker: true
		},
	});

	mainWindow.on('close', async (e) => {
		e.preventDefault();
		if(isRunning == true) {
			mainWindow.webContents.send('sst:message', {dest: 'AppFront', msg: 'stopping'});
			sstWorker.postMessage({dest: 'Sst', msg: 'stop'});
		}
		while(isRunning == true)
			await new Promise((res) => setTimeout(res, 1000));
		mainWindow.destroy();
	});

	mainWindow.removeMenu();
	mainWindow.setResizable(debug);
	mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

	if(debug)
		mainWindow.webContents.openDevTools();
};

if(os.platform() == 'linux')
	configureLinuxAudio();

pie.initialize(app).then(() => {
	return pie.connect(app, puppeteer);
}).then((value) => {
	browser = value;
	return new Promise((resolve, reject) => {
		let ra = spawn('yagna', ['id', 'show', '--json']);
		ra.on('error', (err) => {
			console.log('Please install Yagna and add it to your path');
			exit();
		});
		ra.stderr.on('data', (data) => {
			if(data.toString().includes("routing error: Connecting GSB")) {
				console.log('Please start Yagna');
				exit();
			}
		});
		ra.stdout.on('data', (data) => resolve(data.toString()));
	});
}).then((value) => {
	yagnaAddress = JSON.parse(value)['Ok']['nodeId'];
	return new Promise((resolve, reject) => {
		let rk = spawn('yagna', ['app-key', 'list', '--json']);
		rk.stdout.on('data', (data) => resolve(data.toString()));
	});
}).then((value) => {
	let yagnaAppKeys = JSON.parse(value);
	if(yagnaAppKeys.length == 0) {
		console.log('Please create an app-key with command: yagna app-key create');
		exit();
	}
	yagnaAppKey = yagnaAppKeys[0]['key'];
	execSync('yagna payment release-allocations');

	app.whenReady().then(() => {
		session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
			callback({
				responseHeaders: {
					...details.responseHeaders,
					'Content-Security-Policy': ['script-src \'self\' \'unsafe-eval\'']
				}
			})
		});

		ipcMain.handle('providers:scan', async (event, ...args) => scanProviders(...args));
		ipcMain.handle('provider:sst', async (event, ...args) => runSst(...args));
		ipcMain.on('sst:sendmessage', (_event, value) => sstWorker.postMessage(value));
		ipcMain.handle('network', () => { return network});
		ipcMain.handle('yagnaAddress', () => { return yagnaAddress});
		ipcMain.handle('debug', () => { return debug});

		createWindow();

		app.on('activate', () => {
			if(BrowserWindow.getAllWindows().length === 0)
				createWindow();
		});
	});

	app.on('window-all-closed', async () => {
		if(process.platform !== 'darwin')
			app.quit();
	});
});
