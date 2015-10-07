;(function() {

	if (!L.drawLocal.draw.toolbar.imports)
		L.drawLocal.draw.toolbar.imports = {};

	L.Draw.Imports = L.Draw.Feature.extend({
		statics: {
			FORMATS: [],
			TYPE: 'imports'
		},

		initialize: function (map, options) {
			this.type = L.Draw.Imports.TYPE;

			L.Draw.Feature.prototype.initialize.call(this, map, options);
		},

		getActions: function () {

			return L.Draw.Imports.FORMATS.map(function(format) {
				var ownElement = null;

				if (format.createActionElement)
					ownElement = format.createActionElement.call(this);

				return {
					enabled: true,
					title: format.title,
					text: format.text,
					callback: format.callback,
					context: this,
					ownElement: ownElement
				};
			}, this);
		}
	});

})();
;(function() {

	if (!L.drawLocal.draw.toolbar.imports.shapeZip) {
		L.drawLocal.draw.toolbar.imports.shapeZip = {
			text: 'Import a shapefile zip',
			title: 'Please, select a zip file.'
		};
	}

	ShpZipFormat = {

		_handlers: {},

		_nextId: 1,

		createOpenButton: function() {
			var link = L.DomUtil.create('a');

			link.style.position = 'relative';
			link.innerHTML = L.drawLocal.draw.toolbar.imports.shapeZip.text;
			link.title = L.drawLocal.draw.toolbar.imports.shapeZip.title;

			var input = L.DomUtil.create('input', 'leaflet-draw-draw-imports-action', link);
			input.type = 'file';

			var handler = this;

			input.onchange = function() {
				ShpZipFormat._openShapeZip(handler, input);
			};

			return link;
		},

		nop: function() {},

		_getWorker: function() {
			if (!this._worker) {
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
					this._worker = new Worker(urlData);

					this._worker.onmessage = this._onmessage.bind(this);
					this._worker.onerror = function() {
						console.log(arguments);
					};
				} else
					throw new Error('Need shapefile-js URL');
			}

			return this._worker;
		},

		_onmessage: function(e) {
			var geoJSON = e.data.geoJSON;
			var handler = this._handlers[e.data.id];

			// TODO: Is it always FeatureCollection?
			
			var properties, geometry, newFeature, i, layer;

			geoJSON.features.forEach(function(feature) {
				properties = feature.properties;
				geometry = feature.geometry;

				if (geometry.type.startsWith("Multi")) {
					for (i=0; i < geometry.coordinates.length; i++) {
						newFeature = {
							type: geometry.type.substring(5),
							properties: properties,
							coordinates: geometry.coordinates[i]
						};

						layer = L.GeoJSON.geometryToLayer(newFeature);
						handler._fireCreatedEvent(layer);
					}
				} else {
					layer = L.GeoJSON.geometryToLayer(feature);
					handler._fireCreatedEvent(layer);
				}

				handler.disable();
			});
		},

		_openShapeZip: function(handler, input) {
			if (!input.files && !input.files[0])
				return;

			var reader = new FileReader();

			reader.onload = function() {

				if (reader.readyState !== 2)
					return;

				if (reader.result) {
					ShpZipFormat._parse(handler, reader.result);
				}

			};

			handler._map.fire('draw:importstart');
			reader.readAsArrayBuffer(input.files[0]);
		},

		_parse: function(handler, byteArray) {
			var worker = this._getWorker();
			var id = this._nextId++;
			this._handlers[id] = handler;

			worker.postMessage({id: id, byteArray: byteArray}, [byteArray]);
		},
	};

	L.Draw.Imports.FORMATS.push({
		callback: ShpZipFormat.nop,
		createActionElement: ShpZipFormat.createOpenButton

	});
})();
;(function() {

	var WITHIN = 'within';

	L.FeatureGroup.Validation = L.Handler.extend({

		includes: L.Mixin.Events,

		options: {

		},

		initialize: function(featureGroup) {
			this._featureGroup = featureGroup;
			this._binded = {};
			this._errors = {};
		},

		addHooks: function () {
			if (this._withins) {
				this._withins.forEach(this._watch.bind(this, WITHIN));
				this._featureGroup.on('layeradd layerremove', this._getHandler(this._validateMe, WITHIN));
			}
		},

		fireOnMap: function (name, evt) {
			if (this._featureGroup._map)
				this._featureGroup._map.fire(name, evt);
		},

		removeHooks: function () {
			if (this._withins) {
				this._featureGroup.off('layeradd layerremove', this._getHandler(this._validateMe, WITHIN));
				this._unwithin();
			}
		},

		within: function () {
			this._unwithin();

			this._withins = Array.prototype.slice.call(arguments, 0);

			return this;
		},

		_getHandler: function(handler, op) {
			var id = L.stamp(handler);

			if (!this._binded[op])
				this._binded[op] = {};

			if (!this._binded[op][id])
				this._binded[op][id] = handler.bind(this, op);

			return this._binded[op][id];
		},

		_validate: function (op, evt) {

			if (!this._featureGroup.getLayers().length)
				return;

			var id = L.stamp(evt.target);

			if (!this._featureGroup[op](evt.target)) {

				if (!this._errors[op])
					this._errors[op] = [];

				if (this._errors[op].indexOf(id) === -1)
					this._errors[op].push(id);

				evt = {validation: op, targetLayer: this._featureGroup, sourceLayer: evt.target};

				this.fire('invalid', evt);
				this.fireOnMap('draw:invalid', evt);
			} else {
				if (this._errors[op]) {
					var index = this._errors[op].indexOf(id);

					if (index > -1) {
						this._errors[op].splice(index, 1);

						if (this._errors[op].length === 0) {
							evt = {validation: op, targetLayer: this._featureGroup};
							this.fire('valid', evt);
							this.fireOnMap('draw:valid', evt);
						}
					}
				}
			}
		},

		_validateMe: function(op) {
			var evt;
			var valid = true;

			if (this._errors[op] && this._errors[op].length)
				valid = false;

			this._errors[op] = [];

			if (!this._featureGroup.getLayers().length) {
				if (!valid) {
					evt = {validation: op, targetLayer: this._featureGroup};
					this.fire('valid', evt);
					this.fireOnMap('draw:valid', evt);
				}

				return;
			}

			var layers = this['_' + op + 's'];

			if (layers) {
				evt = {validation: op, targetLayer: this._featureGroup};

				
				layers.forEach(function(layer) {

					if (!this._featureGroup[op](layer)) {

						this._errors[op].push(L.stamp(layer));
						evt.sourceLayer = layer;
						this.fire('invalid', evt);
						this.fireOnMap('draw:invalid', evt);
					}

				}, this);

				if (!this._errors[op].length && !valid) {
					evt = {validation: op, targetLayer: this._featureGroup};
					this.fire('valid', evt);
					this.fireOnMap('draw:valid', evt);
				}
			}
		},

		_onLayerPreAdd: function (op, evt) {
		},

		_onLayerRemove: function (op, evt) {
		},

		_onLayerPreRemove: function(op, evt) {
		},

		_unwithin: function () {
			if (this._withins) {
				this._withins.forEach(this._unwatch.bind(this, WITHIN));
				delete this._withins;
			}
		},

		_unwatch: function (op, featureGroup) {
			var watcher = this._getHandler(this._validate, op);

			featureGroup.off('layeradd', watcher);
			featureGroup.off('layerremove', watcher);
		},

		_watch: function (op, featureGroup) {

			var watcher = this._getHandler(this._validate, op);

			featureGroup.on('layeradd', watcher);
			featureGroup.on('layerremove', watcher);
		}

	});


	L.FeatureGroup.addInitHook(function () {
		if (!this.validation)
			this.validation = new L.FeatureGroup.Validation(this);
	});

})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkltcG9ydHMuanMiLCJTaGFwZVppcC5qcyIsIkwuRmVhdHVyZUdyb3VwLlZhbGlkYXRpb24uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImxlYWZsZXQuZHJhdy5wbHVzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiOyhmdW5jdGlvbigpIHtcblxuXHRpZiAoIUwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzKVxuXHRcdEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzID0ge307XG5cblx0TC5EcmF3LkltcG9ydHMgPSBMLkRyYXcuRmVhdHVyZS5leHRlbmQoe1xuXHRcdHN0YXRpY3M6IHtcblx0XHRcdEZPUk1BVFM6IFtdLFxuXHRcdFx0VFlQRTogJ2ltcG9ydHMnXG5cdFx0fSxcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uIChtYXAsIG9wdGlvbnMpIHtcblx0XHRcdHRoaXMudHlwZSA9IEwuRHJhdy5JbXBvcnRzLlRZUEU7XG5cblx0XHRcdEwuRHJhdy5GZWF0dXJlLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgbWFwLCBvcHRpb25zKTtcblx0XHR9LFxuXG5cdFx0Z2V0QWN0aW9uczogZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRyZXR1cm4gTC5EcmF3LkltcG9ydHMuRk9STUFUUy5tYXAoZnVuY3Rpb24oZm9ybWF0KSB7XG5cdFx0XHRcdHZhciBvd25FbGVtZW50ID0gbnVsbDtcblxuXHRcdFx0XHRpZiAoZm9ybWF0LmNyZWF0ZUFjdGlvbkVsZW1lbnQpXG5cdFx0XHRcdFx0b3duRWxlbWVudCA9IGZvcm1hdC5jcmVhdGVBY3Rpb25FbGVtZW50LmNhbGwodGhpcyk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHRpdGxlOiBmb3JtYXQudGl0bGUsXG5cdFx0XHRcdFx0dGV4dDogZm9ybWF0LnRleHQsXG5cdFx0XHRcdFx0Y2FsbGJhY2s6IGZvcm1hdC5jYWxsYmFjayxcblx0XHRcdFx0XHRjb250ZXh0OiB0aGlzLFxuXHRcdFx0XHRcdG93bkVsZW1lbnQ6IG93bkVsZW1lbnRcblx0XHRcdFx0fTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblx0fSk7XG5cbn0pKCk7IiwiOyhmdW5jdGlvbigpIHtcblxuXHRpZiAoIUwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwKSB7XG5cdFx0TC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXAgPSB7XG5cdFx0XHR0ZXh0OiAnSW1wb3J0IGEgc2hhcGVmaWxlIHppcCcsXG5cdFx0XHR0aXRsZTogJ1BsZWFzZSwgc2VsZWN0IGEgemlwIGZpbGUuJ1xuXHRcdH07XG5cdH1cblxuXHRTaHBaaXBGb3JtYXQgPSB7XG5cblx0XHRfaGFuZGxlcnM6IHt9LFxuXG5cdFx0X25leHRJZDogMSxcblxuXHRcdGNyZWF0ZU9wZW5CdXR0b246IGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGxpbmsgPSBMLkRvbVV0aWwuY3JlYXRlKCdhJyk7XG5cblx0XHRcdGxpbmsuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdFx0bGluay5pbm5lckhUTUwgPSBMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcC50ZXh0O1xuXHRcdFx0bGluay50aXRsZSA9IEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwLnRpdGxlO1xuXG5cdFx0XHR2YXIgaW5wdXQgPSBMLkRvbVV0aWwuY3JlYXRlKCdpbnB1dCcsICdsZWFmbGV0LWRyYXctZHJhdy1pbXBvcnRzLWFjdGlvbicsIGxpbmspO1xuXHRcdFx0aW5wdXQudHlwZSA9ICdmaWxlJztcblxuXHRcdFx0dmFyIGhhbmRsZXIgPSB0aGlzO1xuXG5cdFx0XHRpbnB1dC5vbmNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRTaHBaaXBGb3JtYXQuX29wZW5TaGFwZVppcChoYW5kbGVyLCBpbnB1dCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gbGluaztcblx0XHR9LFxuXG5cdFx0bm9wOiBmdW5jdGlvbigpIHt9LFxuXG5cdFx0X2dldFdvcmtlcjogZnVuY3Rpb24oKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3dvcmtlcikge1xuXHRcdFx0XHRpZiAoTC5EcmF3LkltcG9ydHMuU0hQSlNfVVJMKSB7XG5cblx0XHRcdFx0XHQvLyBObyBleHRlcm5hbCAuanMgc2NyaXB0XG5cdFx0XHRcdFx0dmFyIHNjcmlwdCA9IFwidHJ5IHsgaW1wb3J0U2NyaXB0cygnXCIgKyBMLkRyYXcuSW1wb3J0cy5TSFBKU19VUkwgKyBcIicpOyB9IGNhdGNoIChlKSB7Y29uc29sZS5lcnJvcihlKTsgdGhyb3cgZTt9XFxuXCIgK1xuXHRcdFx0XHRcdFwib25tZXNzYWdlID0gZnVuY3Rpb24oZSkge1xcblwiICtcblx0XHRcdFx0XHRcdFwiY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgU2hhcGVaaXAuLi4nKTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcInZhciBnZW9KU09OID0gc2hwLnBhcnNlWmlwKGUuZGF0YS5ieXRlQXJyYXkpO1xcblwiICtcblx0XHRcdFx0XHRcdFwiY29uc29sZS5sb2coJ1NoYXBlWmlwIHByb2Nlc3NlZCEnKTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcInBvc3RNZXNzYWdlKHtpZDogZS5kYXRhLmlkLCBnZW9KU09OOiBnZW9KU09OfSk7XFxuXCIgK1xuXHRcdFx0XHRcdFwifVwiO1xuXG5cdFx0XHRcdFx0dmFyIHVybERhdGEgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtzY3JpcHRdLCB7dHlwZTogXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCJ9KSk7XG5cdFx0XHRcdFx0dGhpcy5fd29ya2VyID0gbmV3IFdvcmtlcih1cmxEYXRhKTtcblxuXHRcdFx0XHRcdHRoaXMuX3dvcmtlci5vbm1lc3NhZ2UgPSB0aGlzLl9vbm1lc3NhZ2UuYmluZCh0aGlzKTtcblx0XHRcdFx0XHR0aGlzLl93b3JrZXIub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coYXJndW1lbnRzKTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05lZWQgc2hhcGVmaWxlLWpzIFVSTCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya2VyO1xuXHRcdH0sXG5cblx0XHRfb25tZXNzYWdlOiBmdW5jdGlvbihlKSB7XG5cdFx0XHR2YXIgZ2VvSlNPTiA9IGUuZGF0YS5nZW9KU09OO1xuXHRcdFx0dmFyIGhhbmRsZXIgPSB0aGlzLl9oYW5kbGVyc1tlLmRhdGEuaWRdO1xuXG5cdFx0XHQvLyBUT0RPOiBJcyBpdCBhbHdheXMgRmVhdHVyZUNvbGxlY3Rpb24/XG5cdFx0XHRcblx0XHRcdHZhciBwcm9wZXJ0aWVzLCBnZW9tZXRyeSwgbmV3RmVhdHVyZSwgaSwgbGF5ZXI7XG5cblx0XHRcdGdlb0pTT04uZmVhdHVyZXMuZm9yRWFjaChmdW5jdGlvbihmZWF0dXJlKSB7XG5cdFx0XHRcdHByb3BlcnRpZXMgPSBmZWF0dXJlLnByb3BlcnRpZXM7XG5cdFx0XHRcdGdlb21ldHJ5ID0gZmVhdHVyZS5nZW9tZXRyeTtcblxuXHRcdFx0XHRpZiAoZ2VvbWV0cnkudHlwZS5zdGFydHNXaXRoKFwiTXVsdGlcIikpIHtcblx0XHRcdFx0XHRmb3IgKGk9MDsgaSA8IGdlb21ldHJ5LmNvb3JkaW5hdGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRuZXdGZWF0dXJlID0ge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBnZW9tZXRyeS50eXBlLnN1YnN0cmluZyg1KSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczogcHJvcGVydGllcyxcblx0XHRcdFx0XHRcdFx0Y29vcmRpbmF0ZXM6IGdlb21ldHJ5LmNvb3JkaW5hdGVzW2ldXG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRsYXllciA9IEwuR2VvSlNPTi5nZW9tZXRyeVRvTGF5ZXIobmV3RmVhdHVyZSk7XG5cdFx0XHRcdFx0XHRoYW5kbGVyLl9maXJlQ3JlYXRlZEV2ZW50KGxheWVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGF5ZXIgPSBMLkdlb0pTT04uZ2VvbWV0cnlUb0xheWVyKGZlYXR1cmUpO1xuXHRcdFx0XHRcdGhhbmRsZXIuX2ZpcmVDcmVhdGVkRXZlbnQobGF5ZXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGFuZGxlci5kaXNhYmxlKCk7XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0X29wZW5TaGFwZVppcDogZnVuY3Rpb24oaGFuZGxlciwgaW5wdXQpIHtcblx0XHRcdGlmICghaW5wdXQuZmlsZXMgJiYgIWlucHV0LmZpbGVzWzBdKVxuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXG5cdFx0XHRyZWFkZXIub25sb2FkID0gZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0aWYgKHJlYWRlci5yZWFkeVN0YXRlICE9PSAyKVxuXHRcdFx0XHRcdHJldHVybjtcblxuXHRcdFx0XHRpZiAocmVhZGVyLnJlc3VsdCkge1xuXHRcdFx0XHRcdFNocFppcEZvcm1hdC5fcGFyc2UoaGFuZGxlciwgcmVhZGVyLnJlc3VsdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fTtcblxuXHRcdFx0aGFuZGxlci5fbWFwLmZpcmUoJ2RyYXc6aW1wb3J0c3RhcnQnKTtcblx0XHRcdHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihpbnB1dC5maWxlc1swXSk7XG5cdFx0fSxcblxuXHRcdF9wYXJzZTogZnVuY3Rpb24oaGFuZGxlciwgYnl0ZUFycmF5KSB7XG5cdFx0XHR2YXIgd29ya2VyID0gdGhpcy5fZ2V0V29ya2VyKCk7XG5cdFx0XHR2YXIgaWQgPSB0aGlzLl9uZXh0SWQrKztcblx0XHRcdHRoaXMuX2hhbmRsZXJzW2lkXSA9IGhhbmRsZXI7XG5cblx0XHRcdHdvcmtlci5wb3N0TWVzc2FnZSh7aWQ6IGlkLCBieXRlQXJyYXk6IGJ5dGVBcnJheX0sIFtieXRlQXJyYXldKTtcblx0XHR9LFxuXHR9O1xuXG5cdEwuRHJhdy5JbXBvcnRzLkZPUk1BVFMucHVzaCh7XG5cdFx0Y2FsbGJhY2s6IFNocFppcEZvcm1hdC5ub3AsXG5cdFx0Y3JlYXRlQWN0aW9uRWxlbWVudDogU2hwWmlwRm9ybWF0LmNyZWF0ZU9wZW5CdXR0b25cblxuXHR9KTtcbn0pKCk7IiwiOyhmdW5jdGlvbigpIHtcblxuXHR2YXIgV0lUSElOID0gJ3dpdGhpbic7XG5cblx0TC5GZWF0dXJlR3JvdXAuVmFsaWRhdGlvbiA9IEwuSGFuZGxlci5leHRlbmQoe1xuXG5cdFx0aW5jbHVkZXM6IEwuTWl4aW4uRXZlbnRzLFxuXG5cdFx0b3B0aW9uczoge1xuXG5cdFx0fSxcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uKGZlYXR1cmVHcm91cCkge1xuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwID0gZmVhdHVyZUdyb3VwO1xuXHRcdFx0dGhpcy5fYmluZGVkID0ge307XG5cdFx0XHR0aGlzLl9lcnJvcnMgPSB7fTtcblx0XHR9LFxuXG5cdFx0YWRkSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICh0aGlzLl93aXRoaW5zKSB7XG5cdFx0XHRcdHRoaXMuX3dpdGhpbnMuZm9yRWFjaCh0aGlzLl93YXRjaC5iaW5kKHRoaXMsIFdJVEhJTikpO1xuXHRcdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkIGxheWVycmVtb3ZlJywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZU1lLCBXSVRISU4pKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0ZmlyZU9uTWFwOiBmdW5jdGlvbiAobmFtZSwgZXZ0KSB7XG5cdFx0XHRpZiAodGhpcy5fZmVhdHVyZUdyb3VwLl9tYXApXG5cdFx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cC5fbWFwLmZpcmUobmFtZSwgZXZ0KTtcblx0XHR9LFxuXG5cdFx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICh0aGlzLl93aXRoaW5zKSB7XG5cdFx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cC5vZmYoJ2xheWVyYWRkIGxheWVycmVtb3ZlJywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZU1lLCBXSVRISU4pKTtcblx0XHRcdFx0dGhpcy5fdW53aXRoaW4oKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0d2l0aGluOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl91bndpdGhpbigpO1xuXG5cdFx0XHR0aGlzLl93aXRoaW5zID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcblxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblxuXHRcdF9nZXRIYW5kbGVyOiBmdW5jdGlvbihoYW5kbGVyLCBvcCkge1xuXHRcdFx0dmFyIGlkID0gTC5zdGFtcChoYW5kbGVyKTtcblxuXHRcdFx0aWYgKCF0aGlzLl9iaW5kZWRbb3BdKVxuXHRcdFx0XHR0aGlzLl9iaW5kZWRbb3BdID0ge307XG5cblx0XHRcdGlmICghdGhpcy5fYmluZGVkW29wXVtpZF0pXG5cdFx0XHRcdHRoaXMuX2JpbmRlZFtvcF1baWRdID0gaGFuZGxlci5iaW5kKHRoaXMsIG9wKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuX2JpbmRlZFtvcF1baWRdO1xuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGU6IGZ1bmN0aW9uIChvcCwgZXZ0KSB7XG5cblx0XHRcdGlmICghdGhpcy5fZmVhdHVyZUdyb3VwLmdldExheWVycygpLmxlbmd0aClcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHR2YXIgaWQgPSBMLnN0YW1wKGV2dC50YXJnZXQpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX2ZlYXR1cmVHcm91cFtvcF0oZXZ0LnRhcmdldCkpIHtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX2Vycm9yc1tvcF0pXG5cdFx0XHRcdFx0dGhpcy5fZXJyb3JzW29wXSA9IFtdO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9lcnJvcnNbb3BdLmluZGV4T2YoaWQpID09PSAtMSlcblx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbb3BdLnB1c2goaWQpO1xuXG5cdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBvcCwgdGFyZ2V0TGF5ZXI6IHRoaXMuX2ZlYXR1cmVHcm91cCwgc291cmNlTGF5ZXI6IGV2dC50YXJnZXR9O1xuXG5cdFx0XHRcdHRoaXMuZmlyZSgnaW52YWxpZCcsIGV2dCk7XG5cdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OmludmFsaWQnLCBldnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMuX2Vycm9yc1tvcF0pIHtcblx0XHRcdFx0XHR2YXIgaW5kZXggPSB0aGlzLl9lcnJvcnNbb3BdLmluZGV4T2YoaWQpO1xuXG5cdFx0XHRcdFx0aWYgKGluZGV4ID4gLTEpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2Vycm9yc1tvcF0uc3BsaWNlKGluZGV4LCAxKTtcblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2Vycm9yc1tvcF0ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBvcCwgdGFyZ2V0TGF5ZXI6IHRoaXMuX2ZlYXR1cmVHcm91cH07XG5cdFx0XHRcdFx0XHRcdHRoaXMuZmlyZSgndmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzp2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF92YWxpZGF0ZU1lOiBmdW5jdGlvbihvcCkge1xuXHRcdFx0dmFyIGV2dDtcblx0XHRcdHZhciB2YWxpZCA9IHRydWU7XG5cblx0XHRcdGlmICh0aGlzLl9lcnJvcnNbb3BdICYmIHRoaXMuX2Vycm9yc1tvcF0ubGVuZ3RoKVxuXHRcdFx0XHR2YWxpZCA9IGZhbHNlO1xuXG5cdFx0XHR0aGlzLl9lcnJvcnNbb3BdID0gW107XG5cblx0XHRcdGlmICghdGhpcy5fZmVhdHVyZUdyb3VwLmdldExheWVycygpLmxlbmd0aCkge1xuXHRcdFx0XHRpZiAoIXZhbGlkKSB7XG5cdFx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG9wLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwfTtcblx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzp2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHZhciBsYXllcnMgPSB0aGlzWydfJyArIG9wICsgJ3MnXTtcblxuXHRcdFx0aWYgKGxheWVycykge1xuXHRcdFx0XHRldnQgPSB7dmFsaWRhdGlvbjogb3AsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXG5cdFx0XHRcdFxuXHRcdFx0XHRsYXllcnMuZm9yRWFjaChmdW5jdGlvbihsYXllcikge1xuXG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9mZWF0dXJlR3JvdXBbb3BdKGxheWVyKSkge1xuXG5cdFx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbb3BdLnB1c2goTC5zdGFtcChsYXllcikpO1xuXHRcdFx0XHRcdFx0ZXZ0LnNvdXJjZUxheWVyID0gbGF5ZXI7XG5cdFx0XHRcdFx0XHR0aGlzLmZpcmUoJ2ludmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6aW52YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHRcdGlmICghdGhpcy5fZXJyb3JzW29wXS5sZW5ndGggJiYgIXZhbGlkKSB7XG5cdFx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG9wLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwfTtcblx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzp2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X29uTGF5ZXJQcmVBZGQ6IGZ1bmN0aW9uIChvcCwgZXZ0KSB7XG5cdFx0fSxcblxuXHRcdF9vbkxheWVyUmVtb3ZlOiBmdW5jdGlvbiAob3AsIGV2dCkge1xuXHRcdH0sXG5cblx0XHRfb25MYXllclByZVJlbW92ZTogZnVuY3Rpb24ob3AsIGV2dCkge1xuXHRcdH0sXG5cblx0XHRfdW53aXRoaW46IGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICh0aGlzLl93aXRoaW5zKSB7XG5cdFx0XHRcdHRoaXMuX3dpdGhpbnMuZm9yRWFjaCh0aGlzLl91bndhdGNoLmJpbmQodGhpcywgV0lUSElOKSk7XG5cdFx0XHRcdGRlbGV0ZSB0aGlzLl93aXRoaW5zO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfdW53YXRjaDogZnVuY3Rpb24gKG9wLCBmZWF0dXJlR3JvdXApIHtcblx0XHRcdHZhciB3YXRjaGVyID0gdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZSwgb3ApO1xuXG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCcsIHdhdGNoZXIpO1xuXHRcdFx0ZmVhdHVyZUdyb3VwLm9mZignbGF5ZXJyZW1vdmUnLCB3YXRjaGVyKTtcblx0XHR9LFxuXG5cdFx0X3dhdGNoOiBmdW5jdGlvbiAob3AsIGZlYXR1cmVHcm91cCkge1xuXG5cdFx0XHR2YXIgd2F0Y2hlciA9IHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGUsIG9wKTtcblxuXHRcdFx0ZmVhdHVyZUdyb3VwLm9uKCdsYXllcmFkZCcsIHdhdGNoZXIpO1xuXHRcdFx0ZmVhdHVyZUdyb3VwLm9uKCdsYXllcnJlbW92ZScsIHdhdGNoZXIpO1xuXHRcdH1cblxuXHR9KTtcblxuXG5cdEwuRmVhdHVyZUdyb3VwLmFkZEluaXRIb29rKGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXRoaXMudmFsaWRhdGlvbilcblx0XHRcdHRoaXMudmFsaWRhdGlvbiA9IG5ldyBMLkZlYXR1cmVHcm91cC5WYWxpZGF0aW9uKHRoaXMpO1xuXHR9KTtcblxufSkoKTsiXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
