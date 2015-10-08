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
(function () {

	L.FeatureGroup.Edit = L.Handler.extend({

		initialize: function (layer) {
			this._layer = layer;
		},

		addHooks: function () {
			this._layer.eachLayer(this._enableEditing, this);
			this._layer.on('layeradd', this._enableEditing, this);
			this._layer.on('layerremove', this._disableEditing, this);
		},

		removeHooks: function () {
			this._layer.eachLayer(this._disableEditing, this);
			this._layer.off('layeradd', this._enableEditing, this);
			this._layer.off('layerremove', this._disableEditing, this);
		},

		_enableEditing: function (layer) {
			if (layer.editing)
				layer.editing.enable();
		},

		_disableEditing: function (layer) {
			if (layer.editing)
				layer.editing.disable();
		}

	});

	L.FeatureGroup.addInitHook(function () {

		if (!this.editing)
			this.editing = new L.FeatureGroup.Edit(this);

	});

})();
L.FeatureGroup.include({
	isEmpty: function() {

		for (var id in this._layers) {
			return false;
		}

		return true;
	}
});
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
				this._featureGroup.on('layeradd layerremove', this._getHandler(this._validateTarget, WITHIN));
			}
		},

		fireOnMap: function (name, evt) {
			if (this._featureGroup._map)
				this._featureGroup._map.fire(name, evt);
		},

		removeHooks: function () {
			if (this._withins) {
				this._featureGroup.off('layeradd layerremove', this._getHandler(this._validateTarget, WITHIN));
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

		_validateSource: function (op, evt) {

			if (this._featureGroup.isEmpty())
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

		_validateTarget: function(op) {
			var evt;
			var valid = true;

			if (this._errors[op] && this._errors[op].length)
				valid = false;

			this._errors[op] = [];

			if (this._featureGroup.isEmpty()) {
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
			var watcher = this._getHandler(this._validateSource, op);

			featureGroup.off('layeradd', watcher);
			featureGroup.off('layerremove', watcher);
		},

		_watch: function (op, featureGroup) {

			var watcher = this._getHandler(this._validateSource, op);

			featureGroup.on('layeradd', watcher);
			featureGroup.on('layerremove', watcher);
		}

	});


	L.FeatureGroup.addInitHook(function () {
		if (!this.validation)
			this.validation = new L.FeatureGroup.Validation(this);
	});

})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkltcG9ydHMuanMiLCJTaGFwZVppcC5qcyIsIkwuRmVhdHVyZUdyb3VwLkVkaXQuanMiLCJMLkZlYXR1cmVHcm91cC5pc0VtcHR5LmpzIiwiTC5GZWF0dXJlR3JvdXAuVmFsaWRhdGlvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNsSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJsZWFmbGV0LmRyYXcucGx1cy5qcyIsInNvdXJjZXNDb250ZW50IjpbIjsoZnVuY3Rpb24oKSB7XG5cblx0aWYgKCFMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cylcblx0XHRMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cyA9IHt9O1xuXG5cdEwuRHJhdy5JbXBvcnRzID0gTC5EcmF3LkZlYXR1cmUuZXh0ZW5kKHtcblx0XHRzdGF0aWNzOiB7XG5cdFx0XHRGT1JNQVRTOiBbXSxcblx0XHRcdFRZUEU6ICdpbXBvcnRzJ1xuXHRcdH0sXG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAobWFwLCBvcHRpb25zKSB7XG5cdFx0XHR0aGlzLnR5cGUgPSBMLkRyYXcuSW1wb3J0cy5UWVBFO1xuXG5cdFx0XHRMLkRyYXcuRmVhdHVyZS5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIG1hcCwgb3B0aW9ucyk7XG5cdFx0fSxcblxuXHRcdGdldEFjdGlvbnM6IGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0cmV0dXJuIEwuRHJhdy5JbXBvcnRzLkZPUk1BVFMubWFwKGZ1bmN0aW9uKGZvcm1hdCkge1xuXHRcdFx0XHR2YXIgb3duRWxlbWVudCA9IG51bGw7XG5cblx0XHRcdFx0aWYgKGZvcm1hdC5jcmVhdGVBY3Rpb25FbGVtZW50KVxuXHRcdFx0XHRcdG93bkVsZW1lbnQgPSBmb3JtYXQuY3JlYXRlQWN0aW9uRWxlbWVudC5jYWxsKHRoaXMpO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHR0aXRsZTogZm9ybWF0LnRpdGxlLFxuXHRcdFx0XHRcdHRleHQ6IGZvcm1hdC50ZXh0LFxuXHRcdFx0XHRcdGNhbGxiYWNrOiBmb3JtYXQuY2FsbGJhY2ssXG5cdFx0XHRcdFx0Y29udGV4dDogdGhpcyxcblx0XHRcdFx0XHRvd25FbGVtZW50OiBvd25FbGVtZW50XG5cdFx0XHRcdH07XG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9XG5cdH0pO1xuXG59KSgpOyIsIjsoZnVuY3Rpb24oKSB7XG5cblx0aWYgKCFMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcCkge1xuXHRcdEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwID0ge1xuXHRcdFx0dGV4dDogJ0ltcG9ydCBhIHNoYXBlZmlsZSB6aXAnLFxuXHRcdFx0dGl0bGU6ICdQbGVhc2UsIHNlbGVjdCBhIHppcCBmaWxlLidcblx0XHR9O1xuXHR9XG5cblx0U2hwWmlwRm9ybWF0ID0ge1xuXG5cdFx0X2hhbmRsZXJzOiB7fSxcblxuXHRcdF9uZXh0SWQ6IDEsXG5cblx0XHRjcmVhdGVPcGVuQnV0dG9uOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBsaW5rID0gTC5Eb21VdGlsLmNyZWF0ZSgnYScpO1xuXG5cdFx0XHRsaW5rLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0XHRcdGxpbmsuaW5uZXJIVE1MID0gTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXAudGV4dDtcblx0XHRcdGxpbmsudGl0bGUgPSBMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcC50aXRsZTtcblxuXHRcdFx0dmFyIGlucHV0ID0gTC5Eb21VdGlsLmNyZWF0ZSgnaW5wdXQnLCAnbGVhZmxldC1kcmF3LWRyYXctaW1wb3J0cy1hY3Rpb24nLCBsaW5rKTtcblx0XHRcdGlucHV0LnR5cGUgPSAnZmlsZSc7XG5cblx0XHRcdHZhciBoYW5kbGVyID0gdGhpcztcblxuXHRcdFx0aW5wdXQub25jaGFuZ2UgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0U2hwWmlwRm9ybWF0Ll9vcGVuU2hhcGVaaXAoaGFuZGxlciwgaW5wdXQpO1xuXHRcdFx0fTtcblxuXHRcdFx0cmV0dXJuIGxpbms7XG5cdFx0fSxcblxuXHRcdG5vcDogZnVuY3Rpb24oKSB7fSxcblxuXHRcdF9nZXRXb3JrZXI6IGZ1bmN0aW9uKCkge1xuXHRcdFx0aWYgKCF0aGlzLl93b3JrZXIpIHtcblx0XHRcdFx0aWYgKEwuRHJhdy5JbXBvcnRzLlNIUEpTX1VSTCkge1xuXG5cdFx0XHRcdFx0Ly8gTm8gZXh0ZXJuYWwgLmpzIHNjcmlwdFxuXHRcdFx0XHRcdHZhciBzY3JpcHQgPSBcInRyeSB7IGltcG9ydFNjcmlwdHMoJ1wiICsgTC5EcmF3LkltcG9ydHMuU0hQSlNfVVJMICsgXCInKTsgfSBjYXRjaCAoZSkge2NvbnNvbGUuZXJyb3IoZSk7IHRocm93IGU7fVxcblwiICtcblx0XHRcdFx0XHRcIm9ubWVzc2FnZSA9IGZ1bmN0aW9uKGUpIHtcXG5cIiArXG5cdFx0XHRcdFx0XHRcImNvbnNvbGUubG9nKCdQcm9jZXNzaW5nIFNoYXBlWmlwLi4uJyk7XFxuXCIgK1xuXHRcdFx0XHRcdFx0XCJ2YXIgZ2VvSlNPTiA9IHNocC5wYXJzZVppcChlLmRhdGEuYnl0ZUFycmF5KTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcImNvbnNvbGUubG9nKCdTaGFwZVppcCBwcm9jZXNzZWQhJyk7XFxuXCIgK1xuXHRcdFx0XHRcdFx0XCJwb3N0TWVzc2FnZSh7aWQ6IGUuZGF0YS5pZCwgZ2VvSlNPTjogZ2VvSlNPTn0pO1xcblwiICtcblx0XHRcdFx0XHRcIn1cIjtcblxuXHRcdFx0XHRcdHZhciB1cmxEYXRhID0gVVJMLmNyZWF0ZU9iamVjdFVSTChuZXcgQmxvYihbc2NyaXB0XSwge3R5cGU6IFwiYXBwbGljYXRpb24vamF2YXNjcmlwdFwifSkpO1xuXHRcdFx0XHRcdHRoaXMuX3dvcmtlciA9IG5ldyBXb3JrZXIodXJsRGF0YSk7XG5cblx0XHRcdFx0XHR0aGlzLl93b3JrZXIub25tZXNzYWdlID0gdGhpcy5fb25tZXNzYWdlLmJpbmQodGhpcyk7XG5cdFx0XHRcdFx0dGhpcy5fd29ya2VyLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKGFyZ3VtZW50cyk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlXG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOZWVkIHNoYXBlZmlsZS1qcyBVUkwnKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuX3dvcmtlcjtcblx0XHR9LFxuXG5cdFx0X29ubWVzc2FnZTogZnVuY3Rpb24oZSkge1xuXHRcdFx0dmFyIGdlb0pTT04gPSBlLmRhdGEuZ2VvSlNPTjtcblx0XHRcdHZhciBoYW5kbGVyID0gdGhpcy5faGFuZGxlcnNbZS5kYXRhLmlkXTtcblxuXHRcdFx0Ly8gVE9ETzogSXMgaXQgYWx3YXlzIEZlYXR1cmVDb2xsZWN0aW9uP1xuXHRcdFx0XG5cdFx0XHR2YXIgcHJvcGVydGllcywgZ2VvbWV0cnksIG5ld0ZlYXR1cmUsIGksIGxheWVyO1xuXG5cdFx0XHRnZW9KU09OLmZlYXR1cmVzLmZvckVhY2goZnVuY3Rpb24oZmVhdHVyZSkge1xuXHRcdFx0XHRwcm9wZXJ0aWVzID0gZmVhdHVyZS5wcm9wZXJ0aWVzO1xuXHRcdFx0XHRnZW9tZXRyeSA9IGZlYXR1cmUuZ2VvbWV0cnk7XG5cblx0XHRcdFx0aWYgKGdlb21ldHJ5LnR5cGUuc3RhcnRzV2l0aChcIk11bHRpXCIpKSB7XG5cdFx0XHRcdFx0Zm9yIChpPTA7IGkgPCBnZW9tZXRyeS5jb29yZGluYXRlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0bmV3RmVhdHVyZSA9IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogZ2VvbWV0cnkudHlwZS5zdWJzdHJpbmcoNSksXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHByb3BlcnRpZXMsXG5cdFx0XHRcdFx0XHRcdGNvb3JkaW5hdGVzOiBnZW9tZXRyeS5jb29yZGluYXRlc1tpXVxuXHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0bGF5ZXIgPSBMLkdlb0pTT04uZ2VvbWV0cnlUb0xheWVyKG5ld0ZlYXR1cmUpO1xuXHRcdFx0XHRcdFx0aGFuZGxlci5fZmlyZUNyZWF0ZWRFdmVudChsYXllcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxheWVyID0gTC5HZW9KU09OLmdlb21ldHJ5VG9MYXllcihmZWF0dXJlKTtcblx0XHRcdFx0XHRoYW5kbGVyLl9maXJlQ3JlYXRlZEV2ZW50KGxheWVyKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGhhbmRsZXIuZGlzYWJsZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSxcblxuXHRcdF9vcGVuU2hhcGVaaXA6IGZ1bmN0aW9uKGhhbmRsZXIsIGlucHV0KSB7XG5cdFx0XHRpZiAoIWlucHV0LmZpbGVzICYmICFpbnB1dC5maWxlc1swXSlcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHR2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcblxuXHRcdFx0cmVhZGVyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuXG5cdFx0XHRcdGlmIChyZWFkZXIucmVhZHlTdGF0ZSAhPT0gMilcblx0XHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdFx0aWYgKHJlYWRlci5yZXN1bHQpIHtcblx0XHRcdFx0XHRTaHBaaXBGb3JtYXQuX3BhcnNlKGhhbmRsZXIsIHJlYWRlci5yZXN1bHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH07XG5cblx0XHRcdGhhbmRsZXIuX21hcC5maXJlKCdkcmF3OmltcG9ydHN0YXJ0Jyk7XG5cdFx0XHRyZWFkZXIucmVhZEFzQXJyYXlCdWZmZXIoaW5wdXQuZmlsZXNbMF0pO1xuXHRcdH0sXG5cblx0XHRfcGFyc2U6IGZ1bmN0aW9uKGhhbmRsZXIsIGJ5dGVBcnJheSkge1xuXHRcdFx0dmFyIHdvcmtlciA9IHRoaXMuX2dldFdvcmtlcigpO1xuXHRcdFx0dmFyIGlkID0gdGhpcy5fbmV4dElkKys7XG5cdFx0XHR0aGlzLl9oYW5kbGVyc1tpZF0gPSBoYW5kbGVyO1xuXG5cdFx0XHR3b3JrZXIucG9zdE1lc3NhZ2Uoe2lkOiBpZCwgYnl0ZUFycmF5OiBieXRlQXJyYXl9LCBbYnl0ZUFycmF5XSk7XG5cdFx0fSxcblx0fTtcblxuXHRMLkRyYXcuSW1wb3J0cy5GT1JNQVRTLnB1c2goe1xuXHRcdGNhbGxiYWNrOiBTaHBaaXBGb3JtYXQubm9wLFxuXHRcdGNyZWF0ZUFjdGlvbkVsZW1lbnQ6IFNocFppcEZvcm1hdC5jcmVhdGVPcGVuQnV0dG9uXG5cblx0fSk7XG59KSgpOyIsIihmdW5jdGlvbiAoKSB7XG5cblx0TC5GZWF0dXJlR3JvdXAuRWRpdCA9IEwuSGFuZGxlci5leHRlbmQoe1xuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKGxheWVyKSB7XG5cdFx0XHR0aGlzLl9sYXllciA9IGxheWVyO1xuXHRcdH0sXG5cblx0XHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy5fbGF5ZXIuZWFjaExheWVyKHRoaXMuX2VuYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdFx0dGhpcy5fbGF5ZXIub24oJ2xheWVyYWRkJywgdGhpcy5fZW5hYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vbignbGF5ZXJyZW1vdmUnLCB0aGlzLl9kaXNhYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0fSxcblxuXHRcdHJlbW92ZUhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl9sYXllci5lYWNoTGF5ZXIodGhpcy5fZGlzYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdFx0dGhpcy5fbGF5ZXIub2ZmKCdsYXllcmFkZCcsIHRoaXMuX2VuYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdFx0dGhpcy5fbGF5ZXIub2ZmKCdsYXllcnJlbW92ZScsIHRoaXMuX2Rpc2FibGVFZGl0aW5nLCB0aGlzKTtcblx0XHR9LFxuXG5cdFx0X2VuYWJsZUVkaXRpbmc6IGZ1bmN0aW9uIChsYXllcikge1xuXHRcdFx0aWYgKGxheWVyLmVkaXRpbmcpXG5cdFx0XHRcdGxheWVyLmVkaXRpbmcuZW5hYmxlKCk7XG5cdFx0fSxcblxuXHRcdF9kaXNhYmxlRWRpdGluZzogZnVuY3Rpb24gKGxheWVyKSB7XG5cdFx0XHRpZiAobGF5ZXIuZWRpdGluZylcblx0XHRcdFx0bGF5ZXIuZWRpdGluZy5kaXNhYmxlKCk7XG5cdFx0fVxuXG5cdH0pO1xuXG5cdEwuRmVhdHVyZUdyb3VwLmFkZEluaXRIb29rKGZ1bmN0aW9uICgpIHtcblxuXHRcdGlmICghdGhpcy5lZGl0aW5nKVxuXHRcdFx0dGhpcy5lZGl0aW5nID0gbmV3IEwuRmVhdHVyZUdyb3VwLkVkaXQodGhpcyk7XG5cblx0fSk7XG5cbn0pKCk7IiwiTC5GZWF0dXJlR3JvdXAuaW5jbHVkZSh7XG5cdGlzRW1wdHk6IGZ1bmN0aW9uKCkge1xuXG5cdFx0Zm9yICh2YXIgaWQgaW4gdGhpcy5fbGF5ZXJzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn0pOyIsIjsoZnVuY3Rpb24oKSB7XG5cblx0dmFyIFdJVEhJTiA9ICd3aXRoaW4nO1xuXG5cdEwuRmVhdHVyZUdyb3VwLlZhbGlkYXRpb24gPSBMLkhhbmRsZXIuZXh0ZW5kKHtcblxuXHRcdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcblxuXHRcdG9wdGlvbnM6IHtcblxuXHRcdH0sXG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbihmZWF0dXJlR3JvdXApIHtcblx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cCA9IGZlYXR1cmVHcm91cDtcblx0XHRcdHRoaXMuX2JpbmRlZCA9IHt9O1xuXHRcdFx0dGhpcy5fZXJyb3JzID0ge307XG5cdFx0fSxcblxuXHRcdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAodGhpcy5fd2l0aGlucykge1xuXHRcdFx0XHR0aGlzLl93aXRoaW5zLmZvckVhY2godGhpcy5fd2F0Y2guYmluZCh0aGlzLCBXSVRISU4pKTtcblx0XHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLm9uKCdsYXllcmFkZCBsYXllcnJlbW92ZScsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVUYXJnZXQsIFdJVEhJTikpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRmaXJlT25NYXA6IGZ1bmN0aW9uIChuYW1lLCBldnQpIHtcblx0XHRcdGlmICh0aGlzLl9mZWF0dXJlR3JvdXAuX21hcClcblx0XHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLl9tYXAuZmlyZShuYW1lLCBldnQpO1xuXHRcdH0sXG5cblx0XHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKHRoaXMuX3dpdGhpbnMpIHtcblx0XHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLm9mZignbGF5ZXJhZGQgbGF5ZXJyZW1vdmUnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlVGFyZ2V0LCBXSVRISU4pKTtcblx0XHRcdFx0dGhpcy5fdW53aXRoaW4oKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0d2l0aGluOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl91bndpdGhpbigpO1xuXG5cdFx0XHR0aGlzLl93aXRoaW5zID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcblxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblxuXHRcdF9nZXRIYW5kbGVyOiBmdW5jdGlvbihoYW5kbGVyLCBvcCkge1xuXHRcdFx0dmFyIGlkID0gTC5zdGFtcChoYW5kbGVyKTtcblxuXHRcdFx0aWYgKCF0aGlzLl9iaW5kZWRbb3BdKVxuXHRcdFx0XHR0aGlzLl9iaW5kZWRbb3BdID0ge307XG5cblx0XHRcdGlmICghdGhpcy5fYmluZGVkW29wXVtpZF0pXG5cdFx0XHRcdHRoaXMuX2JpbmRlZFtvcF1baWRdID0gaGFuZGxlci5iaW5kKHRoaXMsIG9wKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuX2JpbmRlZFtvcF1baWRdO1xuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVTb3VyY2U6IGZ1bmN0aW9uIChvcCwgZXZ0KSB7XG5cblx0XHRcdGlmICh0aGlzLl9mZWF0dXJlR3JvdXAuaXNFbXB0eSgpKVxuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdHZhciBpZCA9IEwuc3RhbXAoZXZ0LnRhcmdldCk7XG5cblx0XHRcdGlmICghdGhpcy5fZmVhdHVyZUdyb3VwW29wXShldnQudGFyZ2V0KSkge1xuXG5cdFx0XHRcdGlmICghdGhpcy5fZXJyb3JzW29wXSlcblx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbb3BdID0gW107XG5cblx0XHRcdFx0aWYgKHRoaXMuX2Vycm9yc1tvcF0uaW5kZXhPZihpZCkgPT09IC0xKVxuXHRcdFx0XHRcdHRoaXMuX2Vycm9yc1tvcF0ucHVzaChpZCk7XG5cblx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG9wLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwLCBzb3VyY2VMYXllcjogZXZ0LnRhcmdldH07XG5cblx0XHRcdFx0dGhpcy5maXJlKCdpbnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6aW52YWxpZCcsIGV2dCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5fZXJyb3JzW29wXSkge1xuXHRcdFx0XHRcdHZhciBpbmRleCA9IHRoaXMuX2Vycm9yc1tvcF0uaW5kZXhPZihpZCk7XG5cblx0XHRcdFx0XHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZXJyb3JzW29wXS5zcGxpY2UoaW5kZXgsIDEpO1xuXG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fZXJyb3JzW29wXS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG9wLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwfTtcblx0XHRcdFx0XHRcdFx0dGhpcy5maXJlKCd2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X3ZhbGlkYXRlVGFyZ2V0OiBmdW5jdGlvbihvcCkge1xuXHRcdFx0dmFyIGV2dDtcblx0XHRcdHZhciB2YWxpZCA9IHRydWU7XG5cblx0XHRcdGlmICh0aGlzLl9lcnJvcnNbb3BdICYmIHRoaXMuX2Vycm9yc1tvcF0ubGVuZ3RoKVxuXHRcdFx0XHR2YWxpZCA9IGZhbHNlO1xuXG5cdFx0XHR0aGlzLl9lcnJvcnNbb3BdID0gW107XG5cblx0XHRcdGlmICh0aGlzLl9mZWF0dXJlR3JvdXAuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGlmICghdmFsaWQpIHtcblx0XHRcdFx0XHRldnQgPSB7dmFsaWRhdGlvbjogb3AsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXHRcdFx0XHRcdHRoaXMuZmlyZSgndmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dmFyIGxheWVycyA9IHRoaXNbJ18nICsgb3AgKyAncyddO1xuXG5cdFx0XHRpZiAobGF5ZXJzKSB7XG5cdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBvcCwgdGFyZ2V0TGF5ZXI6IHRoaXMuX2ZlYXR1cmVHcm91cH07XG5cblx0XHRcdFx0XG5cdFx0XHRcdGxheWVycy5mb3JFYWNoKGZ1bmN0aW9uKGxheWVyKSB7XG5cblx0XHRcdFx0XHRpZiAoIXRoaXMuX2ZlYXR1cmVHcm91cFtvcF0obGF5ZXIpKSB7XG5cblx0XHRcdFx0XHRcdHRoaXMuX2Vycm9yc1tvcF0ucHVzaChMLnN0YW1wKGxheWVyKSk7XG5cdFx0XHRcdFx0XHRldnQuc291cmNlTGF5ZXIgPSBsYXllcjtcblx0XHRcdFx0XHRcdHRoaXMuZmlyZSgnaW52YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzppbnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdFx0aWYgKCF0aGlzLl9lcnJvcnNbb3BdLmxlbmd0aCAmJiAhdmFsaWQpIHtcblx0XHRcdFx0XHRldnQgPSB7dmFsaWRhdGlvbjogb3AsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXHRcdFx0XHRcdHRoaXMuZmlyZSgndmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfb25MYXllclByZUFkZDogZnVuY3Rpb24gKG9wLCBldnQpIHtcblx0XHR9LFxuXG5cdFx0X29uTGF5ZXJSZW1vdmU6IGZ1bmN0aW9uIChvcCwgZXZ0KSB7XG5cdFx0fSxcblxuXHRcdF9vbkxheWVyUHJlUmVtb3ZlOiBmdW5jdGlvbihvcCwgZXZ0KSB7XG5cdFx0fSxcblxuXHRcdF91bndpdGhpbjogZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKHRoaXMuX3dpdGhpbnMpIHtcblx0XHRcdFx0dGhpcy5fd2l0aGlucy5mb3JFYWNoKHRoaXMuX3Vud2F0Y2guYmluZCh0aGlzLCBXSVRISU4pKTtcblx0XHRcdFx0ZGVsZXRlIHRoaXMuX3dpdGhpbnM7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF91bndhdGNoOiBmdW5jdGlvbiAob3AsIGZlYXR1cmVHcm91cCkge1xuXHRcdFx0dmFyIHdhdGNoZXIgPSB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlU291cmNlLCBvcCk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5vZmYoJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcnJlbW92ZScsIHdhdGNoZXIpO1xuXHRcdH0sXG5cblx0XHRfd2F0Y2g6IGZ1bmN0aW9uIChvcCwgZmVhdHVyZUdyb3VwKSB7XG5cblx0XHRcdHZhciB3YXRjaGVyID0gdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZVNvdXJjZSwgb3ApO1xuXG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVycmVtb3ZlJywgd2F0Y2hlcik7XG5cdFx0fVxuXG5cdH0pO1xuXG5cblx0TC5GZWF0dXJlR3JvdXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdGhpcy52YWxpZGF0aW9uKVxuXHRcdFx0dGhpcy52YWxpZGF0aW9uID0gbmV3IEwuRmVhdHVyZUdyb3VwLlZhbGlkYXRpb24odGhpcyk7XG5cdH0pO1xuXG59KSgpOyJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
