import { Contract, JsonRpcProvider, formatUnits } from 'ethers';

const providerPolygon = new JsonRpcProvider("https://polygon-rpc.com", "any");
const providerEthereum = new JsonRpcProvider("https://ethereum-holesky-rpc.publicnode.com", "any");

const PolygonMaticTokenContract = new Contract(
	"0x0000000000000000000000000000000000001010",
	[
	  {
			"constant": true,
			"inputs": [
			  {
					"name": "_owner",
					"type": "address",
			  },
			],
			"name": "balanceOf",
			"outputs": [
			  {
					"name": "balance",
					"type": "uint256",
			  },
			],
			"payable": false,
			"stateMutability": "view",
			"type": "function",
	  },
	],
	providerPolygon
);

const PolygonGlmTokenContract = new Contract(
	"0x0B220b82F3eA3B7F6d9A1D8ab58930C064A2b5Bf",
	[
	  {
			"constant": true,
			"inputs": [
			  {
					"name": "_owner",
					"type": "address",
			  },
			],
			"name": "balanceOf",
			"outputs": [
			  {
					"name": "balance",
					"type": "uint256",
			  },
			],
			"payable": false,
			"stateMutability": "view",
			"type": "function",
	  },
	],
	providerPolygon
);

const HoleskyGlmTokenContract = new Contract(
	"0x8888888815bf4DB87e57B609A50f938311EEd068",
	[
	  {
			"constant": true,
			"inputs": [
			  {
					"name": "_owner",
					"type": "address",
			  },
			],
			"name": "balanceOf",
			"outputs": [
			  {
					"name": "balance",
					"type": "uint256",
			  },
			],
			"payable": false,
			"stateMutability": "view",
			"type": "function",
	  },
	],
	providerEthereum
);

export async function getPolygonGlmBalance(address) {
	return await formatUnits(await PolygonGlmTokenContract.balanceOf(address), 18);
}

export async function getPolygonMaticBalance(address) {
	return await formatUnits(await PolygonMaticTokenContract.balanceOf(address), 18);
}

export async function getHoleskyGlmBalance(address) {
	return await formatUnits(await HoleskyGlmTokenContract.balanceOf(address), 18);
}

export async function getHoleskyEthBalance(address) {
	return await formatUnits(await providerEthereum.getBalance(address), 18);
}
