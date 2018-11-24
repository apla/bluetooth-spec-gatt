import fs from 'fs';

import needle from 'needle';

import {DOMParser} from 'xmldom';

const parser = new DOMParser ();

// after finishing, found similar tool
// https://github.com/bluekitchen/btstack/blob/master/tool/convert_gatt_service.py

// https://www.bluetooth.com/specifications/assigned-numbers/service-discovery
const baseUUID = '00000000-0000-1000-8000-00805F9B34FB';

const baseUri = 'https://www.bluetooth.com/specifications/';

const sections = {
	units: {
		path: 'assigned-numbers/units',
		tableId: 'DataTables_Table_0',
		type: 'jsdatatable'
	},
	characteristics: {
		path: 'gatt/characteristics',
		tableId: 'gattTable',
		type: 'htmltable'
	},
	descriptors: {
		path: 'gatt/descriptors',
		tableId: 'gattTable',
		type: 'htmltable'
	},
	services: {
		path: 'gatt/services',
		tableId: 'gattTable',
		type: 'htmltable'
	},
	// '',
	// ''
};

const domainCodeRegexp = /^org\.bluetooth\.\w+\./;

const parsers = {
	default (node) {
		return {
			title: node.childNodes[1].textContent,
			code:  node.childNodes[3].textContent.replace (domainCodeRegexp, ''),
			id:    node.childNodes[5].textContent,
		}
	},

}

function fetchEntity () {
	// https://www.bluetooth.com/api/gatt/XmlFile?xmlFileName=org.bluetooth.characteristic.aerobic_heart_rate_lower_limit.xml
}

function decodeHTMLTable ({doc, res, body, sectionName, sectionMeta}) {

	const tables = Array.from (doc.getElementsByTagName ('table'));

	if (tables.length === 0)
		console.log (res.statusCode, res.headers);
	
	const dataTable = tables.filter (
		table => table.getAttribute ('id') === sectionMeta.tableId
	)[0];

	if (!dataTable) {
		console.log (body);
	}

	const dataRowsParent = dataTable.getElementsByTagName ('tbody')[0];
	
	return Array.from (dataRowsParent.childNodes).filter (
		rowNode => rowNode.localName === 'tr'
	).map (parsers[sectionName] || parsers.default);

}

function decodeJSDataTable ({doc, res, body, sectionName, sectionMeta}) {

	const scripts = Array.from (doc.getElementsByTagName ('script'));

	if (scripts.length === 0)
		console.log (res.statusCode, res.headers);
	
	const dataTable = scripts.filter (
		scriptEl => scriptEl.textContent.match ('DataTable')
	)[0];

	if (!dataTable) {
		console.log (body);
	}

	const dataString = dataTable.textContent.split (/\r?\n/).filter (str => str.match (/^\s*data:\s*/))[0];
	console.log (dataString);

	let rows;

	try {
		rows = JSON.parse (dataString.replace (/^\s*data:\s*(.*),\s*$/, "$1"))
	} catch (err) {
		console.error ("Cannot parse DataTable", err);
	}

	return rows.map (row => ({
		id:    row[0],
		title: row[1],
		code:  row[2].replace (domainCodeRegexp, ''),
	}))

}

function singular (meta, name) {
	return meta.singular ? meta.singular : name.substr (0, name.length - 1);
}

const allIds = {};

function listToObject (name, list) {
	return list.reduce ((object, record) => {
		object[record.code] = record;
		allIds[record.id] = {
			...record,
			code: name + '.' + record.code
		};
		return object;
	}, {})
}

function fetchAll () {
	const allSectionQuery = Object.keys (sections).map (sectionName => {
		const sectionMeta = sections[sectionName];
		return [singular (sectionMeta, sectionName), fetchSection (sectionMeta.path).then (({res, body, doc}) => {
			
			if (sectionMeta.type === 'htmltable') {
				return decodeHTMLTable ({doc, res, body, sectionName, sectionMeta})
			} else if (sectionMeta.type === 'jsdatatable') {
				return decodeJSDataTable ({doc, res, body, sectionName, sectionMeta})
			}
			
		})];
	})

	const uuidsFile = fs.createWriteStream ('uuids.js');

	Promise.all (allSectionQuery.map (sd => sd[1])).then (allSectionData => {
		allSectionData.forEach ((sectionData, idx) => {
			const singularSectionName = allSectionQuery[idx][0];
			uuidsFile.write ('const ' + singularSectionName + ' = ');
			uuidsFile.write (JSON.stringify (listToObject(singularSectionName, sectionData), null, "\t"));
			uuidsFile.write (';\n\n');
		})
	});
}

function fetchSection (sectionPath) {
	const withRedirectOptions = {
		follow: 5,
		follow_set_cookies: true,
		follow_set_referrer: true,
		// follow_if_same_host: true,
	};

	return needle ('get', baseUri + sectionPath, withRedirectOptions).then (
		res => ({
			res,
			body: res.body,
			doc: parser.parseFromString (res.body, "text/html")
		})
	)
}



fetchAll ();