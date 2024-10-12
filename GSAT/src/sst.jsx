import * as React from 'react';
import { useEffect, useState } from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import { useTimer } from 'react-timer-hook';
import { SUPPORTED_OUTPUT_LANGUAGES, SUPPORTED_INPUT_LANGUAGES } from './languages.js'
import { formatName, getExpirationTime, getLeasePrice, FmtNbrToStrP2, findProviderById } from './utils.js';
import { getPolygonGlmBalance, getPolygonMaticBalance, getHoleskyGlmBalance, getHoleskyEthBalance } from './wallet.js';
import { Copy, Play, Stop, Check } from 'react-bootstrap-icons';

let ssTimer = null;
let mutex_scanProviders = false;
let mutex_sstListener = false;
let checkBalancesInterval = null;

const MINUTE_IN_HOUR = 0.016666666;
const MAX_DOWNLOAD_TIME_IN_MINUTES = 20;
const MAX_DEPLOY_TIME_IN_MINUTES = 2;
const SLIDER_UNIT = 10;
const MIN_MATIC = 0.01;
const MIN_ETH = 0.001;
const myWallet = await window.electronAPI.yagnaAddress().then((res) => { return res; });
const network = await window.electronAPI.network().then((res) => { return res; });
const debug = await window.electronAPI.debug().then((res) => { return res; });
const onboardingUrl = 'https://glm.golem.network/#/onboarding/budget';

function scanProviders() {
	if(!mutex_scanProviders) {
		mutex_scanProviders = true;
		return window.electronAPI.scanProviders().then((res) => {
			mutex_scanProviders = false;
			return res;  
		});
	}
}

const Timer = ({seconds, minutes, hours, days}) => {
	return (
		<div className="fontx">
			<span className="blue">{days}</span><span><b>d</b></span> <span className="blue">{FmtNbrToStrP2(hours)}</span><span><b>h</b></span> <span className="blue">{FmtNbrToStrP2(minutes)}</span><span><b>mn</b></span> <span className="blue">{FmtNbrToStrP2(seconds)}</span><span><b>s</b></span>
		</div>
	);
}

const Language = ({ setLanguage, sstIsStarted, debug }) => {
	const handleLanguageChange = (event) => {
		setLanguage(event.target.value);
	};

	return (
		<Form.Select className="monospace blue" onChange={handleLanguageChange} disabled={sstIsStarted || debug} size="sm">
			{Object.entries(debug?{none: 'None (debug)'}:SUPPORTED_OUTPUT_LANGUAGES).map(([key, value]) => (
				<option value={key} key={key}>{value}</option>
			))}
		</Form.Select>
	);
}

const Slider = ({ sliderValue, setSliderValue, sstIsStarted, maxSliderValue, setMaxLeaseReached, noProvider }) => {
	const handleSliderChange = (e) => {
		let value = Number(Number(e.target.value).toFixed(2));
		if(value < maxSliderValue) {
			setSliderValue(value);
			setMaxLeaseReached(false);
		}
		else {
			setSliderValue(maxSliderValue);
			setMaxLeaseReached(true);
		}
	};

	useEffect(() => {
		if(sliderValue >= maxSliderValue) {
			setSliderValue(maxSliderValue);
			setMaxLeaseReached(true);
		}
		else
			setMaxLeaseReached(false);
	}, [maxSliderValue]);

	return (
		<Form.Range value={sliderValue} onChange={handleSliderChange} onClick={handleSliderChange} min={SLIDER_UNIT*MINUTE_IN_HOUR} max={24} step={SLIDER_UNIT*MINUTE_IN_HOUR} disabled={sstIsStarted || noProvider}/>
	);
}

const Provider = ({ provider, setProvider, pricedProviders, sstIsStarted }) => {
	const handleProviderIdChange = (event) => {
		let lprovider = findProviderById(pricedProviders, event.target.value)
		if(lprovider)
			setProvider(lprovider);
	};

	useEffect(() => {
		if((provider == undefined) && (pricedProviders.length > 0))
			setProvider(pricedProviders[0]);
	}, [pricedProviders]);

	return (
		<div>
			<Form.Select onChange={handleProviderIdChange} disabled={sstIsStarted} size="sm" className="blue">
				{pricedProviders.map((pricedprovider, index) => (
					<option value={pricedprovider.providerId} key={index}>{pricedprovider.providerDisplayName}{pricedprovider.priceWithoutDownload} GLM</option>
				))}
			</Form.Select>
		</div>
	);
}

export const Main = () => {
	const [displayStartupScreen, setDisplayStartupScreen] = useState(true);
	const [sstIsRunning, setSstIsRunning] = useState(false);
	const [sstIsStarted, setSstIsStarted] = useState(false);
	const [sstIsStopping, setSstIsStopping] = useState(false);
	const [providers, setProviders] = useState([]);
	const [provider, setProvider] = useState();
	const [allowProviderToDownloadImages, setAllowProviderToDownloadImages] = useState(false);
	const [downloadPrice, setDownloadPrice] = useState();
	const [messageDownloadPrice, setMessageDownloadPrice] = useState('Allow image download if needed');
	const [pricedProviders, setPricedProviders] = useState([]);
	const [sliderValue, setSliderValue] = useState(10*MINUTE_IN_HOUR);
	const { totalSeconds, seconds, minutes, hours, days, start, pause, restart } = useTimer({
		expiryTimestamp: getExpirationTime(10*MINUTE_IN_HOUR),
		autoStart: false,
		onExpire: () => {
			setStatus('Shutting down');
			setSstIsStopping(true);
		}
	});
	const [localLanguage, setLocalLanguage] = useState(debug?'none':'eng');
	const [remoteLanguage, setRemoteLanguage] = useState('eng');
	const [GlmBalance, setGlmBalance] = useState(0);
	const [mainTokenBalance, setMainTokenBalance] = useState(0);
	const [maxSliderValue, setMaxSliderValue] = useState();
	const [maxLeaseReached, setMaxLeaseReached] = useState(false);
	const [mainTokenFlag, setMainTokenFlag] = useState(false);
	const [status, setStatus] = useState('Scanning providers');
	const [showCO, setShowCO] = useState(false);
	const [showCW, setShowCW] = useState(false);

	function mainToken(cnetwork, amount) {
		if(cnetwork == network) {
			let lMainTokenBalance = Number(Number(amount).toFixed(2));
			setMainTokenBalance(lMainTokenBalance);
			if(lMainTokenBalance < ((cnetwork == network)?MIN_MATIC:MIN_ETH))
				setMainTokenFlag(true);
			else
				setMainTokenFlag(false);
		}
	}

	function glmBalance(cnetwork, amount) {
		if(cnetwork == network)
			setGlmBalance(Number(Number(amount).toFixed(2)));
	}

	function checkBalances() {
		if(network == 'holesky') {
			getHoleskyGlmBalance(myWallet).then((amount) => glmBalance('holesky', amount)).catch((e) => console.log(e));
			getHoleskyEthBalance(myWallet).then((amount) => mainToken('holesky', amount)).catch((e) => console.log(e));
		}
		else if(network == 'polygon') {
			getPolygonGlmBalance(myWallet).then((amount) => glmBalance('polygon', amount)).catch((e) => console.log(e));
			getPolygonMaticBalance(myWallet).then((amount) => mainToken('polygon', amount)).catch((e) => console.log(e));
		}
	}

	if(ssTimer == null)
		ssTimer = setTimeout(() => setDisplayStartupScreen(false), 4000);

	if(!checkBalancesInterval)
		checkBalancesInterval = setInterval(checkBalances, 1000);

	if(!mutex_sstListener) {
		mutex_sstListener = true;
		window.electronAPI.onSstMessage((data) => {
			if(data.msg == 'stopped') {
				setProviders([]);
				setSstIsRunning(false);
				setSstIsStarted(false);
				setSstIsStopping(false);
				setStatus('Signing agreement');
				restart(getExpirationTime(sliderValue), false);
			}
			else if(data.msg == 'ready') {
				setSstIsRunning(true);
				start();
			}
			else if(data.msg == 'agreementApproved')
				setStatus('Agreement approved');
			else if(data.msg == 'activityCreated')
				setStatus('Deploying ExeUnit');
			else if(data.msg == 'taskStarted')
				setStatus('Loading model');
			else if(data.msg == 'stopping') {
				setSstIsStopping(true);
				setStatus('Shutting down');
			}
		})
	}

	const scannedProviders = scanProviders();
	if((scannedProviders != undefined) && !sstIsStarted)
		scannedProviders.then((res) => setProviders(res));

	useEffect(() => {
		if(providers.length == 0)
			setStatus('Scanning providers');
	}, [providers]);

	useEffect(() => {
		if(!sstIsStarted) {
			let res = [];
			let ipad;
			providers.forEach((provider) => {
				if(allowProviderToDownloadImages || (!allowProviderToDownloadImages && provider.hasImageInCache)) {
					provider.priceWithDownload = getLeasePrice(totalSeconds + MAX_DOWNLOAD_TIME_IN_MINUTES*60 + MAX_DEPLOY_TIME_IN_MINUTES*60, provider.priceStart, provider.priceCpuPerHour, provider.priceEnvPerHour);
					provider.priceWithoutDownload = getLeasePrice(totalSeconds + MAX_DEPLOY_TIME_IN_MINUTES*60, provider.priceStart, provider.priceCpuPerHour, provider.priceEnvPerHour);
					(provider.priceWithoutDownload >= 10) ? ipad = 20 : ipad = 21;
					provider.providerDisplayName = formatName(provider.providerName, ipad);
					res.push(provider);
				}
			});
			res = res.sort((a, b) => (a.priceWithoutDownload - b.priceWithoutDownload || a.providerName.localeCompare(b.providerName)));
			setPricedProviders(res);
		}
	}, [providers, totalSeconds]);

	useEffect(() => {
		if(provider != undefined) {
			let lMaxSliderValue = Math.trunc(((GlmBalance - (allowProviderToDownloadImages?0:((provider.priceWithDownload - provider.priceWithoutDownload))) - provider.priceStart)/(provider.priceCpuPerHour + provider.priceEnvPerHour) - MAX_DEPLOY_TIME_IN_MINUTES*MINUTE_IN_HOUR)/(MINUTE_IN_HOUR*SLIDER_UNIT))*MINUTE_IN_HOUR*SLIDER_UNIT;
			setMaxSliderValue(lMaxSliderValue.toFixed(2));
		}
	}, [GlmBalance, provider]);

	useEffect(() => {
		restart(getExpirationTime(sliderValue), false);
	}, [sliderValue]);

	useEffect(() => {
		if(provider != undefined) {
			let ldownloadPrice = Number((provider.priceWithDownload - provider.priceWithoutDownload).toFixed(2));
			setDownloadPrice(ldownloadPrice);
		}
	}, [provider]);

	useEffect(() => {
		if(provider != undefined) {
			if(!provider.hasImageInCache)
				setMessageDownloadPrice(
					<div>
						<span>Allow image download if needed (</span>
						<span className="red">~20mn</span>,&nbsp; 
						<span className="red">+{downloadPrice} GLM</span>
						<span>)</span>
					</div>
				);
			else
				setMessageDownloadPrice(<div><span>Allow image download if needed</span></div>);	
		}
	}, [provider, downloadPrice]);

	const startSst = () => {
		setStatus('Signing agreement');
		setSstIsStarted(true);
		let startupTimeout = allowProviderToDownloadImages ? MAX_DEPLOY_TIME_IN_MINUTES : (MAX_DOWNLOAD_TIME_IN_MINUTES + MAX_DEPLOY_TIME_IN_MINUTES);
		window.electronAPI.sst(	startupTimeout,
                            totalSeconds/60,
                            provider.providerId,
                            provider.priceStart,
                            provider.priceCpuPerHour,
                            provider.priceEnvPerHour,
                            remoteLanguage,
                            localLanguage
		);
	}
	
	const stopSst = () => {
		window.electronAPI.sendMessagetoSst({dest: 'Sst', msg: 'stop'});
		pause();
		setSstIsStopping(true);
		setStatus('Shutting down');
	}

	const handleallowProviderToDownloadImagesChange = () => {
		setAllowProviderToDownloadImages(!allowProviderToDownloadImages);
		setProviders([]);
		setProvider();
		setMessageDownloadPrice('Allow image download if needed');
	};

	return (	
		<div className="main prevent-select">
			<img src="../img/gsat.png" alt="" width="350" height="350"/>
			{!displayStartupScreen?
				<div className="panel">
					<Row className="mx-0">
						<Col xl="6" className="px-0">
							<Card>
								<Card.Body>
									<Card.Title><b>Languages</b></Card.Title>
									<Form className="monospace fontsmall">
										<Form.Group as={Row} className="mb-3">
											<Form.Label column="true" xl={4}>Local</Form.Label>
											<Col column="true" xl={8}>
												<Language setLanguage={setLocalLanguage} sstIsStarted={sstIsStarted} debug={debug} />
											</Col>
										</Form.Group>
										<Form.Group as={Row} className="mb-3">
											<Form.Label column="true" xl={4}>Remote</Form.Label>
											<Col column="true" xl={8}>
												<Language setLanguage={setRemoteLanguage} sstIsStarted={sstIsStarted} />
											</Col>
										</Form.Group>
									</Form>
								</Card.Body>
							</Card>
						</Col>
						<Col xl="6" className="px-0">
							<Card>
								<Card.Body className="center monospace fontsmall">
									<Form>
										<Row>
											<Col xl="3" className="tar">
												<Button variant="dark" className="mx-2 px-1 py-0" onClick={startSst} disabled={sstIsStarted || (((providers.length != 0) && (provider != undefined))?((allowProviderToDownloadImages?provider.priceWithoutDownload:provider.priceWithDownload) > GlmBalance):true)}>
													<Play size={60}/>
												</Button>
											</Col>
											<Col xl="6" className="center">
												<div className="timer center">
													{((!sstIsStarted || sstIsRunning) && (providers.length != 0) && !sstIsStopping) ? (
														<Timer seconds={seconds} minutes={minutes} hours={hours} days={days} />
													) :
														<Col column="true" xl={12} className="center">
															<Col column="true" xl={2}>
																<Spinner animation="border" role="status" className="my-spinner-border"/>
															</Col>
															<Col column="true" xl={10}>
																<span className="my-status">{status}</span>
															</Col>
														</Col>
													}
												</div>
											</Col>
											<Col xl="3" className="tal">
												<Button variant="dark" className="mx-2 px-1 py-0" onClick={stopSst} disabled={!sstIsStarted || sstIsStopping}>
													<Stop size={60}/>
												</Button>
											</Col>
										</Row> 
									</Form>
								</Card.Body>
							</Card>
						</Col>
					</Row>
					<Row className="mx-0">
						<Col xl="6" className="px-0">
							<Card>
								<Card.Body>
									<Card.Title><b>Provider</b></Card.Title>
									<Form className="monospace fontsmall">
										<Form.Group as={Row} className="mb-3">
											<Form.Label column="true" xl={4}>Duration</Form.Label>
											<Col column="true" xl={8} className="center">
												<Slider sliderValue={sliderValue} setSliderValue={setSliderValue} sstIsStarted={sstIsStarted} maxSliderValue={maxSliderValue} setMaxLeaseReached={setMaxLeaseReached} noProvider={provider == undefined}/>
											</Col>
										</Form.Group>
										<Form.Group as={Row} className="mb-3">
											<Form.Label column="true" xl={4}>Name</Form.Label>
											<Col column="true" xl={8}>
												<Provider provider={provider} setProvider={setProvider} pricedProviders={pricedProviders} sstIsStarted={sstIsStarted} />
											</Col>
										</Form.Group>
										<Form.Group as={Row} className="mb-3">
											<Col column="true" xl={12}>
												<Form.Check type="checkbox" label={messageDownloadPrice} value={allowProviderToDownloadImages} onChange={handleallowProviderToDownloadImagesChange}/>
											</Col>	
										</Form.Group>
									</Form>
								</Card.Body>
							</Card>
						</Col>
						<Col xl="6" className="px-0">
							<Card>
								<Card.Body>
									<Card.Title><b>{(network == 'polygon')?'Polygon':'Ethereum'} Wallet</b></Card.Title>
									<Form className="monospace">
										<Form.Label column="true" xl={12}>
											<Form.Group as={Row}>
												<Col column="true" xl={10}>
													<Form.Text className="blue">{myWallet}</Form.Text>
												</Col>
												<Col column="true" xl={2}>
													<Button variant="secondary" className="mx-2 px-1 py-0" onClick={() => {
														navigator.clipboard.writeText(myWallet);
														setShowCW(true);
														setTimeout(() => setShowCW(false), 500);
													}}>
														{ showCW?<Check />:<Copy />}
													</Button>
												</Col>
											</Form.Group>
										</Form.Label>
										<Form.Group as={Row} className="row-no-margin">
												<Col column="true" xl={6} className="center borderg">
													<Form.Label column="true" xl={3}><b>GLM</b></Form.Label>
													<Col column="true" xl={3}>
														<Form.Text className={maxLeaseReached?"red":"blue"}>{GlmBalance}</Form.Text>
													</Col>
												</Col>
												<Col column="true" xl={6} className="center borderg">
													<Col column="true" xl={3}>
														<Form.Label column="true" xl={3} className="flex"><b>{(network == 'polygon')?'POL':'ETH'}</b></Form.Label>
													</Col>
													<Col column="true" xl={3}>
														<Form.Text className={mainTokenFlag?"red":"blue"}>{mainTokenBalance}</Form.Text>
													</Col>
												</Col>
										</Form.Group>
										<Form.Label column="true" xl={12}>
										<Form.Text className={(maxLeaseReached || mainTokenFlag)?"red":"black"}>Tokens can be easily purchased here:</Form.Text>
										<Form.Group as={Row}>
											<Col column="true" xl={10}>
												<Form.Text className="blue">{onboardingUrl}</Form.Text>
											</Col>
											<Col column="true" xl={2}>
												<Button variant="secondary" className="mx-2 px-1 py-0" onClick={() => {
													navigator.clipboard.writeText(onboardingUrl);
													setShowCO(true);
													setTimeout(() => setShowCO(false), 500);
												}}>
													{ showCO?<Check />:<Copy />}
												</Button>
											</Col>
										</Form.Group>
										</Form.Label>
									</Form>
								</Card.Body>
							</Card>
						</Col>
					</Row>
				</div>
			:
				<div className="panel monospace center lg">
					<Container className="px-0">
						<Row className="scr1 centerc mx-0">
							<Row className="mb-3 mx-0 px-0"><Form.Text className="fonty black center"><b>Golem System Audio Translator</b></Form.Text></Row>
							<Row className="mx-0 px-0"><Form.Text className="blue center"><b>Based on AI Meta's models Seamless Communication & Expressive.<br/>Runs on top of Golem Network.</b></Form.Text></Row>
						</Row>
						<Row className="scr2 centerd mx-0 ps-0">
							<Form.Text className="fontx centerb"><b>by Norbert Mauger</b></Form.Text>
						</Row>
					</Container>
				</div>
			}
		</div>	
	)
}
