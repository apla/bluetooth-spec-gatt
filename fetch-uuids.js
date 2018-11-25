import fs from 'fs';

import {promisify} from 'util';

const readFile = promisify (fs.readFile);

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
	tableRow (node) {

		const children = Array.from (node.childNodes).filter (n => n.nodeType === 1);

		const recordCode = children[1].textContent;

		const tableData = {
			title: children[0].textContent,
			code:  recordCode.replace (domainCodeRegexp, ''),
			id:    children[2].textContent,
		};

		return fetchEntity (recordCode).then (entityData => ({
			...tableData,
			...entityData
		}));
	},

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
	
	return Promise.all (Array.from (dataRowsParent.childNodes).filter (
		rowNode => rowNode.localName === 'tr'
	).map (parsers[sectionName] || parsers.tableRow));

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
	// console.log (dataString);

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

function decodeXMLFieldParam (node) {
	const paramName = node.localName.toLowerCase ();
	let   paramValue = node.textContent;
	if (paramName === 'unit' || paramName === 'reference') {
		paramValue = paramValue.replace (domainCodeRegexp, '');
	}
	if (paramName === 'enumerations') {
		paramValue = Array.from (node.childNodes).filter (
			n => n.nodeType === 1
		).reduce ((a, n) => {
			const eType = n.localName.toLowerCase();
			const eKey  = n.getAttribute ('key');
			const eVal  = n.getAttribute ('value');
			if (eType === 'reserved' || eType === 'reservedforfutureuse') {
				
				let reserved = [
					n.getAttribute ('start'),
					n.getAttribute ('end')
				];
				if (reserved[0] === reserved[1])
					reserved = [reserved[0]];
				a[eType] = a[eType] || [];
				a[eType].push (reserved.join ('-'));

			} else if (eType === 'enumeration') {
				if (eVal.toLowerCase () === 'reserved for future use') { // WHY???
					a.reservedforfutureuse = a.reservedforfutureuse || [];
					a.reservedforfutureuse.push (eKey);
				} else {
					a[eKey] = {
						value: eVal,
						description: n.getAttribute ('description'),
					}
				}
			}
			return a;
		}, {})
	}

	// http://schemas.bluetooth.org/Documents/bitfield.xsd
	if (paramName === 'bitfield') {
		// TODO: bitfield itself can be reserved?
		paramValue = Array.from (node.getElementsByTagName('Bit')).map (n => {
			const bitDescr = {
				offset: n.getAttribute ('index'),
				size:   n.getAttribute ('size'),
				name:   n.getAttribute ('name'),
				enumerations: null
			};
			// console.log (n.nodeType, n.localName);
			Array.from (n.childNodes).filter (c => c.nodeType === 1).forEach (c => {
				if (c.localName === 'Enumerations') {
					bitDescr.enumerations = decodeXMLFieldParam (c)[1];
				} else {
					console.log (c.localName);
				}
			})

			return bitDescr;
		})
	}

	return [paramName, paramValue];
}

function decodeXML (filename, node) {

	const fieldsNodes = Array.from (node.getElementsByTagName ('Field'));
	if (fieldsNodes.length) {
		//if (fieldsNodes.length > 1)
		//	console.log (filename + ": FIELD COUNT > 1", fieldsNodes.map (f => f.getAttribute ('name')).join (", "));
	} else {
		return {};
	}

	const fieldsData = [];

	fieldsNodes.forEach (fieldNode => {
		const fieldParams = {
			name: fieldNode.getAttribute ('name')
		};
		Array.from (fieldNode.childNodes).filter (
			n => n.nodeType === 1
		).forEach (n => {
			const [k, v] = decodeXMLFieldParam (n);
			fieldParams[k] = v;
		});
		fieldsData.push (fieldParams);
	})

	return {fields: fieldsData};

	// TODO
	// <InformativeText>
	//   <Abstract>Age of the User.</Abstract>
	//   <InformativeDisclaimer></InformativeDisclaimer>
	//   <Summary></Summary>
	//   <Examples>
	//     <Example>string</Example>

}

function singular (meta, name) {
	return meta.singular ? meta.singular : name.substr (0, name.length - 1);
}

const allIds = {};

function listToObject (name, list) {
	return list.reduce ((object, record) => {
		object[record.code] = record;
		allIds[record.id] = {
			scope: name,
			code:  record.code
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

	const uuidsFile = fs.createWriteStream ('uuid.js');

	Promise.all (allSectionQuery.map (sd => sd[1])).then (allSectionData => {
		const exportable = allSectionData.map ((sectionData, idx) => {
			const singularSectionName = allSectionQuery[idx][0];
			uuidsFile.write ('var ' + singularSectionName + ' = ');
			uuidsFile.write (JSON.stringify (listToObject(singularSectionName, sectionData), null, "\t"));
			uuidsFile.write (';\n\n');
			return singularSectionName;
		});

		uuidsFile.write ('var shortUUID = ');
		uuidsFile.write (JSON.stringify (allIds, null, "\t"));
		uuidsFile.write (';\n\n');

		uuidsFile.write ('module.exports = {\n\tshortUUID: shortUUID,\n\t');
		uuidsFile.write (exportable.map (_ => _ + ': ' + _).join (',\n\t'));
		uuidsFile.write ('\n};\n\n');

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

function fetchEntity (entityName) {
	const xmlApiUrl = "https://www.bluetooth.com/api/gatt/XmlFile?xmlFileName=";
	// https://www.bluetooth.com/api/gatt/XmlFile?xmlFileName=org.bluetooth.characteristic.aerobic_heart_rate_lower_limit.xml

	const withRedirectOptions = {
		follow: 5,
		follow_set_cookies: true,
		follow_set_referrer: true,
		output: 'cache/' + entityName + '.xml'
		// follow_if_same_host: true,
	};

	return readFile ('cache/' + entityName + '.xml').then (
		buffer => buffer, // ok, return file contents from buffer
		err => needle ('get', xmlApiUrl + entityName + '.xml', withRedirectOptions).then (
			res => res.body // otherwise fetch from network
		)
	).then (buffer =>
		parser.parseFromString (buffer.toString(), "text/xml")
	).then (doc => decodeXML (entityName, doc));
	

	return Promise.resolve ({});
}


fetchAll ();