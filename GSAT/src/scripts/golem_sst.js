const { register, addAsarToLookupPaths } = require('asar-node');

register();
addAsarToLookupPaths();

const { GolemNetwork, waitFor } = require("@golem-sdk/golem-js");
const { pinoLogger } = require("@golem-sdk/pino-logger");
const { parentPort, workerData, isMainThread } = require('worker_threads');
const path = require('node:path');
const os = require('os');
const fs = require('fs');

let streamerReady = false;
let isStopping = false;
let isExeReady = false;
let delay = 0;
let waitStreamerReadyInterval = null;
let checkStateInterval = null;
let timeoutSignal = null;

const controller = new AbortController();

const onTimeout = () => {
  if(!isExeReady) {
    isStopping = true;
    controller.abort('SIGINT received');
  }
}

function stop() {
  isStopping = true;
  if(timeoutSignal != null) {
    timeoutSignal.removeEventListener("abort", onTimeout);
    timeoutSignal = null;
    controller.abort('SIGINT received');
  }
}

parentPort.on("message", async (data) => {
	if(data.msg == 'stop')
    stop();
  else if(data.msg == 'streamerReady')
    streamerReady = true;
});

function waitStreamerReady(resolve) {
	if(streamerReady) {
    streamerReady = false;
		clearInterval(waitStreamerReadyInterval);
    waitStreamerReadyInterval = null;
		resolve();
	}
}

function checkState(resolve, timeoutMinutes, controller) {
	delay += 1;
	if(isStopping || (delay > timeoutMinutes*60)) {
		clearInterval(checkStateInterval);
    checkStateInterval = null;
		resolve();
	}
}

const allowProvidersById = (providerIds) => (proposal) => providerIds.includes(proposal.provider.id);

async function sst( gnetwork,
                    subnet,
                    startupTimeoutMinutes,
                    timeoutMinutes,
                    providerId,
                    maxStartPrice,
                    maxCpuPerHourPrice,
                    maxEnvPerHourPrice,
                    outputLanguage,
                    inputLanguage,
                    logLevel,
                    debug,
                    yagnaAppKey,
                    hfToken,
                    imageHash) {	
  let glm;
  let rental;
  let exe;
  let proxys = [];
  let ssh_proxy = null;

  let server1Ready = false;
  let server2Ready = false;

  const platform = os.platform();
  let VirtualPortOut = '';
  let VirtualPortIn = '';

  let portsToForward;
  if(debug)
    portsToForward = [8000];
  else
    portsToForward = [8000, 8001];

  if(!debug) {
    if(platform == 'linux') {
      VirtualPortOut = 'Golem_Virtual_Speaker';
      VirtualPortIn = 'Golem_Virtual_Microphone';
    }
    else if(platform == 'win32') {
      VirtualPortOut = 'CABLE Input';
      VirtualPortIn = 'CABLE Output';
    }
  }
  
  let logger = ['child', 'debug', 'info', 'warn', 'error'].includes(logLevel)?pinoLogger({level: logLevel}):(debug?pinoLogger({level: 'debug'}):null);

  timeoutSignal = AbortSignal.timeout(startupTimeoutMinutes*60*1000);
  timeoutSignal.addEventListener("abort", onTimeout);
  
  try {
    glm = new GolemNetwork({
      logger: logger,
      api: { key: yagnaAppKey },
      payment: {
        driver: 'erc20',
        network: gnetwork,
      }
    });     

    glm.market.events.on("agreementApproved", (event) => {
      if(!isStopping)
        parentPort.postMessage({dest: 'AppFront', msg: 'agreementApproved'});
    });

    glm.activity.events.on("activityCreated", (event) => {
      if(!isStopping)
        parentPort.postMessage({dest: 'AppFront', msg: 'activityCreated'});
    });

    glm.market.events.on("offerCounterProposalRejected", (event) => {
      if(!isStopping)
        stop();
    });

    await glm.connect();
    const network = await glm.createNetwork();

    let manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json")));
    manifest.payload[0].hash = `sha3:${imageHash}`;

    const order = {
      order: {
        demand: {
          workload: {
            manifest: Buffer.from(JSON.stringify(manifest)).toString("base64"),
            capabilities: ['vpn', '!exp:gpu'],
            runtime: { name: "vm-nvidia" }
          },
          subnetTag: subnet,
        },
        market: {
          rentHours: (startupTimeoutMinutes + timeoutMinutes)/60,
          pricing: {
            model: "linear",
            maxStartPrice: maxStartPrice,
            maxCpuPerHourPrice: maxCpuPerHourPrice,
            maxEnvPerHourPrice: maxEnvPerHourPrice,
          },
          offerProposalFilter: allowProvidersById([providerId])
        },
        network,
      },
      signalOrTimeout: controller.signal,
    };

    if(!isStopping)
      rental = await glm.oneOf(order);
    
    if(!isStopping)
      exe = await rental.getExeUnit(controller.signal);

    if(!isStopping) {
      isExeReady = true;
      timeoutSignal.removeEventListener("abort", onTimeout);
      parentPort.postMessage({dest: 'AppFront', msg: 'taskStarted'});
    }

    if(!isStopping) {
      if(debug) {
        const password= 'root';
        await exe.beginBatch()
        .run("ssh-keygen -A")
        .run(`echo '${password}\n${password}' | passwd`)
        .run("/usr/sbin/sshd")
        .end();
        ssh_proxy = exe.createTcpProxy(22);
        await ssh_proxy.listen(2222);
        console.log('SSH Provider is now ready: ssh root@127.0.0.1 -p 2222');
      }

      if(hfToken != 'none')
        await exe.run(`/root/download_expressive.sh ${hfToken}`);

      const server = await exe.runAndStream('(/root/start.sh 8000 > /tmp/log &) && (/root/start.sh 8001 > /tmp/log &) && tail -f /tmp/log');
      server.stderr.subscribe((data) => {
        if(data?.toString().includes("Uvicorn running on http://0.0.0.0:8000"))
          server1Ready = true;
        if(data?.toString().includes("Uvicorn running on http://0.0.0.0:8001"))
          server2Ready = true;
      });
      await waitFor(() => (server1Ready && server2Ready));
    }

    if(!isStopping) {
      const forwardPromises = portsToForward.map(async (port) => 
        new Promise(async (resolve) => {
          let proxy = exe.createTcpProxy(port);
          await proxy.listen(port);
          proxys.push(proxy);
          resolve();
        })
      );
      await Promise.all(forwardPromises);
    }
    
    if(!isStopping) {
      for(port of portsToForward) { 
        await new Promise(async (resolve) => {
          let url;
          if(port == 8000)
            url = `http://localhost:${port}/?roomID=BBCD&autoJoin&VirtualPort=${VirtualPortOut}&TargetLanguage=${outputLanguage}`;
          else
            url = `http://localhost:${port}/?roomID=CDBB&autoJoin&VirtualPort=${VirtualPortIn}&TargetLanguage=${inputLanguage}`;
          parentPort.postMessage({dest: 'AppBack', msg: 'startStreamer', url: url});
          await new Promise(async (resolve) => waitStreamerReadyInterval = setInterval(waitStreamerReady, 1000, resolve));
          resolve();
        })
      }
    }

    if(!isStopping) {
      parentPort.postMessage({dest: 'AppFront', msg: 'ready'});
      await new Promise(async (resolve) => checkStateInterval = setInterval(checkState, 1000, resolve, timeoutMinutes, controller));
    }

    // closing proxys can take lots of time (maybe because remaining data), so we close them async
    proxys.map((proxy) => proxy.close());

    if(ssh_proxy != null)
      ssh_proxy.close();

    await rental.stopAndFinalize();
  }
  catch (err) {
    console.error(err);
  } finally {
    await glm.disconnect();
  }

  if(timeoutSignal != null)
    timeoutSignal.removeEventListener("abort", onTimeout);

  if(checkStateInterval != null)
    clearInterval(checkStateInterval);

  parentPort.postMessage({dest: 'All', msg: 'stopped'});
}

if(!isMainThread)
	sst(workerData.network,
      workerData.subnet,
      workerData.startupTimeoutMinutes,
      workerData.timeoutMinutes,
      workerData.providerId,
      workerData.maxStartPrice,
      workerData.maxCpuPerHourPrice,
      workerData.maxEnvPerHourPrice,
      workerData.outputLanguage,
      workerData.inputLanguage,
      workerData.logLevel,
      workerData.debug,
      workerData.yagnaAppKey,
      workerData.hfToken,
      workerData.imageHash
	);
