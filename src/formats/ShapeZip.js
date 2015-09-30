(function() {

	if (!L.drawLocal.draw.toolbar.imports.shapeZip) {
		L.drawLocal.draw.toolbar.imports.shapeZip = {
			text: 'Import a shapefile zip',
			title: 'Please, select a zip file.'
		};
	}

	ShpZipFormat = {
		next: 1,
		callbacks: {},

		createOpenButton: function() {
			var link = L.DomUtil.create('a');

			link.href = '#';
			link.style.position = 'relative';
			link.innerHTML = L.drawLocal.draw.toolbar.imports.shapeZip.text;
			link.title = L.drawLocal.draw.toolbar.imports.shapeZip.title;

			var input = L.DomUtil.create('input', 'leaflet-draw-draw-imports-action', link);
			input.type = 'file';

			input.onchange = function() {
				ShpZipFormat.openShapeZip.call(this, input);
			}.bind(this);

			return link;
		},

		parse: function(byteArray, callback) {
			var worker = this.getWorker();
			var id = this.next++;

			this.callbacks[id] = callback;
			worker.postMessage({id: id, byteArray: byteArray}, [byteArray]);
		},

		onmessage: function(e) {
			var callback = this.callbacks[e.data.id];

			if (callback) {
				delete this.callbacks[e.data.id];
				callback(e.data.geoJSON);
			}
		},

		openShapeZip: function(input) {
			if (!input.files && !input.files[0])
				return;

			var reader = new FileReader();

			reader.onload = function() {

				if (reader.readyState !== 2)
					return;

				if (reader.result) {

					ShpZipFormat.parse(reader.result, function(geoJSON) {
						try {
							switch (geoJSON.type) {
								case 'FeatureCollection':
									geoJSON.features.forEach(function(feature) {
										var layer = L.GeoJSON.geometryToLayer(feature);
										this._fireCreatedEvent(layer);
									}, this);
									break;
								default:
									this._fireCreatedEvent(L.GeoJSON.geometryToLayer(geoJSON));
							}
						} finally {
							this._map.fire('draw:importend');
						}
					}.bind(this));
				}

			}.bind(this);

			this._map.fire('draw:importstart');
			reader.readAsArrayBuffer(input.files[0]);
		},

		getWorker: function() {
			if (!this.worker) {
				if (L.Draw.Imports.SHPJS_URL) {

					// No external .js script
					var script = "try { importScripts('" + L.Draw.Imports.SHPJS_URL + "'); } catch (e) {console.error(e); throw e;}\n" +
					"onmessage = function(e) {\n" +
						"console.log('Processing ShapeZip...');\n" +
						"var geoJSON = shp.parseZip(e.data.byteArray);\n" +
						"console.log('ShapeZip processed!');\n" +
						"postMessage({id: e.data.id, geoJSON: geoJSON});\n" +
					"}";

					var urlData = URL.createObjectURL(new Blob([script], {type: "application/javascript"}));
					this.worker = new Worker(urlData);

					this.worker.onmessage = this.onmessage.bind(this);
					this.worker.onerror = function() {
						console.log(arguments);
					};
				} else
					throw new Error('Need shapefile-js URL');
			}

			return this.worker;
		}
	};

	L.Draw.Imports.FORMATS.push({
		callback: ShpZipFormat.nop,
		createActionElement: ShpZipFormat.createOpenButton

	});
})();