const { register, addAsarToLookupPaths } = require('asar-node');

register();
addAsarToLookupPaths();

const { GolemNetwork } = require('@golem-sdk/golem-js');
const { takeUntil, timer, toArray } = require('rxjs');
const { parentPort, workerData, isMainThread } = require('worker_threads');

function getGpuMemory(offer) {
	return offer.properties["golem.!exp.gap-35.v1.inf.gpu.d0.memory.total.gib"]?offer.properties["golem.!exp.gap-35.v1.inf.gpu.d0.memory.total.gib"]:offer.properties["golem.!exp.gap-35.v1.inf.gpu.memory.total.gib"];
}

function getGpuModel(offer) {
	return offer.properties["golem.!exp.gap-35.v1.inf.gpu.d0.model"]?offer.properties["golem.!exp.gap-35.v1.inf.gpu.d0.model"]:offer.properties["golem.!exp.gap-35.v1.inf.gpu.model"];
}

async function scan(network, subnet, timeoutSecond, minCpuThreads, minMemGib, minStorageGib, minGpuMemGib, yagnaAppKey, imageHash) {
	const glm = new GolemNetwork({
    api: {
    	key: yagnaAppKey,
			url: 'http://127.0.0.1:7465'
		}
	});

	try {
		await glm.connect();
	} catch (e) {
		console.error("Failed to connect to Yagna, check if Yagna is running and the --yagna-url and --yagna-appkey are correct");
		return;
	}

	const scanOptions = {
		workload: {
			capabilities: ['vpn', '!exp:gpu'],
			runtime: { name: "vm-nvidia" },
			minCpuThreads: minCpuThreads,
			minMemGib: minMemGib,
			minStorageGib: minStorageGib
		},
		payment: {
			network: network,
			driver: 'erc20',
		},
		subnetTag: subnet
	};

	const scanSpecification = glm.market.buildScanSpecification(scanOptions);

	glm.market
		.scan(scanSpecification)
		.pipe(
      takeUntil(timer(timeoutSecond * 1000)),
      toArray(),
		)
    .subscribe({
      next: async (offersFound) => {
        const displayProposals = (await Promise.all(
          offersFound.map(async (offer) => {
            const gpuMemory = getGpuMemory(offer);
            return fetch(`https://api.stats.golem.network/v2/provider/node/${offer.provider.id}`)
            .then((response) => {return response.json()})
            .then(function(json) {
              const decision = ((json[0].online) && !(json[0].computing_now) && (gpuMemory > minGpuMemGib))
              if(decision) {
                const providerName = offer.provider.name;
                const providerId = offer.provider.id;
                const memoryGib = offer.memoryGib;
                const cpuThreads = offer.cpuThreads;
                const storageGib = offer.storageGib;
                const gpuModel = getGpuModel(offer);
                const gpuMemory = getGpuMemory(offer);
                const priceStart = offer.pricing.start;
                const priceCpuPerHour = offer.pricing.cpuSec * 3600;
                const priceEnvPerHour = offer.pricing.envSec * 3600;

                return {
                  providerName: providerName,
                  providerId: providerId,
                  priceStart: priceStart,
                  priceCpuPerHour: priceCpuPerHour,
                  priceEnvPerHour: priceEnvPerHour,
                  memoryGib: memoryGib,
                  cpuThreads: cpuThreads,
                  storageGib: storageGib,
                  gpuModel: gpuModel,
                  gpuMemory: gpuMemory
                }
              }
            })
            .catch((e) => {return null})
          })
        ))
        .filter(item => item);
        parentPort.postMessage(displayProposals);
      },
      complete: () => {glm.disconnect()},
      error: (e) => {
        console.error(e);
        glm.disconnect();
      }
    }
	);
}

if(!isMainThread)
	scan(	workerData.network,
			workerData.subnet,
			workerData.timeoutSecond,
			workerData.minCpuThreads,
			workerData.minMemGib,
			workerData.minStorageGib,
			workerData.minGpuMemGib,
			workerData.yagnaAppKey,
			workerData.imageHash
	);
