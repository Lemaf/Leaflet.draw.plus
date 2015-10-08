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
			check: 'jstsIntersects',
			fix: ['jstsIntersection']
		}
	};

	var JSTS_METHODS = {
		within: 'jstsWithin'
	};

	L.FeatureGroup.Fixer = L.Class.extend({

		initialize: function (validation) {
			this._validation = validation;
		},

		within: function () {
			var valid = this._validation.isValid(JSTS_METHODS.within);

			if (!valid) {
				this._fix(JSTS_METHODS.within, FIX_OPERATIONS.within);
			}
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
					if (layer[checkMethod](restrictionLayer)) {
						for (i = 0; i < fixMethods.length; i++) {
							fixMethod = fixMethods[i];

							layer = layer[fixMethod](restrictionLayer);
						}
					}

					return layer;
				}

				featureGroup.eachLayer(function(layer) {
					if (layer[checkMethod]) {
						fixedLayer = restrictionLayers.reduce(fixLayer, layer);

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
		Within: 'jstsWithin'
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

			if (!this._featureGroup[methodName](evt.target)) {

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
			method = this._featureGroup[methodName];

			if (restrictionLayers) {
				evt = {validation: name, targetLayer: this._featureGroup};

				restrictionLayers.forEach(function(restrictionLayer) {

					if (!method.call(this._featureGroup, restrictionLayer)) {

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkltcG9ydHMuanMiLCJTaGFwZVppcC5qcyIsIkwuRmVhdHVyZUdyb3VwLkVkaXQuanMiLCJMLkZlYXR1cmVHcm91cC5pc0VtcHR5LmpzIiwiTC5GZWF0dXJlR3JvdXAuRml4ZXIuanMiLCJMLkZlYXR1cmVHcm91cC5WYWxpZGF0aW9uLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2xJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImxlYWZsZXQuZHJhdy5wbHVzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiOyhmdW5jdGlvbigpIHtcblxuXHRpZiAoIUwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzKVxuXHRcdEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzID0ge307XG5cblx0TC5EcmF3LkltcG9ydHMgPSBMLkRyYXcuRmVhdHVyZS5leHRlbmQoe1xuXHRcdHN0YXRpY3M6IHtcblx0XHRcdEZPUk1BVFM6IFtdLFxuXHRcdFx0VFlQRTogJ2ltcG9ydHMnXG5cdFx0fSxcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uIChtYXAsIG9wdGlvbnMpIHtcblx0XHRcdHRoaXMudHlwZSA9IEwuRHJhdy5JbXBvcnRzLlRZUEU7XG5cblx0XHRcdEwuRHJhdy5GZWF0dXJlLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgbWFwLCBvcHRpb25zKTtcblx0XHR9LFxuXG5cdFx0Z2V0QWN0aW9uczogZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRyZXR1cm4gTC5EcmF3LkltcG9ydHMuRk9STUFUUy5tYXAoZnVuY3Rpb24oZm9ybWF0KSB7XG5cdFx0XHRcdHZhciBvd25FbGVtZW50ID0gbnVsbDtcblxuXHRcdFx0XHRpZiAoZm9ybWF0LmNyZWF0ZUFjdGlvbkVsZW1lbnQpXG5cdFx0XHRcdFx0b3duRWxlbWVudCA9IGZvcm1hdC5jcmVhdGVBY3Rpb25FbGVtZW50LmNhbGwodGhpcyk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHRpdGxlOiBmb3JtYXQudGl0bGUsXG5cdFx0XHRcdFx0dGV4dDogZm9ybWF0LnRleHQsXG5cdFx0XHRcdFx0Y2FsbGJhY2s6IGZvcm1hdC5jYWxsYmFjayxcblx0XHRcdFx0XHRjb250ZXh0OiB0aGlzLFxuXHRcdFx0XHRcdG93bkVsZW1lbnQ6IG93bkVsZW1lbnRcblx0XHRcdFx0fTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblx0fSk7XG5cbn0pKCk7IiwiOyhmdW5jdGlvbigpIHtcblxuXHRpZiAoIUwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwKSB7XG5cdFx0TC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXAgPSB7XG5cdFx0XHR0ZXh0OiAnSW1wb3J0IGEgc2hhcGVmaWxlIHppcCcsXG5cdFx0XHR0aXRsZTogJ1BsZWFzZSwgc2VsZWN0IGEgemlwIGZpbGUuJ1xuXHRcdH07XG5cdH1cblxuXHRTaHBaaXBGb3JtYXQgPSB7XG5cblx0XHRfaGFuZGxlcnM6IHt9LFxuXG5cdFx0X25leHRJZDogMSxcblxuXHRcdGNyZWF0ZU9wZW5CdXR0b246IGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGxpbmsgPSBMLkRvbVV0aWwuY3JlYXRlKCdhJyk7XG5cblx0XHRcdGxpbmsuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdFx0bGluay5pbm5lckhUTUwgPSBMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcC50ZXh0O1xuXHRcdFx0bGluay50aXRsZSA9IEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwLnRpdGxlO1xuXG5cdFx0XHR2YXIgaW5wdXQgPSBMLkRvbVV0aWwuY3JlYXRlKCdpbnB1dCcsICdsZWFmbGV0LWRyYXctZHJhdy1pbXBvcnRzLWFjdGlvbicsIGxpbmspO1xuXHRcdFx0aW5wdXQudHlwZSA9ICdmaWxlJztcblxuXHRcdFx0dmFyIGhhbmRsZXIgPSB0aGlzO1xuXG5cdFx0XHRpbnB1dC5vbmNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRTaHBaaXBGb3JtYXQuX29wZW5TaGFwZVppcChoYW5kbGVyLCBpbnB1dCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gbGluaztcblx0XHR9LFxuXG5cdFx0bm9wOiBmdW5jdGlvbigpIHt9LFxuXG5cdFx0X2dldFdvcmtlcjogZnVuY3Rpb24oKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3dvcmtlcikge1xuXHRcdFx0XHRpZiAoTC5EcmF3LkltcG9ydHMuU0hQSlNfVVJMKSB7XG5cblx0XHRcdFx0XHQvLyBObyBleHRlcm5hbCAuanMgc2NyaXB0XG5cdFx0XHRcdFx0dmFyIHNjcmlwdCA9IFwidHJ5IHsgaW1wb3J0U2NyaXB0cygnXCIgKyBMLkRyYXcuSW1wb3J0cy5TSFBKU19VUkwgKyBcIicpOyB9IGNhdGNoIChlKSB7Y29uc29sZS5lcnJvcihlKTsgdGhyb3cgZTt9XFxuXCIgK1xuXHRcdFx0XHRcdFwib25tZXNzYWdlID0gZnVuY3Rpb24oZSkge1xcblwiICtcblx0XHRcdFx0XHRcdFwiY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgU2hhcGVaaXAuLi4nKTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcInZhciBnZW9KU09OID0gc2hwLnBhcnNlWmlwKGUuZGF0YS5ieXRlQXJyYXkpO1xcblwiICtcblx0XHRcdFx0XHRcdFwiY29uc29sZS5sb2coJ1NoYXBlWmlwIHByb2Nlc3NlZCEnKTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcInBvc3RNZXNzYWdlKHtpZDogZS5kYXRhLmlkLCBnZW9KU09OOiBnZW9KU09OfSk7XFxuXCIgK1xuXHRcdFx0XHRcdFwifVwiO1xuXG5cdFx0XHRcdFx0dmFyIHVybERhdGEgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtzY3JpcHRdLCB7dHlwZTogXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCJ9KSk7XG5cdFx0XHRcdFx0dGhpcy5fd29ya2VyID0gbmV3IFdvcmtlcih1cmxEYXRhKTtcblxuXHRcdFx0XHRcdHRoaXMuX3dvcmtlci5vbm1lc3NhZ2UgPSB0aGlzLl9vbm1lc3NhZ2UuYmluZCh0aGlzKTtcblx0XHRcdFx0XHR0aGlzLl93b3JrZXIub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coYXJndW1lbnRzKTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05lZWQgc2hhcGVmaWxlLWpzIFVSTCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya2VyO1xuXHRcdH0sXG5cblx0XHRfb25tZXNzYWdlOiBmdW5jdGlvbihlKSB7XG5cdFx0XHR2YXIgZ2VvSlNPTiA9IGUuZGF0YS5nZW9KU09OO1xuXHRcdFx0dmFyIGhhbmRsZXIgPSB0aGlzLl9oYW5kbGVyc1tlLmRhdGEuaWRdO1xuXG5cdFx0XHQvLyBUT0RPOiBJcyBpdCBhbHdheXMgRmVhdHVyZUNvbGxlY3Rpb24/XG5cdFx0XHRcblx0XHRcdHZhciBwcm9wZXJ0aWVzLCBnZW9tZXRyeSwgbmV3RmVhdHVyZSwgaSwgbGF5ZXI7XG5cblx0XHRcdGdlb0pTT04uZmVhdHVyZXMuZm9yRWFjaChmdW5jdGlvbihmZWF0dXJlKSB7XG5cdFx0XHRcdHByb3BlcnRpZXMgPSBmZWF0dXJlLnByb3BlcnRpZXM7XG5cdFx0XHRcdGdlb21ldHJ5ID0gZmVhdHVyZS5nZW9tZXRyeTtcblxuXHRcdFx0XHRpZiAoZ2VvbWV0cnkudHlwZS5zdGFydHNXaXRoKFwiTXVsdGlcIikpIHtcblx0XHRcdFx0XHRmb3IgKGk9MDsgaSA8IGdlb21ldHJ5LmNvb3JkaW5hdGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRuZXdGZWF0dXJlID0ge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBnZW9tZXRyeS50eXBlLnN1YnN0cmluZyg1KSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczogcHJvcGVydGllcyxcblx0XHRcdFx0XHRcdFx0Y29vcmRpbmF0ZXM6IGdlb21ldHJ5LmNvb3JkaW5hdGVzW2ldXG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRsYXllciA9IEwuR2VvSlNPTi5nZW9tZXRyeVRvTGF5ZXIobmV3RmVhdHVyZSk7XG5cdFx0XHRcdFx0XHRoYW5kbGVyLl9maXJlQ3JlYXRlZEV2ZW50KGxheWVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGF5ZXIgPSBMLkdlb0pTT04uZ2VvbWV0cnlUb0xheWVyKGZlYXR1cmUpO1xuXHRcdFx0XHRcdGhhbmRsZXIuX2ZpcmVDcmVhdGVkRXZlbnQobGF5ZXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGFuZGxlci5kaXNhYmxlKCk7XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0X29wZW5TaGFwZVppcDogZnVuY3Rpb24oaGFuZGxlciwgaW5wdXQpIHtcblx0XHRcdGlmICghaW5wdXQuZmlsZXMgJiYgIWlucHV0LmZpbGVzWzBdKVxuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXG5cdFx0XHRyZWFkZXIub25sb2FkID0gZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0aWYgKHJlYWRlci5yZWFkeVN0YXRlICE9PSAyKVxuXHRcdFx0XHRcdHJldHVybjtcblxuXHRcdFx0XHRpZiAocmVhZGVyLnJlc3VsdCkge1xuXHRcdFx0XHRcdFNocFppcEZvcm1hdC5fcGFyc2UoaGFuZGxlciwgcmVhZGVyLnJlc3VsdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fTtcblxuXHRcdFx0aGFuZGxlci5fbWFwLmZpcmUoJ2RyYXc6aW1wb3J0c3RhcnQnKTtcblx0XHRcdHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihpbnB1dC5maWxlc1swXSk7XG5cdFx0fSxcblxuXHRcdF9wYXJzZTogZnVuY3Rpb24oaGFuZGxlciwgYnl0ZUFycmF5KSB7XG5cdFx0XHR2YXIgd29ya2VyID0gdGhpcy5fZ2V0V29ya2VyKCk7XG5cdFx0XHR2YXIgaWQgPSB0aGlzLl9uZXh0SWQrKztcblx0XHRcdHRoaXMuX2hhbmRsZXJzW2lkXSA9IGhhbmRsZXI7XG5cblx0XHRcdHdvcmtlci5wb3N0TWVzc2FnZSh7aWQ6IGlkLCBieXRlQXJyYXk6IGJ5dGVBcnJheX0sIFtieXRlQXJyYXldKTtcblx0XHR9LFxuXHR9O1xuXG5cdEwuRHJhdy5JbXBvcnRzLkZPUk1BVFMucHVzaCh7XG5cdFx0Y2FsbGJhY2s6IFNocFppcEZvcm1hdC5ub3AsXG5cdFx0Y3JlYXRlQWN0aW9uRWxlbWVudDogU2hwWmlwRm9ybWF0LmNyZWF0ZU9wZW5CdXR0b25cblxuXHR9KTtcbn0pKCk7IiwiKGZ1bmN0aW9uICgpIHtcblxuXHRMLkZlYXR1cmVHcm91cC5FZGl0ID0gTC5IYW5kbGVyLmV4dGVuZCh7XG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdHRoaXMuX2xheWVyID0gbGF5ZXI7XG5cdFx0fSxcblxuXHRcdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl9sYXllci5lYWNoTGF5ZXIodGhpcy5fZW5hYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vbignbGF5ZXJhZGQnLCB0aGlzLl9lbmFibGVFZGl0aW5nLCB0aGlzKTtcblx0XHRcdHRoaXMuX2xheWVyLm9uKCdsYXllcnJlbW92ZScsIHRoaXMuX2Rpc2FibGVFZGl0aW5nLCB0aGlzKTtcblx0XHR9LFxuXG5cdFx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuX2xheWVyLmVhY2hMYXllcih0aGlzLl9kaXNhYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vZmYoJ2xheWVyYWRkJywgdGhpcy5fZW5hYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vZmYoJ2xheWVycmVtb3ZlJywgdGhpcy5fZGlzYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdH0sXG5cblx0XHRfZW5hYmxlRWRpdGluZzogZnVuY3Rpb24gKGxheWVyKSB7XG5cdFx0XHRpZiAobGF5ZXIuZWRpdGluZylcblx0XHRcdFx0bGF5ZXIuZWRpdGluZy5lbmFibGUoKTtcblx0XHR9LFxuXG5cdFx0X2Rpc2FibGVFZGl0aW5nOiBmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdGlmIChsYXllci5lZGl0aW5nKVxuXHRcdFx0XHRsYXllci5lZGl0aW5nLmRpc2FibGUoKTtcblx0XHR9XG5cblx0fSk7XG5cblx0TC5GZWF0dXJlR3JvdXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xuXG5cdFx0aWYgKCF0aGlzLmVkaXRpbmcpXG5cdFx0XHR0aGlzLmVkaXRpbmcgPSBuZXcgTC5GZWF0dXJlR3JvdXAuRWRpdCh0aGlzKTtcblxuXHR9KTtcblxufSkoKTsiLCJMLkZlYXR1cmVHcm91cC5pbmNsdWRlKHtcblx0aXNFbXB0eTogZnVuY3Rpb24oKSB7XG5cblx0XHRmb3IgKHZhciBpZCBpbiB0aGlzLl9sYXllcnMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufSk7IiwiOyhmdW5jdGlvbiAoKSB7XG5cblx0dmFyIEZJWF9PUEVSQVRJT05TID0ge1xuXHRcdHdpdGhpbjoge1xuXHRcdFx0Y2hlY2s6ICdqc3RzSW50ZXJzZWN0cycsXG5cdFx0XHRmaXg6IFsnanN0c0ludGVyc2VjdGlvbiddXG5cdFx0fVxuXHR9O1xuXG5cdHZhciBKU1RTX01FVEhPRFMgPSB7XG5cdFx0d2l0aGluOiAnanN0c1dpdGhpbidcblx0fTtcblxuXHRMLkZlYXR1cmVHcm91cC5GaXhlciA9IEwuQ2xhc3MuZXh0ZW5kKHtcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uICh2YWxpZGF0aW9uKSB7XG5cdFx0XHR0aGlzLl92YWxpZGF0aW9uID0gdmFsaWRhdGlvbjtcblx0XHR9LFxuXG5cdFx0d2l0aGluOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgdmFsaWQgPSB0aGlzLl92YWxpZGF0aW9uLmlzVmFsaWQoSlNUU19NRVRIT0RTLndpdGhpbik7XG5cblx0XHRcdGlmICghdmFsaWQpIHtcblx0XHRcdFx0dGhpcy5fZml4KEpTVFNfTUVUSE9EUy53aXRoaW4sIEZJWF9PUEVSQVRJT05TLndpdGhpbik7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9maXg6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBvcGVyYXRpb24pIHtcblxuXG5cdFx0XHRpZiAoIW9wZXJhdGlvbilcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHR2YXIgY2hlY2tNZXRob2QgPSBvcGVyYXRpb24uY2hlY2ssXG5cdFx0XHRmaXhNZXRob2RzID0gb3BlcmF0aW9uLmZpeDtcblxuXHRcdFx0dGhpcy5fdmFsaWRhdGlvbi53YWl0KG1ldGhvZE5hbWUsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR2YXIgZmVhdHVyZUdyb3VwID0gdGhpcy5fdmFsaWRhdGlvbi5nZXRGZWF0dXJlR3JvdXAoKSxcblx0XHRcdFx0cmVzdHJpY3Rpb25MYXllcnMgPSB0aGlzLl92YWxpZGF0aW9uLmdldFJlc3RyaWN0aW9uTGF5ZXJzKG1ldGhvZE5hbWUpLFxuXHRcdFx0XHRmaXhlZExheWVyLCBpLCBmaXhNZXRob2Q7XG5cblx0XHRcdFx0ZnVuY3Rpb24gZml4TGF5ZXIgKGxheWVyLCByZXN0cmljdGlvbkxheWVyKSB7XG5cdFx0XHRcdFx0aWYgKGxheWVyW2NoZWNrTWV0aG9kXShyZXN0cmljdGlvbkxheWVyKSkge1xuXHRcdFx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IGZpeE1ldGhvZHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0Zml4TWV0aG9kID0gZml4TWV0aG9kc1tpXTtcblxuXHRcdFx0XHRcdFx0XHRsYXllciA9IGxheWVyW2ZpeE1ldGhvZF0ocmVzdHJpY3Rpb25MYXllcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGxheWVyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbihsYXllcikge1xuXHRcdFx0XHRcdGlmIChsYXllcltjaGVja01ldGhvZF0pIHtcblx0XHRcdFx0XHRcdGZpeGVkTGF5ZXIgPSByZXN0cmljdGlvbkxheWVycy5yZWR1Y2UoZml4TGF5ZXIsIGxheWVyKTtcblxuXHRcdFx0XHRcdFx0ZmVhdHVyZUdyb3VwLnJlbW92ZUxheWVyKGxheWVyKTtcblx0XHRcdFx0XHRcdGZlYXR1cmVHcm91cC5hZGRMYXllcihmaXhlZExheWVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0XHRcblx0XHR9XG5cdH0pO1xuXG59KSgpOyIsIjsoZnVuY3Rpb24oKSB7XG5cblx0dmFyIEpTVFNfTUVUSE9EUyA9IHtcblx0XHRXaXRoaW46ICdqc3RzV2l0aGluJ1xuXHR9O1xuXG5cdEwuRmVhdHVyZUdyb3VwLlZhbGlkYXRpb24gPSBMLkhhbmRsZXIuZXh0ZW5kKHtcblxuXHRcdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcblxuXHRcdG9wdGlvbnM6IHtcblxuXHRcdH0sXG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbihmZWF0dXJlR3JvdXApIHtcblx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cCA9IGZlYXR1cmVHcm91cDtcblx0XHRcdHRoaXMuX2JpbmRlZCA9IHt9O1xuXHRcdFx0dGhpcy5fZXJyb3JzID0ge307XG5cdFx0fSxcblxuXHRcdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbklkLCBjb2xsZWN0aW9uLCBtZXRob2ROYW1lO1xuXG5cdFx0XHRmb3IgKHZhciBuYW1lIGluIEpTVFNfTUVUSE9EUykge1xuXG5cdFx0XHRcdG1ldGhvZE5hbWUgPSBKU1RTX01FVEhPRFNbbmFtZV07XG5cblx0XHRcdFx0Y29sbGVjdGlvbklkID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXHRcdFx0XHRjb2xsZWN0aW9uID0gdGhpc1tjb2xsZWN0aW9uSWRdO1xuXHRcdFx0XHRpZiAoY29sbGVjdGlvbikge1xuXHRcdFx0XHRcdGNvbGxlY3Rpb24uZm9yRWFjaCh0aGlzLl93YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX3dhdGNoTWUobWV0aG9kTmFtZSk7XG5cdFx0XHR9XG5cblx0XHR9LFxuXG5cdFx0Z2V0UmVzdHJpY3Rpb25MYXllcnM6IGZ1bmN0aW9uIChtZXRob2ROYW1lKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbklkICA9IHRoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKTtcblx0XHRcdGlmICh0aGlzW2NvbGxlY3Rpb25JZF0pIHtcblx0XHRcdFx0cmV0dXJuIHRoaXNbY29sbGVjdGlvbklkXS5zbGljZSgwKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0Z2V0RmVhdHVyZUdyb3VwOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmVhdHVyZUdyb3VwO1xuXHRcdH0sXG5cblx0XHRpc1ZhbGlkOiBmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0XHRpZiAobWV0aG9kTmFtZSAmJiB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0pIHtcblx0XHRcdFx0cmV0dXJuICF0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRmaXJlT25NYXA6IGZ1bmN0aW9uIChldmVudE5hbWUsIGV2ZW50KSB7XG5cdFx0XHRpZiAodGhpcy5fZmVhdHVyZUdyb3VwLl9tYXApXG5cdFx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cC5fbWFwLmZpcmUoZXZlbnROYW1lLCBldmVudCk7XG5cdFx0fSxcblxuXHRcdHJlbW92ZUhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbklkLCBjb2xsZWN0aW9uLCBtZXRob2ROYW1lO1xuXG5cdFx0XHRmb3IgKHZhciBuYW1lIGluIEpTVFNfTUVUSE9EUykge1xuXG5cdFx0XHRcdG1ldGhvZE5hbWUgPSBKU1RTX01FVEhPRFNbbmFtZV07XG5cdFx0XHRcdGNvbGxlY3Rpb25JZCA9IHRoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKTtcblx0XHRcdFx0Y29sbGVjdGlvbiA9IHRoaXNbY29sbGVjdGlvbklkXTtcblxuXHRcdFx0XHRpZiAoY29sbGVjdGlvbilcblx0XHRcdFx0XHRjb2xsZWN0aW9uLmZvckVhY2godGhpcy5fdW53YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblxuXHRcdFx0XHR0aGlzLl91bndhdGNoTWUobWV0aG9kTmFtZSk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIERpc2FibGUgdGVtcG9yYXJpbHkgb24gdmFsaWRhdGlvbiBhbmQgZXhlY3V0ZSBmblxuXHRcdCAqIEBwYXJhbSAge1N0cmluZ30gICBvcCB2YWxpZGF0aW9uIG5hbWVcblx0XHQgKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gXG5cdFx0ICogQHBhcmFtICB7T2JqZWN0fSBjb250ZXh0IHRoaXNBcmdcblx0XHQgKiBAcmV0dXJuIHtBbnl9IGZuIHJlc3VsdFxuXHRcdCAqL1xuXHRcdHdhaXQ6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBmbiwgY29udGV4dCkge1xuXG5cdFx0XHR2YXIgY29sbGVjdGlvbklkID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRpZiAodGhpc1tjb2xsZWN0aW9uSWRdKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dGhpc1tjb2xsZWN0aW9uSWRdLmZvckVhY2godGhpcy5fdW53YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblx0XHRcdFx0XHR0aGlzLl91bndhdGNoTWUobWV0aG9kTmFtZSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gZm4uY2FsbChjb250ZXh0LCB0aGlzKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRpZiAodGhpcy5lbmFibGVkKCkpIHtcblx0XHRcdFx0XHRcdHRoaXNbY29sbGVjdGlvbklkXS5mb3JFYWNoKHRoaXMuX3dhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fd2F0Y2hNZShtZXRob2ROYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0d2l0aGluOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl9vbihKU1RTX01FVEhPRFMuV2l0aGluLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0sXG5cblx0XHRfY29sbGVjdGlvbklkOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXHRcdFx0cmV0dXJuIG1ldGhvZE5hbWUgPyAnXycgKyBtZXRob2ROYW1lICsgJ3MnIDogbnVsbDtcblx0XHR9LFxuXG5cdFx0X2dldEhhbmRsZXI6IGZ1bmN0aW9uKGhhbmRsZXIsIG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBpZCA9IEwuc3RhbXAoaGFuZGxlcik7XG5cblx0XHRcdGlmICghdGhpcy5fYmluZGVkW21ldGhvZE5hbWVdKVxuXHRcdFx0XHR0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV0gPSB7fTtcblxuXHRcdFx0aWYgKCF0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV1baWRdKVxuXHRcdFx0XHR0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV1baWRdID0gaGFuZGxlci5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5fYmluZGVkW21ldGhvZE5hbWVdW2lkXTtcblx0XHR9LFxuXG5cdFx0X29mZjogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uSWQgPSB0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSk7XG5cblx0XHRcdGlmICh0aGlzW2NvbGxlY3Rpb25JZF0pIHtcblx0XHRcdFx0dGhpc1tjb2xsZWN0aW9uSWRdLmZvckVhY2godGhpcy5fdW53YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblx0XHRcdFx0ZGVsZXRlIHRoaXNbY29sbGVjdGlvbklkXTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X29uOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgbGF5ZXJzKSB7XG5cdFx0XHR0aGlzLl9vZmYobWV0aG9kTmFtZSk7XG5cdFx0XHR0aGlzW3RoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKV0gPSBsYXllcnM7XG5cdFx0fSxcblxuXHRcdF92YWxpZGF0ZVJlc3RyaWN0aW9uOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZXZ0KSB7XG5cdFx0XHR2YXIgbmFtZSA9IG1ldGhvZE5hbWUuc2xpY2UoNCk7XG5cblx0XHRcdGlmICh0aGlzLl9mZWF0dXJlR3JvdXAuaXNFbXB0eSgpKVxuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdHZhciByZXN0cmljdGlvbklkID0gTC5zdGFtcChldnQudGFyZ2V0KTtcblxuXHRcdFx0aWYgKCF0aGlzLl9mZWF0dXJlR3JvdXBbbWV0aG9kTmFtZV0oZXZ0LnRhcmdldCkpIHtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSlcblx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0gPSBbXTtcblxuXHRcdFx0XHRpZiAodGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLmluZGV4T2YocmVzdHJpY3Rpb25JZCkgPT09IC0xKVxuXHRcdFx0XHRcdHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5wdXNoKHJlc3RyaWN0aW9uSWQpO1xuXG5cdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBuYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwLCByZXN0cmljdGlvbkxheWVyOiBldnQudGFyZ2V0fTtcblxuXHRcdFx0XHR0aGlzLmZpcmUoJ2ludmFsaWQnLCBldnQpO1xuXHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzppbnZhbGlkJywgZXZ0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0pIHtcblx0XHRcdFx0XHR2YXIgaW5kZXggPSB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0uaW5kZXhPZihyZXN0cmljdGlvbklkKTtcblxuXHRcdFx0XHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0uc3BsaWNlKGluZGV4LCAxKTtcblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6dmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVUYXJnZXQ6IGZ1bmN0aW9uKG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBldnQsIHZhbGlkID0gdHJ1ZSwgbmFtZSA9IG1ldGhvZE5hbWUuc3Vic3RyaW5nKDQpO1xuXG5cdFx0XHRpZiAodGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdICYmIHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGgpXG5cdFx0XHRcdHZhbGlkID0gZmFsc2U7XG5cblx0XHRcdHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSA9IFtdO1xuXG5cdFx0XHRpZiAodGhpcy5fZmVhdHVyZUdyb3VwLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRpZiAoIXZhbGlkKSB7XG5cdFx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXHRcdFx0XHRcdHRoaXMuZmlyZSgndmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dmFyIHJlc3RyaWN0aW9uTGF5ZXJzID0gdGhpc1t0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSldLFxuXHRcdFx0bWV0aG9kID0gdGhpcy5fZmVhdHVyZUdyb3VwW21ldGhvZE5hbWVdO1xuXG5cdFx0XHRpZiAocmVzdHJpY3Rpb25MYXllcnMpIHtcblx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXG5cdFx0XHRcdHJlc3RyaWN0aW9uTGF5ZXJzLmZvckVhY2goZnVuY3Rpb24ocmVzdHJpY3Rpb25MYXllcikge1xuXG5cdFx0XHRcdFx0aWYgKCFtZXRob2QuY2FsbCh0aGlzLl9mZWF0dXJlR3JvdXAsIHJlc3RyaWN0aW9uTGF5ZXIpKSB7XG5cblx0XHRcdFx0XHRcdHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5wdXNoKEwuc3RhbXAocmVzdHJpY3Rpb25MYXllcikpO1xuXHRcdFx0XHRcdFx0XG5cdFx0XHRcdFx0XHRldnQucmVzdHJpY3Rpb25MYXllciA9IHJlc3RyaWN0aW9uTGF5ZXI7XG5cblx0XHRcdFx0XHRcdHRoaXMuZmlyZSgnaW52YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzppbnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdFx0aWYgKCF0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoICYmICF2YWxpZCkge1xuXG5cdFx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXHRcdFx0XHRcdHRoaXMuZmlyZSgndmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfdW53YXRjaDogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGZlYXR1cmVHcm91cCkge1xuXHRcdFx0dmFyIHdhdGNoZXIgPSB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlUmVzdHJpY3Rpb24sIG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCcsIHdhdGNoZXIpO1xuXHRcdFx0ZmVhdHVyZUdyb3VwLm9mZignbGF5ZXJyZW1vdmUnLCB3YXRjaGVyKTtcblx0XHR9LFxuXG5cdFx0X3Vud2F0Y2hNZTogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cC5vZmYoJ2xheWVyYWRkIGxheWVycmVtb3ZlJywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZVRhcmdldCwgbWV0aG9kTmFtZSkpO1xuXHRcdH0sXG5cblx0XHRfd2F0Y2g6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBmZWF0dXJlR3JvdXApIHtcblxuXHRcdFx0dmFyIHdhdGNoZXIgPSB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlUmVzdHJpY3Rpb24sIG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVycmVtb3ZlJywgd2F0Y2hlcik7XG5cdFx0fSxcblxuXHRcdF93YXRjaE1lOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLm9uKCdsYXllcmFkZCBsYXllcnJlbW92ZScsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVUYXJnZXQsIG1ldGhvZE5hbWUpKTtcblx0XHR9XG5cblx0fSk7XG5cblxuXHRMLkZlYXR1cmVHcm91cC5hZGRJbml0SG9vayhmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF0aGlzLnZhbGlkYXRpb24pXG5cdFx0XHR0aGlzLnZhbGlkYXRpb24gPSBuZXcgTC5GZWF0dXJlR3JvdXAuVmFsaWRhdGlvbih0aGlzKTtcblxuXHRcdGlmICghdGhpcy5maXgpXG5cdFx0XHR0aGlzLmZpeCA9IG5ldyBMLkZlYXR1cmVHcm91cC5GaXhlcih0aGlzLnZhbGlkYXRpb24pO1xuXHR9KTtcblxufSkoKTsiXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
