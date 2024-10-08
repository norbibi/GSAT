export function formatName(name, n) {
	var formatedName;
	var nameLength = name.length;
	if(nameLength < n) {
		formatedName = name;
		for(let i=nameLength; i<n; i++)
			formatedName += "\xa0";
	} else {
		formatedName = name.substring(0, (n-3)/2);
		formatedName += "...";
		formatedName += name.substring(nameLength - (n-3)/2, nameLength);
	}
	formatedName += "\xa0";
	return formatedName;
}

export function getExpirationTime(hours) {
	const time = new Date();
	return time.setSeconds(time.getSeconds() + Math.round(hours*60)*60);
}

export function getLeasePrice(totalSeconds, priceStart, priceCpuPerHour, priceEnvPerHour) {
	const allTimeHours = totalSeconds/3600;
	const price = priceStart + allTimeHours*(priceCpuPerHour + priceEnvPerHour);
	return Number(price.toFixed(2));
}

export function FmtNbrToStrP2(number) {
	return number.toString().padStart(2, '0');
}

export function findProviderById(providers, providerId) {
	return providers.find(provider => provider.providerId === providerId);
}
