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
;(function () {

	var FIX_OPERATIONS = {
		within: {
			check: 'intersects',
			fix: ['intersection']
		}
	};

	var JSTS_METHODS = {
		within: 'within'
	};

	L.FeatureGroup.Fixer = L.Class.extend({

		initialize: function (validation) {
			this._validation = validation;
		},

		within: function () {
			var self = this;
			setTimeout(function() {
				var valid = self._validation.isValid(JSTS_METHODS.within);

				if (!valid) {
					self._fix(JSTS_METHODS.within, FIX_OPERATIONS.within);
				}
			});
		},

		_fix: function (methodName, operation) {


			if (!operation)
				return;

			var checkMethod = operation.check,
			fixMethods = operation.fix;

			this._validation.wait(methodName, function() {
				var featureGroup = this._validation.getFeatureGroup(),
				restrictionLayers = this._validation.getRestrictionLayers(methodName),
				fixedLayer, i, fixMethod;

				function fixLayer (layer, restrictionLayer) {
					if (layer.jsts[checkMethod](restrictionLayer)) {
						for (i = 0; i < fixMethods.length; i++) {
							fixMethod = fixMethods[i];

							layer = layer.jsts[fixMethod](restrictionLayer);
						}
					}

					return layer;
				}

				featureGroup.eachLayer(function(layer) {
					fixedLayer = restrictionLayers.reduce(fixLayer, layer);

					if (fixedLayer !== layer) {
						featureGroup.removeLayer(layer);
						featureGroup.addLayer(fixedLayer);
					}
				});
			}, this);
			
		}
	});

})();
;(function() {

	var JSTS_METHODS = {
		Within: 'within'
	};

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
			var collectionId, collection, methodName;

			for (var name in JSTS_METHODS) {

				methodName = JSTS_METHODS[name];

				collectionId = this._collectionId(methodName);
				collection = this[collectionId];
				if (collection) {
					collection.forEach(this._watch.bind(this, methodName));
				}

				this._watchMe(methodName);
			}

		},

		getRestrictionLayers: function (methodName) {
			var collectionId  = this._collectionId(methodName);
			if (this[collectionId]) {
				return this[collectionId].slice(0);
			}
		},

		getFeatureGroup: function () {
			return this._featureGroup;
		},

		isValid: function(methodName) {
			if (methodName && this._errors[methodName]) {
				return !this._errors[methodName].length;
			}
		},

		fireOnMap: function (eventName, event) {
			if (this._featureGroup._map)
				this._featureGroup._map.fire(eventName, event);
		},

		removeHooks: function () {
			var collectionId, collection, methodName;

			for (var name in JSTS_METHODS) {

				methodName = JSTS_METHODS[name];
				collectionId = this._collectionId(methodName);
				collection = this[collectionId];

				if (collection)
					collection.forEach(this._unwatch.bind(this, methodName));

				this._unwatchMe(methodName);
			}
		},

		/**
		 * Disable temporarily on validation and execute fn
		 * @param  {String}   op validation name
		 * @param  {Function} fn 
		 * @param  {Object} context thisArg
		 * @return {Any} fn result
		 */
		wait: function (methodName, fn, context) {

			var collectionId = this._collectionId(methodName);

			if (this[collectionId]) {
				try {
					this[collectionId].forEach(this._unwatch.bind(this, methodName));
					this._unwatchMe(methodName);

					return fn.call(context, this);
				} finally {
					if (this.enabled()) {
						this[collectionId].forEach(this._watch.bind(this, methodName));
						this._watchMe(methodName);
					}
				}
			}
		},

		within: function () {
			this._on(JSTS_METHODS.Within, Array.prototype.slice.call(arguments, 0));
			return this;
		},

		_collectionId: function (methodName) {
			return methodName ? '_' + methodName + 's' : null;
		},

		_getHandler: function(handler, methodName) {
			var id = L.stamp(handler);

			if (!this._binded[methodName])
				this._binded[methodName] = {};

			if (!this._binded[methodName][id])
				this._binded[methodName][id] = handler.bind(this, methodName);

			return this._binded[methodName][id];
		},

		_off: function (methodName) {
			var collectionId = this._collectionId(methodName);

			if (this[collectionId]) {
				this[collectionId].forEach(this._unwatch.bind(this, methodName));
				delete this[collectionId];
			}
		},

		_on: function (methodName, layers) {
			this._off(methodName);
			this[this._collectionId(methodName)] = layers;
		},

		_validateRestriction: function (methodName, evt) {
			var name = methodName.slice(4);

			if (this._featureGroup.isEmpty())
				return;

			var restrictionId = L.stamp(evt.target);

			if (!this._featureGroup.jsts[methodName](evt.target)) {

				if (!this._errors[methodName])
					this._errors[methodName] = [];

				if (this._errors[methodName].indexOf(restrictionId) === -1)
					this._errors[methodName].push(restrictionId);

				evt = {validation: name, targetLayer: this._featureGroup, restrictionLayer: evt.target};

				this.fire('invalid', evt);
				this.fireOnMap('draw:invalid', evt);
			} else {
				if (this._errors[methodName]) {
					var index = this._errors[methodName].indexOf(restrictionId);

					if (index > -1) {
						this._errors[methodName].splice(index, 1);

						if (this._errors[methodName].length === 0) {
							evt = {validation: name, targetLayer: this._featureGroup};
							this.fire('valid', evt);
							this.fireOnMap('draw:valid', evt);
						}
					}
				}
			}
		},

		_validateTarget: function(methodName) {
			var evt, valid = true, name = methodName.substring(4);

			if (this._errors[methodName] && this._errors[methodName].length)
				valid = false;

			this._errors[methodName] = [];

			if (this._featureGroup.isEmpty()) {
				if (!valid) {
					evt = {validation: name, targetLayer: this._featureGroup};
					this.fire('valid', evt);
					this.fireOnMap('draw:valid', evt);
				}

				return;
			}

			var restrictionLayers = this[this._collectionId(methodName)],
			method = this._featureGroup.jsts[methodName];

			if (restrictionLayers) {
				evt = {validation: name, targetLayer: this._featureGroup};

				restrictionLayers.forEach(function(restrictionLayer) {

					if (!method.call(this._featureGroup.jsts, restrictionLayer)) {

						this._errors[methodName].push(L.stamp(restrictionLayer));
						
						evt.restrictionLayer = restrictionLayer;

						this.fire('invalid', evt);
						this.fireOnMap('draw:invalid', evt);
					}

				}, this);

				if (!this._errors[methodName].length && !valid) {

					evt = {validation: name, targetLayer: this._featureGroup};
					this.fire('valid', evt);
					this.fireOnMap('draw:valid', evt);
				}
			}
		},

		_unwatch: function (methodName, featureGroup) {
			var watcher = this._getHandler(this._validateRestriction, methodName);

			featureGroup.off('layeradd', watcher);
			featureGroup.off('layerremove', watcher);
		},

		_unwatchMe: function (methodName) {
			this._featureGroup.off('layeradd layerremove', this._getHandler(this._validateTarget, methodName));
		},

		_watch: function (methodName, featureGroup) {

			var watcher = this._getHandler(this._validateRestriction, methodName);

			featureGroup.on('layeradd', watcher);
			featureGroup.on('layerremove', watcher);
		},

		_watchMe: function (methodName) {
			this._featureGroup.on('layeradd layerremove', this._getHandler(this._validateTarget, methodName));
		}

	});


	L.FeatureGroup.addInitHook(function () {
		if (!this.validation)
			this.validation = new L.FeatureGroup.Validation(this);

		if (!this.fix)
			this.fix = new L.FeatureGroup.Fixer(this.validation);
	});

})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkltcG9ydHMuanMiLCJTaGFwZVppcC5qcyIsIkwuRmVhdHVyZUdyb3VwLkVkaXQuanMiLCJMLkZlYXR1cmVHcm91cC5pc0VtcHR5LmpzIiwiTC5GZWF0dXJlR3JvdXAuRml4ZXIuanMiLCJMLkZlYXR1cmVHcm91cC5WYWxpZGF0aW9uLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2xJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDckVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImxlYWZsZXQuZHJhdy5wbHVzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiOyhmdW5jdGlvbigpIHtcblxuXHRpZiAoIUwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzKVxuXHRcdEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzID0ge307XG5cblx0TC5EcmF3LkltcG9ydHMgPSBMLkRyYXcuRmVhdHVyZS5leHRlbmQoe1xuXHRcdHN0YXRpY3M6IHtcblx0XHRcdEZPUk1BVFM6IFtdLFxuXHRcdFx0VFlQRTogJ2ltcG9ydHMnXG5cdFx0fSxcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uIChtYXAsIG9wdGlvbnMpIHtcblx0XHRcdHRoaXMudHlwZSA9IEwuRHJhdy5JbXBvcnRzLlRZUEU7XG5cblx0XHRcdEwuRHJhdy5GZWF0dXJlLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgbWFwLCBvcHRpb25zKTtcblx0XHR9LFxuXG5cdFx0Z2V0QWN0aW9uczogZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRyZXR1cm4gTC5EcmF3LkltcG9ydHMuRk9STUFUUy5tYXAoZnVuY3Rpb24oZm9ybWF0KSB7XG5cdFx0XHRcdHZhciBvd25FbGVtZW50ID0gbnVsbDtcblxuXHRcdFx0XHRpZiAoZm9ybWF0LmNyZWF0ZUFjdGlvbkVsZW1lbnQpXG5cdFx0XHRcdFx0b3duRWxlbWVudCA9IGZvcm1hdC5jcmVhdGVBY3Rpb25FbGVtZW50LmNhbGwodGhpcyk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHRpdGxlOiBmb3JtYXQudGl0bGUsXG5cdFx0XHRcdFx0dGV4dDogZm9ybWF0LnRleHQsXG5cdFx0XHRcdFx0Y2FsbGJhY2s6IGZvcm1hdC5jYWxsYmFjayxcblx0XHRcdFx0XHRjb250ZXh0OiB0aGlzLFxuXHRcdFx0XHRcdG93bkVsZW1lbnQ6IG93bkVsZW1lbnRcblx0XHRcdFx0fTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblx0fSk7XG5cbn0pKCk7IiwiOyhmdW5jdGlvbigpIHtcblxuXHRpZiAoIUwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwKSB7XG5cdFx0TC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXAgPSB7XG5cdFx0XHR0ZXh0OiAnSW1wb3J0IGEgc2hhcGVmaWxlIHppcCcsXG5cdFx0XHR0aXRsZTogJ1BsZWFzZSwgc2VsZWN0IGEgemlwIGZpbGUuJ1xuXHRcdH07XG5cdH1cblxuXHRTaHBaaXBGb3JtYXQgPSB7XG5cblx0XHRfaGFuZGxlcnM6IHt9LFxuXG5cdFx0X25leHRJZDogMSxcblxuXHRcdGNyZWF0ZU9wZW5CdXR0b246IGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGxpbmsgPSBMLkRvbVV0aWwuY3JlYXRlKCdhJyk7XG5cblx0XHRcdGxpbmsuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdFx0bGluay5pbm5lckhUTUwgPSBMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcC50ZXh0O1xuXHRcdFx0bGluay50aXRsZSA9IEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwLnRpdGxlO1xuXG5cdFx0XHR2YXIgaW5wdXQgPSBMLkRvbVV0aWwuY3JlYXRlKCdpbnB1dCcsICdsZWFmbGV0LWRyYXctZHJhdy1pbXBvcnRzLWFjdGlvbicsIGxpbmspO1xuXHRcdFx0aW5wdXQudHlwZSA9ICdmaWxlJztcblxuXHRcdFx0dmFyIGhhbmRsZXIgPSB0aGlzO1xuXG5cdFx0XHRpbnB1dC5vbmNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRTaHBaaXBGb3JtYXQuX29wZW5TaGFwZVppcChoYW5kbGVyLCBpbnB1dCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gbGluaztcblx0XHR9LFxuXG5cdFx0bm9wOiBmdW5jdGlvbigpIHt9LFxuXG5cdFx0X2dldFdvcmtlcjogZnVuY3Rpb24oKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3dvcmtlcikge1xuXHRcdFx0XHRpZiAoTC5EcmF3LkltcG9ydHMuU0hQSlNfVVJMKSB7XG5cblx0XHRcdFx0XHQvLyBObyBleHRlcm5hbCAuanMgc2NyaXB0XG5cdFx0XHRcdFx0dmFyIHNjcmlwdCA9IFwidHJ5IHsgaW1wb3J0U2NyaXB0cygnXCIgKyBMLkRyYXcuSW1wb3J0cy5TSFBKU19VUkwgKyBcIicpOyB9IGNhdGNoIChlKSB7Y29uc29sZS5lcnJvcihlKTsgdGhyb3cgZTt9XFxuXCIgK1xuXHRcdFx0XHRcdFwib25tZXNzYWdlID0gZnVuY3Rpb24oZSkge1xcblwiICtcblx0XHRcdFx0XHRcdFwiY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgU2hhcGVaaXAuLi4nKTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcInZhciBnZW9KU09OID0gc2hwLnBhcnNlWmlwKGUuZGF0YS5ieXRlQXJyYXkpO1xcblwiICtcblx0XHRcdFx0XHRcdFwiY29uc29sZS5sb2coJ1NoYXBlWmlwIHByb2Nlc3NlZCEnKTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcInBvc3RNZXNzYWdlKHtpZDogZS5kYXRhLmlkLCBnZW9KU09OOiBnZW9KU09OfSk7XFxuXCIgK1xuXHRcdFx0XHRcdFwifVwiO1xuXG5cdFx0XHRcdFx0dmFyIHVybERhdGEgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtzY3JpcHRdLCB7dHlwZTogXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCJ9KSk7XG5cdFx0XHRcdFx0dGhpcy5fd29ya2VyID0gbmV3IFdvcmtlcih1cmxEYXRhKTtcblxuXHRcdFx0XHRcdHRoaXMuX3dvcmtlci5vbm1lc3NhZ2UgPSB0aGlzLl9vbm1lc3NhZ2UuYmluZCh0aGlzKTtcblx0XHRcdFx0XHR0aGlzLl93b3JrZXIub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coYXJndW1lbnRzKTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05lZWQgc2hhcGVmaWxlLWpzIFVSTCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya2VyO1xuXHRcdH0sXG5cblx0XHRfb25tZXNzYWdlOiBmdW5jdGlvbihlKSB7XG5cdFx0XHR2YXIgZ2VvSlNPTiA9IGUuZGF0YS5nZW9KU09OO1xuXHRcdFx0dmFyIGhhbmRsZXIgPSB0aGlzLl9oYW5kbGVyc1tlLmRhdGEuaWRdO1xuXG5cdFx0XHQvLyBUT0RPOiBJcyBpdCBhbHdheXMgRmVhdHVyZUNvbGxlY3Rpb24/XG5cdFx0XHRcblx0XHRcdHZhciBwcm9wZXJ0aWVzLCBnZW9tZXRyeSwgbmV3RmVhdHVyZSwgaSwgbGF5ZXI7XG5cblx0XHRcdGdlb0pTT04uZmVhdHVyZXMuZm9yRWFjaChmdW5jdGlvbihmZWF0dXJlKSB7XG5cdFx0XHRcdHByb3BlcnRpZXMgPSBmZWF0dXJlLnByb3BlcnRpZXM7XG5cdFx0XHRcdGdlb21ldHJ5ID0gZmVhdHVyZS5nZW9tZXRyeTtcblxuXHRcdFx0XHRpZiAoZ2VvbWV0cnkudHlwZS5zdGFydHNXaXRoKFwiTXVsdGlcIikpIHtcblx0XHRcdFx0XHRmb3IgKGk9MDsgaSA8IGdlb21ldHJ5LmNvb3JkaW5hdGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRuZXdGZWF0dXJlID0ge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBnZW9tZXRyeS50eXBlLnN1YnN0cmluZyg1KSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczogcHJvcGVydGllcyxcblx0XHRcdFx0XHRcdFx0Y29vcmRpbmF0ZXM6IGdlb21ldHJ5LmNvb3JkaW5hdGVzW2ldXG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRsYXllciA9IEwuR2VvSlNPTi5nZW9tZXRyeVRvTGF5ZXIobmV3RmVhdHVyZSk7XG5cdFx0XHRcdFx0XHRoYW5kbGVyLl9maXJlQ3JlYXRlZEV2ZW50KGxheWVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGF5ZXIgPSBMLkdlb0pTT04uZ2VvbWV0cnlUb0xheWVyKGZlYXR1cmUpO1xuXHRcdFx0XHRcdGhhbmRsZXIuX2ZpcmVDcmVhdGVkRXZlbnQobGF5ZXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGFuZGxlci5kaXNhYmxlKCk7XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0X29wZW5TaGFwZVppcDogZnVuY3Rpb24oaGFuZGxlciwgaW5wdXQpIHtcblx0XHRcdGlmICghaW5wdXQuZmlsZXMgJiYgIWlucHV0LmZpbGVzWzBdKVxuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXG5cdFx0XHRyZWFkZXIub25sb2FkID0gZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0aWYgKHJlYWRlci5yZWFkeVN0YXRlICE9PSAyKVxuXHRcdFx0XHRcdHJldHVybjtcblxuXHRcdFx0XHRpZiAocmVhZGVyLnJlc3VsdCkge1xuXHRcdFx0XHRcdFNocFppcEZvcm1hdC5fcGFyc2UoaGFuZGxlciwgcmVhZGVyLnJlc3VsdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fTtcblxuXHRcdFx0aGFuZGxlci5fbWFwLmZpcmUoJ2RyYXc6aW1wb3J0c3RhcnQnKTtcblx0XHRcdHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihpbnB1dC5maWxlc1swXSk7XG5cdFx0fSxcblxuXHRcdF9wYXJzZTogZnVuY3Rpb24oaGFuZGxlciwgYnl0ZUFycmF5KSB7XG5cdFx0XHR2YXIgd29ya2VyID0gdGhpcy5fZ2V0V29ya2VyKCk7XG5cdFx0XHR2YXIgaWQgPSB0aGlzLl9uZXh0SWQrKztcblx0XHRcdHRoaXMuX2hhbmRsZXJzW2lkXSA9IGhhbmRsZXI7XG5cblx0XHRcdHdvcmtlci5wb3N0TWVzc2FnZSh7aWQ6IGlkLCBieXRlQXJyYXk6IGJ5dGVBcnJheX0sIFtieXRlQXJyYXldKTtcblx0XHR9LFxuXHR9O1xuXG5cdEwuRHJhdy5JbXBvcnRzLkZPUk1BVFMucHVzaCh7XG5cdFx0Y2FsbGJhY2s6IFNocFppcEZvcm1hdC5ub3AsXG5cdFx0Y3JlYXRlQWN0aW9uRWxlbWVudDogU2hwWmlwRm9ybWF0LmNyZWF0ZU9wZW5CdXR0b25cblxuXHR9KTtcbn0pKCk7IiwiKGZ1bmN0aW9uICgpIHtcblxuXHRMLkZlYXR1cmVHcm91cC5FZGl0ID0gTC5IYW5kbGVyLmV4dGVuZCh7XG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdHRoaXMuX2xheWVyID0gbGF5ZXI7XG5cdFx0fSxcblxuXHRcdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl9sYXllci5lYWNoTGF5ZXIodGhpcy5fZW5hYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vbignbGF5ZXJhZGQnLCB0aGlzLl9lbmFibGVFZGl0aW5nLCB0aGlzKTtcblx0XHRcdHRoaXMuX2xheWVyLm9uKCdsYXllcnJlbW92ZScsIHRoaXMuX2Rpc2FibGVFZGl0aW5nLCB0aGlzKTtcblx0XHR9LFxuXG5cdFx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuX2xheWVyLmVhY2hMYXllcih0aGlzLl9kaXNhYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vZmYoJ2xheWVyYWRkJywgdGhpcy5fZW5hYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vZmYoJ2xheWVycmVtb3ZlJywgdGhpcy5fZGlzYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdH0sXG5cblx0XHRfZW5hYmxlRWRpdGluZzogZnVuY3Rpb24gKGxheWVyKSB7XG5cdFx0XHRpZiAobGF5ZXIuZWRpdGluZylcblx0XHRcdFx0bGF5ZXIuZWRpdGluZy5lbmFibGUoKTtcblx0XHR9LFxuXG5cdFx0X2Rpc2FibGVFZGl0aW5nOiBmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdGlmIChsYXllci5lZGl0aW5nKVxuXHRcdFx0XHRsYXllci5lZGl0aW5nLmRpc2FibGUoKTtcblx0XHR9XG5cblx0fSk7XG5cblx0TC5GZWF0dXJlR3JvdXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xuXG5cdFx0aWYgKCF0aGlzLmVkaXRpbmcpXG5cdFx0XHR0aGlzLmVkaXRpbmcgPSBuZXcgTC5GZWF0dXJlR3JvdXAuRWRpdCh0aGlzKTtcblxuXHR9KTtcblxufSkoKTsiLCJMLkZlYXR1cmVHcm91cC5pbmNsdWRlKHtcblx0aXNFbXB0eTogZnVuY3Rpb24oKSB7XG5cblx0XHRmb3IgKHZhciBpZCBpbiB0aGlzLl9sYXllcnMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufSk7IiwiOyhmdW5jdGlvbiAoKSB7XG5cblx0dmFyIEZJWF9PUEVSQVRJT05TID0ge1xuXHRcdHdpdGhpbjoge1xuXHRcdFx0Y2hlY2s6ICdpbnRlcnNlY3RzJyxcblx0XHRcdGZpeDogWydpbnRlcnNlY3Rpb24nXVxuXHRcdH1cblx0fTtcblxuXHR2YXIgSlNUU19NRVRIT0RTID0ge1xuXHRcdHdpdGhpbjogJ3dpdGhpbidcblx0fTtcblxuXHRMLkZlYXR1cmVHcm91cC5GaXhlciA9IEwuQ2xhc3MuZXh0ZW5kKHtcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uICh2YWxpZGF0aW9uKSB7XG5cdFx0XHR0aGlzLl92YWxpZGF0aW9uID0gdmFsaWRhdGlvbjtcblx0XHR9LFxuXG5cdFx0d2l0aGluOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR2YXIgdmFsaWQgPSBzZWxmLl92YWxpZGF0aW9uLmlzVmFsaWQoSlNUU19NRVRIT0RTLndpdGhpbik7XG5cblx0XHRcdFx0aWYgKCF2YWxpZCkge1xuXHRcdFx0XHRcdHNlbGYuX2ZpeChKU1RTX01FVEhPRFMud2l0aGluLCBGSVhfT1BFUkFUSU9OUy53aXRoaW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0X2ZpeDogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIG9wZXJhdGlvbikge1xuXG5cblx0XHRcdGlmICghb3BlcmF0aW9uKVxuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdHZhciBjaGVja01ldGhvZCA9IG9wZXJhdGlvbi5jaGVjayxcblx0XHRcdGZpeE1ldGhvZHMgPSBvcGVyYXRpb24uZml4O1xuXG5cdFx0XHR0aGlzLl92YWxpZGF0aW9uLndhaXQobWV0aG9kTmFtZSwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHZhciBmZWF0dXJlR3JvdXAgPSB0aGlzLl92YWxpZGF0aW9uLmdldEZlYXR1cmVHcm91cCgpLFxuXHRcdFx0XHRyZXN0cmljdGlvbkxheWVycyA9IHRoaXMuX3ZhbGlkYXRpb24uZ2V0UmVzdHJpY3Rpb25MYXllcnMobWV0aG9kTmFtZSksXG5cdFx0XHRcdGZpeGVkTGF5ZXIsIGksIGZpeE1ldGhvZDtcblxuXHRcdFx0XHRmdW5jdGlvbiBmaXhMYXllciAobGF5ZXIsIHJlc3RyaWN0aW9uTGF5ZXIpIHtcblx0XHRcdFx0XHRpZiAobGF5ZXIuanN0c1tjaGVja01ldGhvZF0ocmVzdHJpY3Rpb25MYXllcikpIHtcblx0XHRcdFx0XHRcdGZvciAoaSA9IDA7IGkgPCBmaXhNZXRob2RzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGZpeE1ldGhvZCA9IGZpeE1ldGhvZHNbaV07XG5cblx0XHRcdFx0XHRcdFx0bGF5ZXIgPSBsYXllci5qc3RzW2ZpeE1ldGhvZF0ocmVzdHJpY3Rpb25MYXllcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGxheWVyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbihsYXllcikge1xuXHRcdFx0XHRcdGZpeGVkTGF5ZXIgPSByZXN0cmljdGlvbkxheWVycy5yZWR1Y2UoZml4TGF5ZXIsIGxheWVyKTtcblxuXHRcdFx0XHRcdGlmIChmaXhlZExheWVyICE9PSBsYXllcikge1xuXHRcdFx0XHRcdFx0ZmVhdHVyZUdyb3VwLnJlbW92ZUxheWVyKGxheWVyKTtcblx0XHRcdFx0XHRcdGZlYXR1cmVHcm91cC5hZGRMYXllcihmaXhlZExheWVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0XHRcblx0XHR9XG5cdH0pO1xuXG59KSgpOyIsIjsoZnVuY3Rpb24oKSB7XG5cblx0dmFyIEpTVFNfTUVUSE9EUyA9IHtcblx0XHRXaXRoaW46ICd3aXRoaW4nXG5cdH07XG5cblx0TC5GZWF0dXJlR3JvdXAuVmFsaWRhdGlvbiA9IEwuSGFuZGxlci5leHRlbmQoe1xuXG5cdFx0aW5jbHVkZXM6IEwuTWl4aW4uRXZlbnRzLFxuXG5cdFx0b3B0aW9uczoge1xuXG5cdFx0fSxcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uKGZlYXR1cmVHcm91cCkge1xuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwID0gZmVhdHVyZUdyb3VwO1xuXHRcdFx0dGhpcy5fYmluZGVkID0ge307XG5cdFx0XHR0aGlzLl9lcnJvcnMgPSB7fTtcblx0XHR9LFxuXG5cdFx0YWRkSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uSWQsIGNvbGxlY3Rpb24sIG1ldGhvZE5hbWU7XG5cblx0XHRcdGZvciAodmFyIG5hbWUgaW4gSlNUU19NRVRIT0RTKSB7XG5cblx0XHRcdFx0bWV0aG9kTmFtZSA9IEpTVFNfTUVUSE9EU1tuYW1lXTtcblxuXHRcdFx0XHRjb2xsZWN0aW9uSWQgPSB0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSk7XG5cdFx0XHRcdGNvbGxlY3Rpb24gPSB0aGlzW2NvbGxlY3Rpb25JZF07XG5cdFx0XHRcdGlmIChjb2xsZWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5mb3JFYWNoKHRoaXMuX3dhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fd2F0Y2hNZShtZXRob2ROYW1lKTtcblx0XHRcdH1cblxuXHRcdH0sXG5cblx0XHRnZXRSZXN0cmljdGlvbkxheWVyczogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uSWQgID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXHRcdFx0aWYgKHRoaXNbY29sbGVjdGlvbklkXSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpc1tjb2xsZWN0aW9uSWRdLnNsaWNlKDApO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRnZXRGZWF0dXJlR3JvdXA6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9mZWF0dXJlR3JvdXA7XG5cdFx0fSxcblxuXHRcdGlzVmFsaWQ6IGZ1bmN0aW9uKG1ldGhvZE5hbWUpIHtcblx0XHRcdGlmIChtZXRob2ROYW1lICYmIHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSkge1xuXHRcdFx0XHRyZXR1cm4gIXRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdGZpcmVPbk1hcDogZnVuY3Rpb24gKGV2ZW50TmFtZSwgZXZlbnQpIHtcblx0XHRcdGlmICh0aGlzLl9mZWF0dXJlR3JvdXAuX21hcClcblx0XHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLl9tYXAuZmlyZShldmVudE5hbWUsIGV2ZW50KTtcblx0XHR9LFxuXG5cdFx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uSWQsIGNvbGxlY3Rpb24sIG1ldGhvZE5hbWU7XG5cblx0XHRcdGZvciAodmFyIG5hbWUgaW4gSlNUU19NRVRIT0RTKSB7XG5cblx0XHRcdFx0bWV0aG9kTmFtZSA9IEpTVFNfTUVUSE9EU1tuYW1lXTtcblx0XHRcdFx0Y29sbGVjdGlvbklkID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXHRcdFx0XHRjb2xsZWN0aW9uID0gdGhpc1tjb2xsZWN0aW9uSWRdO1xuXG5cdFx0XHRcdGlmIChjb2xsZWN0aW9uKVxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uZm9yRWFjaCh0aGlzLl91bndhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXG5cdFx0XHRcdHRoaXMuX3Vud2F0Y2hNZShtZXRob2ROYW1lKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogRGlzYWJsZSB0ZW1wb3JhcmlseSBvbiB2YWxpZGF0aW9uIGFuZCBleGVjdXRlIGZuXG5cdFx0ICogQHBhcmFtICB7U3RyaW5nfSAgIG9wIHZhbGlkYXRpb24gbmFtZVxuXHRcdCAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiBcblx0XHQgKiBAcGFyYW0gIHtPYmplY3R9IGNvbnRleHQgdGhpc0FyZ1xuXHRcdCAqIEByZXR1cm4ge0FueX0gZm4gcmVzdWx0XG5cdFx0ICovXG5cdFx0d2FpdDogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGZuLCBjb250ZXh0KSB7XG5cblx0XHRcdHZhciBjb2xsZWN0aW9uSWQgPSB0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSk7XG5cblx0XHRcdGlmICh0aGlzW2NvbGxlY3Rpb25JZF0pIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzW2NvbGxlY3Rpb25JZF0uZm9yRWFjaCh0aGlzLl91bndhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHRcdHRoaXMuX3Vud2F0Y2hNZShtZXRob2ROYW1lKTtcblxuXHRcdFx0XHRcdHJldHVybiBmbi5jYWxsKGNvbnRleHQsIHRoaXMpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmVuYWJsZWQoKSkge1xuXHRcdFx0XHRcdFx0dGhpc1tjb2xsZWN0aW9uSWRdLmZvckVhY2godGhpcy5fd2F0Y2guYmluZCh0aGlzLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdFx0XHR0aGlzLl93YXRjaE1lKG1ldGhvZE5hbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHR3aXRoaW46IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuX29uKEpTVFNfTUVUSE9EUy5XaXRoaW4sIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCkpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblxuXHRcdF9jb2xsZWN0aW9uSWQ6IGZ1bmN0aW9uIChtZXRob2ROYW1lKSB7XG5cdFx0XHRyZXR1cm4gbWV0aG9kTmFtZSA/ICdfJyArIG1ldGhvZE5hbWUgKyAncycgOiBudWxsO1xuXHRcdH0sXG5cblx0XHRfZ2V0SGFuZGxlcjogZnVuY3Rpb24oaGFuZGxlciwgbWV0aG9kTmFtZSkge1xuXHRcdFx0dmFyIGlkID0gTC5zdGFtcChoYW5kbGVyKTtcblxuXHRcdFx0aWYgKCF0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV0pXG5cdFx0XHRcdHRoaXMuX2JpbmRlZFttZXRob2ROYW1lXSA9IHt9O1xuXG5cdFx0XHRpZiAoIXRoaXMuX2JpbmRlZFttZXRob2ROYW1lXVtpZF0pXG5cdFx0XHRcdHRoaXMuX2JpbmRlZFttZXRob2ROYW1lXVtpZF0gPSBoYW5kbGVyLmJpbmQodGhpcywgbWV0aG9kTmFtZSk7XG5cblx0XHRcdHJldHVybiB0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV1baWRdO1xuXHRcdH0sXG5cblx0XHRfb2ZmOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXHRcdFx0dmFyIGNvbGxlY3Rpb25JZCA9IHRoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKTtcblxuXHRcdFx0aWYgKHRoaXNbY29sbGVjdGlvbklkXSkge1xuXHRcdFx0XHR0aGlzW2NvbGxlY3Rpb25JZF0uZm9yRWFjaCh0aGlzLl91bndhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHRkZWxldGUgdGhpc1tjb2xsZWN0aW9uSWRdO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfb246IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBsYXllcnMpIHtcblx0XHRcdHRoaXMuX29mZihtZXRob2ROYW1lKTtcblx0XHRcdHRoaXNbdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpXSA9IGxheWVycztcblx0XHR9LFxuXG5cdFx0X3ZhbGlkYXRlUmVzdHJpY3Rpb246IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblx0XHRcdHZhciBuYW1lID0gbWV0aG9kTmFtZS5zbGljZSg0KTtcblxuXHRcdFx0aWYgKHRoaXMuX2ZlYXR1cmVHcm91cC5pc0VtcHR5KCkpXG5cdFx0XHRcdHJldHVybjtcblxuXHRcdFx0dmFyIHJlc3RyaWN0aW9uSWQgPSBMLnN0YW1wKGV2dC50YXJnZXQpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX2ZlYXR1cmVHcm91cC5qc3RzW21ldGhvZE5hbWVdKGV2dC50YXJnZXQpKSB7XG5cblx0XHRcdFx0aWYgKCF0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0pXG5cdFx0XHRcdFx0dGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdID0gW107XG5cblx0XHRcdFx0aWYgKHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5pbmRleE9mKHJlc3RyaWN0aW9uSWQpID09PSAtMSlcblx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ucHVzaChyZXN0cmljdGlvbklkKTtcblxuXHRcdFx0XHRldnQgPSB7dmFsaWRhdGlvbjogbmFtZSwgdGFyZ2V0TGF5ZXI6IHRoaXMuX2ZlYXR1cmVHcm91cCwgcmVzdHJpY3Rpb25MYXllcjogZXZ0LnRhcmdldH07XG5cblx0XHRcdFx0dGhpcy5maXJlKCdpbnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6aW52YWxpZCcsIGV2dCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdKSB7XG5cdFx0XHRcdFx0dmFyIGluZGV4ID0gdGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLmluZGV4T2YocmVzdHJpY3Rpb25JZCk7XG5cblx0XHRcdFx0XHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLnNwbGljZShpbmRleCwgMSk7XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBuYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwfTtcblx0XHRcdFx0XHRcdFx0dGhpcy5maXJlKCd2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X3ZhbGlkYXRlVGFyZ2V0OiBmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0XHR2YXIgZXZ0LCB2YWxpZCA9IHRydWUsIG5hbWUgPSBtZXRob2ROYW1lLnN1YnN0cmluZyg0KTtcblxuXHRcdFx0aWYgKHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSAmJiB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoKVxuXHRcdFx0XHR2YWxpZCA9IGZhbHNlO1xuXG5cdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0gPSBbXTtcblxuXHRcdFx0aWYgKHRoaXMuX2ZlYXR1cmVHcm91cC5pc0VtcHR5KCkpIHtcblx0XHRcdFx0aWYgKCF2YWxpZCkge1xuXHRcdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBuYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwfTtcblx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzp2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHZhciByZXN0cmljdGlvbkxheWVycyA9IHRoaXNbdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpXSxcblx0XHRcdG1ldGhvZCA9IHRoaXMuX2ZlYXR1cmVHcm91cC5qc3RzW21ldGhvZE5hbWVdO1xuXG5cdFx0XHRpZiAocmVzdHJpY3Rpb25MYXllcnMpIHtcblx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXG5cdFx0XHRcdHJlc3RyaWN0aW9uTGF5ZXJzLmZvckVhY2goZnVuY3Rpb24ocmVzdHJpY3Rpb25MYXllcikge1xuXG5cdFx0XHRcdFx0aWYgKCFtZXRob2QuY2FsbCh0aGlzLl9mZWF0dXJlR3JvdXAuanN0cywgcmVzdHJpY3Rpb25MYXllcikpIHtcblxuXHRcdFx0XHRcdFx0dGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLnB1c2goTC5zdGFtcChyZXN0cmljdGlvbkxheWVyKSk7XG5cdFx0XHRcdFx0XHRcblx0XHRcdFx0XHRcdGV2dC5yZXN0cmljdGlvbkxheWVyID0gcmVzdHJpY3Rpb25MYXllcjtcblxuXHRcdFx0XHRcdFx0dGhpcy5maXJlKCdpbnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OmludmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGggJiYgIXZhbGlkKSB7XG5cblx0XHRcdFx0XHRldnQgPSB7dmFsaWRhdGlvbjogbmFtZSwgdGFyZ2V0TGF5ZXI6IHRoaXMuX2ZlYXR1cmVHcm91cH07XG5cdFx0XHRcdFx0dGhpcy5maXJlKCd2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6dmFsaWQnLCBldnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF91bndhdGNoOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZmVhdHVyZUdyb3VwKSB7XG5cdFx0XHR2YXIgd2F0Y2hlciA9IHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVSZXN0cmljdGlvbiwgbWV0aG9kTmFtZSk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5vZmYoJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcnJlbW92ZScsIHdhdGNoZXIpO1xuXHRcdH0sXG5cblx0XHRfdW53YXRjaE1lOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLm9mZignbGF5ZXJhZGQgbGF5ZXJyZW1vdmUnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlVGFyZ2V0LCBtZXRob2ROYW1lKSk7XG5cdFx0fSxcblxuXHRcdF93YXRjaDogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGZlYXR1cmVHcm91cCkge1xuXG5cdFx0XHR2YXIgd2F0Y2hlciA9IHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVSZXN0cmljdGlvbiwgbWV0aG9kTmFtZSk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5vbignbGF5ZXJhZGQnLCB3YXRjaGVyKTtcblx0XHRcdGZlYXR1cmVHcm91cC5vbignbGF5ZXJyZW1vdmUnLCB3YXRjaGVyKTtcblx0XHR9LFxuXG5cdFx0X3dhdGNoTWU6IGZ1bmN0aW9uIChtZXRob2ROYW1lKSB7XG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkIGxheWVycmVtb3ZlJywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZVRhcmdldCwgbWV0aG9kTmFtZSkpO1xuXHRcdH1cblxuXHR9KTtcblxuXG5cdEwuRmVhdHVyZUdyb3VwLmFkZEluaXRIb29rKGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXRoaXMudmFsaWRhdGlvbilcblx0XHRcdHRoaXMudmFsaWRhdGlvbiA9IG5ldyBMLkZlYXR1cmVHcm91cC5WYWxpZGF0aW9uKHRoaXMpO1xuXG5cdFx0aWYgKCF0aGlzLmZpeClcblx0XHRcdHRoaXMuZml4ID0gbmV3IEwuRmVhdHVyZUdyb3VwLkZpeGVyKHRoaXMudmFsaWRhdGlvbik7XG5cdH0pO1xuXG59KSgpOyJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
