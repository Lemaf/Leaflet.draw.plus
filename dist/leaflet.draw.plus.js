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

		_disableEditing: function (layer) {
			if (layer.editing) {
				layer.editing.disable();
				layer.off('edit', this._onLayerEdit, this);
			}
		},

		_enableEditing: function (layer) {
			if (layer.editing) {
				layer.editing.enable();
				layer.on('edit', this._onLayerEdit, this);
			}
		},

		_onLayerEdit: function (evt) {
			this.fire('edit', {layer: evt.layer || evt.target});
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
				fixedGeometry, i, fixMethod, restoreEdit;

				function fixLayer (geometry, restrictionLayer) {

					restrictionGeometry = restrictionLayer.jsts.geometry();

					if (geometry[checkMethod](restrictionGeometry)) {
						for (i = 0; i < fixMethods.length; i++) {
							fixMethod = fixMethods[i];

							geometry = geometry[fixMethod](restrictionGeometry);
						}
					}

					return geometry;
				}

				featureGroup.eachLayer(function(layer) {
					fixedGeometry = restrictionLayers.reduce(fixLayer, layer.jsts.geometry());

					if (fixedGeometry && fixedGeometry !== layer) {
						if (layer.editing) {
							restoreEdit = layer.editing.enabled();
							layer.editing.disable();
						} else
							restoreEdit = false;

						layer.setLatLngs(L.jsts.jstsToLatLngs(fixedGeometry));

						if (restoreEdit)
							layer.editing.enable();
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

		_validateFeature: function (methodName, evt) {
			this._featureGroup.jsts.clean();
			this._validateTarget(methodName);
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

		_validateRestrictionFeature: function (methodName, evt) {
			var collectionId = this._collectionId(methodName),
			collection, restrictionLayer;

			if ((collection = this[collectionId])) {
				for (var i = 0; i < collection.length; i++) {
					if (collection[i].hasLayer(evt.target)) {

						(restrictionLayer = collection[i]).jsts.clean();
						break;
					}
				}
			}

			if (restrictionLayer)
				this._validateRestriction(methodName, {target: restrictionLayer});
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

			featureGroup.off('layeradd', this._getHandler(this._watchRestrictionFeature, methodName));

			featureGroup.eachLayer(function (layer) {
				if (layer.editing) {
					layer.off('edit', this._getHandler(this._validateRestrictionFeature, methodName));
				}
			}, this);
		},

		_unwatchMe: function (methodName) {

			this._featureGroup.eachLayer(function (layer) {
				if (layer.editing) {
					layer.off('edit', this._getHandler(this._validateFeature, methodName));
				}
			}, this);

			this._featureGroup.off('layeradd', this._getHandler(this._watchFeature, methodName));
			this._featureGroup.off('layeradd layerremove', this._getHandler(this._validateTarget, methodName));
		},

		_watch: function (methodName, featureGroup) {

			var watcher = this._getHandler(this._validateRestriction, methodName);

			featureGroup.eachLayer(function (layer) {
				this._watchRestrictionFeature(methodName, {layer: layer});
			}, this);

			featureGroup.on('layeradd', this._getHandler(this._watchRestrictionFeature, methodName));
			featureGroup.on('layeradd', watcher);
			featureGroup.on('layerremove', watcher);
		},

		_watchFeature: function (methodName, evt) {
			if (evt.layer.editing) {
				evt.layer.on('edit', this._getHandler(this._validateFeature, methodName));
			}
		},

		_watchMe: function (methodName) {

			this._featureGroup.eachLayer(function (layer) {
				this._watchFeature(methodName, {layer: layer});
			}, this);

			this._featureGroup.on('layeradd', this._getHandler(this._watchFeature, methodName));
			this._featureGroup.on('layeradd layerremove', this._getHandler(this._validateTarget, methodName));
		},

		_watchRestrictionFeature: function (methodName, evt) {
			if (evt.layer.editing) {
				evt.layer.on('edit', this._getHandler(this._validateRestrictionFeature, methodName));
			}
		}

	});


	L.FeatureGroup.addInitHook(function () {
		if (!this.validation)
			this.validation = new L.FeatureGroup.Validation(this);

		if (!this.fix)
			this.fix = new L.FeatureGroup.Fixer(this.validation);
	});

})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkltcG9ydHMuanMiLCJTaGFwZVppcC5qcyIsIkwuRmVhdHVyZUdyb3VwLkVkaXQuanMiLCJMLkZlYXR1cmVHcm91cC5pc0VtcHR5LmpzIiwiTC5GZWF0dXJlR3JvdXAuRml4ZXIuanMiLCJMLkZlYXR1cmVHcm91cC5WYWxpZGF0aW9uLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2xJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJsZWFmbGV0LmRyYXcucGx1cy5qcyIsInNvdXJjZXNDb250ZW50IjpbIjsoZnVuY3Rpb24oKSB7XG5cblx0aWYgKCFMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cylcblx0XHRMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cyA9IHt9O1xuXG5cdEwuRHJhdy5JbXBvcnRzID0gTC5EcmF3LkZlYXR1cmUuZXh0ZW5kKHtcblx0XHRzdGF0aWNzOiB7XG5cdFx0XHRGT1JNQVRTOiBbXSxcblx0XHRcdFRZUEU6ICdpbXBvcnRzJ1xuXHRcdH0sXG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAobWFwLCBvcHRpb25zKSB7XG5cdFx0XHR0aGlzLnR5cGUgPSBMLkRyYXcuSW1wb3J0cy5UWVBFO1xuXG5cdFx0XHRMLkRyYXcuRmVhdHVyZS5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIG1hcCwgb3B0aW9ucyk7XG5cdFx0fSxcblxuXHRcdGdldEFjdGlvbnM6IGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0cmV0dXJuIEwuRHJhdy5JbXBvcnRzLkZPUk1BVFMubWFwKGZ1bmN0aW9uKGZvcm1hdCkge1xuXHRcdFx0XHR2YXIgb3duRWxlbWVudCA9IG51bGw7XG5cblx0XHRcdFx0aWYgKGZvcm1hdC5jcmVhdGVBY3Rpb25FbGVtZW50KVxuXHRcdFx0XHRcdG93bkVsZW1lbnQgPSBmb3JtYXQuY3JlYXRlQWN0aW9uRWxlbWVudC5jYWxsKHRoaXMpO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHR0aXRsZTogZm9ybWF0LnRpdGxlLFxuXHRcdFx0XHRcdHRleHQ6IGZvcm1hdC50ZXh0LFxuXHRcdFx0XHRcdGNhbGxiYWNrOiBmb3JtYXQuY2FsbGJhY2ssXG5cdFx0XHRcdFx0Y29udGV4dDogdGhpcyxcblx0XHRcdFx0XHRvd25FbGVtZW50OiBvd25FbGVtZW50XG5cdFx0XHRcdH07XG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9XG5cdH0pO1xuXG59KSgpOyIsIjsoZnVuY3Rpb24oKSB7XG5cblx0aWYgKCFMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcCkge1xuXHRcdEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwID0ge1xuXHRcdFx0dGV4dDogJ0ltcG9ydCBhIHNoYXBlZmlsZSB6aXAnLFxuXHRcdFx0dGl0bGU6ICdQbGVhc2UsIHNlbGVjdCBhIHppcCBmaWxlLidcblx0XHR9O1xuXHR9XG5cblx0U2hwWmlwRm9ybWF0ID0ge1xuXG5cdFx0X2hhbmRsZXJzOiB7fSxcblxuXHRcdF9uZXh0SWQ6IDEsXG5cblx0XHRjcmVhdGVPcGVuQnV0dG9uOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBsaW5rID0gTC5Eb21VdGlsLmNyZWF0ZSgnYScpO1xuXG5cdFx0XHRsaW5rLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0XHRcdGxpbmsuaW5uZXJIVE1MID0gTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXAudGV4dDtcblx0XHRcdGxpbmsudGl0bGUgPSBMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcC50aXRsZTtcblxuXHRcdFx0dmFyIGlucHV0ID0gTC5Eb21VdGlsLmNyZWF0ZSgnaW5wdXQnLCAnbGVhZmxldC1kcmF3LWRyYXctaW1wb3J0cy1hY3Rpb24nLCBsaW5rKTtcblx0XHRcdGlucHV0LnR5cGUgPSAnZmlsZSc7XG5cblx0XHRcdHZhciBoYW5kbGVyID0gdGhpcztcblxuXHRcdFx0aW5wdXQub25jaGFuZ2UgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0U2hwWmlwRm9ybWF0Ll9vcGVuU2hhcGVaaXAoaGFuZGxlciwgaW5wdXQpO1xuXHRcdFx0fTtcblxuXHRcdFx0cmV0dXJuIGxpbms7XG5cdFx0fSxcblxuXHRcdG5vcDogZnVuY3Rpb24oKSB7fSxcblxuXHRcdF9nZXRXb3JrZXI6IGZ1bmN0aW9uKCkge1xuXHRcdFx0aWYgKCF0aGlzLl93b3JrZXIpIHtcblx0XHRcdFx0aWYgKEwuRHJhdy5JbXBvcnRzLlNIUEpTX1VSTCkge1xuXG5cdFx0XHRcdFx0Ly8gTm8gZXh0ZXJuYWwgLmpzIHNjcmlwdFxuXHRcdFx0XHRcdHZhciBzY3JpcHQgPSBcInRyeSB7IGltcG9ydFNjcmlwdHMoJ1wiICsgTC5EcmF3LkltcG9ydHMuU0hQSlNfVVJMICsgXCInKTsgfSBjYXRjaCAoZSkge2NvbnNvbGUuZXJyb3IoZSk7IHRocm93IGU7fVxcblwiICtcblx0XHRcdFx0XHRcIm9ubWVzc2FnZSA9IGZ1bmN0aW9uKGUpIHtcXG5cIiArXG5cdFx0XHRcdFx0XHRcImNvbnNvbGUubG9nKCdQcm9jZXNzaW5nIFNoYXBlWmlwLi4uJyk7XFxuXCIgK1xuXHRcdFx0XHRcdFx0XCJ2YXIgZ2VvSlNPTiA9IHNocC5wYXJzZVppcChlLmRhdGEuYnl0ZUFycmF5KTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcImNvbnNvbGUubG9nKCdTaGFwZVppcCBwcm9jZXNzZWQhJyk7XFxuXCIgK1xuXHRcdFx0XHRcdFx0XCJwb3N0TWVzc2FnZSh7aWQ6IGUuZGF0YS5pZCwgZ2VvSlNPTjogZ2VvSlNPTn0pO1xcblwiICtcblx0XHRcdFx0XHRcIn1cIjtcblxuXHRcdFx0XHRcdHZhciB1cmxEYXRhID0gVVJMLmNyZWF0ZU9iamVjdFVSTChuZXcgQmxvYihbc2NyaXB0XSwge3R5cGU6IFwiYXBwbGljYXRpb24vamF2YXNjcmlwdFwifSkpO1xuXHRcdFx0XHRcdHRoaXMuX3dvcmtlciA9IG5ldyBXb3JrZXIodXJsRGF0YSk7XG5cblx0XHRcdFx0XHR0aGlzLl93b3JrZXIub25tZXNzYWdlID0gdGhpcy5fb25tZXNzYWdlLmJpbmQodGhpcyk7XG5cdFx0XHRcdFx0dGhpcy5fd29ya2VyLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKGFyZ3VtZW50cyk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlXG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOZWVkIHNoYXBlZmlsZS1qcyBVUkwnKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuX3dvcmtlcjtcblx0XHR9LFxuXG5cdFx0X29ubWVzc2FnZTogZnVuY3Rpb24oZSkge1xuXHRcdFx0dmFyIGdlb0pTT04gPSBlLmRhdGEuZ2VvSlNPTjtcblx0XHRcdHZhciBoYW5kbGVyID0gdGhpcy5faGFuZGxlcnNbZS5kYXRhLmlkXTtcblxuXHRcdFx0Ly8gVE9ETzogSXMgaXQgYWx3YXlzIEZlYXR1cmVDb2xsZWN0aW9uP1xuXHRcdFx0XG5cdFx0XHR2YXIgcHJvcGVydGllcywgZ2VvbWV0cnksIG5ld0ZlYXR1cmUsIGksIGxheWVyO1xuXG5cdFx0XHRnZW9KU09OLmZlYXR1cmVzLmZvckVhY2goZnVuY3Rpb24oZmVhdHVyZSkge1xuXHRcdFx0XHRwcm9wZXJ0aWVzID0gZmVhdHVyZS5wcm9wZXJ0aWVzO1xuXHRcdFx0XHRnZW9tZXRyeSA9IGZlYXR1cmUuZ2VvbWV0cnk7XG5cblx0XHRcdFx0aWYgKGdlb21ldHJ5LnR5cGUuc3RhcnRzV2l0aChcIk11bHRpXCIpKSB7XG5cdFx0XHRcdFx0Zm9yIChpPTA7IGkgPCBnZW9tZXRyeS5jb29yZGluYXRlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0bmV3RmVhdHVyZSA9IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogZ2VvbWV0cnkudHlwZS5zdWJzdHJpbmcoNSksXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHByb3BlcnRpZXMsXG5cdFx0XHRcdFx0XHRcdGNvb3JkaW5hdGVzOiBnZW9tZXRyeS5jb29yZGluYXRlc1tpXVxuXHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0bGF5ZXIgPSBMLkdlb0pTT04uZ2VvbWV0cnlUb0xheWVyKG5ld0ZlYXR1cmUpO1xuXHRcdFx0XHRcdFx0aGFuZGxlci5fZmlyZUNyZWF0ZWRFdmVudChsYXllcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxheWVyID0gTC5HZW9KU09OLmdlb21ldHJ5VG9MYXllcihmZWF0dXJlKTtcblx0XHRcdFx0XHRoYW5kbGVyLl9maXJlQ3JlYXRlZEV2ZW50KGxheWVyKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGhhbmRsZXIuZGlzYWJsZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSxcblxuXHRcdF9vcGVuU2hhcGVaaXA6IGZ1bmN0aW9uKGhhbmRsZXIsIGlucHV0KSB7XG5cdFx0XHRpZiAoIWlucHV0LmZpbGVzICYmICFpbnB1dC5maWxlc1swXSlcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHR2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcblxuXHRcdFx0cmVhZGVyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuXG5cdFx0XHRcdGlmIChyZWFkZXIucmVhZHlTdGF0ZSAhPT0gMilcblx0XHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdFx0aWYgKHJlYWRlci5yZXN1bHQpIHtcblx0XHRcdFx0XHRTaHBaaXBGb3JtYXQuX3BhcnNlKGhhbmRsZXIsIHJlYWRlci5yZXN1bHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH07XG5cblx0XHRcdGhhbmRsZXIuX21hcC5maXJlKCdkcmF3OmltcG9ydHN0YXJ0Jyk7XG5cdFx0XHRyZWFkZXIucmVhZEFzQXJyYXlCdWZmZXIoaW5wdXQuZmlsZXNbMF0pO1xuXHRcdH0sXG5cblx0XHRfcGFyc2U6IGZ1bmN0aW9uKGhhbmRsZXIsIGJ5dGVBcnJheSkge1xuXHRcdFx0dmFyIHdvcmtlciA9IHRoaXMuX2dldFdvcmtlcigpO1xuXHRcdFx0dmFyIGlkID0gdGhpcy5fbmV4dElkKys7XG5cdFx0XHR0aGlzLl9oYW5kbGVyc1tpZF0gPSBoYW5kbGVyO1xuXG5cdFx0XHR3b3JrZXIucG9zdE1lc3NhZ2Uoe2lkOiBpZCwgYnl0ZUFycmF5OiBieXRlQXJyYXl9LCBbYnl0ZUFycmF5XSk7XG5cdFx0fSxcblx0fTtcblxuXHRMLkRyYXcuSW1wb3J0cy5GT1JNQVRTLnB1c2goe1xuXHRcdGNhbGxiYWNrOiBTaHBaaXBGb3JtYXQubm9wLFxuXHRcdGNyZWF0ZUFjdGlvbkVsZW1lbnQ6IFNocFppcEZvcm1hdC5jcmVhdGVPcGVuQnV0dG9uXG5cblx0fSk7XG59KSgpOyIsIihmdW5jdGlvbiAoKSB7XG5cblx0TC5GZWF0dXJlR3JvdXAuRWRpdCA9IEwuSGFuZGxlci5leHRlbmQoe1xuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKGxheWVyKSB7XG5cdFx0XHR0aGlzLl9sYXllciA9IGxheWVyO1xuXHRcdH0sXG5cblx0XHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy5fbGF5ZXIuZWFjaExheWVyKHRoaXMuX2VuYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdFx0dGhpcy5fbGF5ZXIub24oJ2xheWVyYWRkJywgdGhpcy5fZW5hYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vbignbGF5ZXJyZW1vdmUnLCB0aGlzLl9kaXNhYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0fSxcblxuXHRcdHJlbW92ZUhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl9sYXllci5lYWNoTGF5ZXIodGhpcy5fZGlzYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdFx0dGhpcy5fbGF5ZXIub2ZmKCdsYXllcmFkZCcsIHRoaXMuX2VuYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdFx0dGhpcy5fbGF5ZXIub2ZmKCdsYXllcnJlbW92ZScsIHRoaXMuX2Rpc2FibGVFZGl0aW5nLCB0aGlzKTtcblx0XHR9LFxuXG5cdFx0X2Rpc2FibGVFZGl0aW5nOiBmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdGlmIChsYXllci5lZGl0aW5nKSB7XG5cdFx0XHRcdGxheWVyLmVkaXRpbmcuZGlzYWJsZSgpO1xuXHRcdFx0XHRsYXllci5vZmYoJ2VkaXQnLCB0aGlzLl9vbkxheWVyRWRpdCwgdGhpcyk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9lbmFibGVFZGl0aW5nOiBmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdGlmIChsYXllci5lZGl0aW5nKSB7XG5cdFx0XHRcdGxheWVyLmVkaXRpbmcuZW5hYmxlKCk7XG5cdFx0XHRcdGxheWVyLm9uKCdlZGl0JywgdGhpcy5fb25MYXllckVkaXQsIHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfb25MYXllckVkaXQ6IGZ1bmN0aW9uIChldnQpIHtcblx0XHRcdHRoaXMuZmlyZSgnZWRpdCcsIHtsYXllcjogZXZ0LmxheWVyIHx8IGV2dC50YXJnZXR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdEwuRmVhdHVyZUdyb3VwLmFkZEluaXRIb29rKGZ1bmN0aW9uICgpIHtcblxuXHRcdGlmICghdGhpcy5lZGl0aW5nKVxuXHRcdFx0dGhpcy5lZGl0aW5nID0gbmV3IEwuRmVhdHVyZUdyb3VwLkVkaXQodGhpcyk7XG5cblx0fSk7XG5cbn0pKCk7IiwiTC5GZWF0dXJlR3JvdXAuaW5jbHVkZSh7XG5cdGlzRW1wdHk6IGZ1bmN0aW9uKCkge1xuXG5cdFx0Zm9yICh2YXIgaWQgaW4gdGhpcy5fbGF5ZXJzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn0pOyIsIjsoZnVuY3Rpb24gKCkge1xuXG5cdHZhciBGSVhfT1BFUkFUSU9OUyA9IHtcblx0XHR3aXRoaW46IHtcblx0XHRcdGNoZWNrOiAnaW50ZXJzZWN0cycsXG5cdFx0XHRmaXg6IFsnaW50ZXJzZWN0aW9uJ11cblx0XHR9XG5cdH07XG5cblx0dmFyIEpTVFNfTUVUSE9EUyA9IHtcblx0XHR3aXRoaW46ICd3aXRoaW4nXG5cdH07XG5cblx0TC5GZWF0dXJlR3JvdXAuRml4ZXIgPSBMLkNsYXNzLmV4dGVuZCh7XG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAodmFsaWRhdGlvbikge1xuXHRcdFx0dGhpcy5fdmFsaWRhdGlvbiA9IHZhbGlkYXRpb247XG5cdFx0fSxcblxuXHRcdHdpdGhpbjogZnVuY3Rpb24gKCkge1xuXHRcdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRcdFx0dmFyIHZhbGlkID0gc2VsZi5fdmFsaWRhdGlvbi5pc1ZhbGlkKEpTVFNfTUVUSE9EUy53aXRoaW4pO1xuXG5cdFx0XHRcdGlmICghdmFsaWQpIHtcblx0XHRcdFx0XHRzZWxmLl9maXgoSlNUU19NRVRIT0RTLndpdGhpbiwgRklYX09QRVJBVElPTlMud2l0aGluKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSxcblxuXHRcdF9maXg6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBvcGVyYXRpb24pIHtcblxuXG5cdFx0XHRpZiAoIW9wZXJhdGlvbilcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHR2YXIgY2hlY2tNZXRob2QgPSBvcGVyYXRpb24uY2hlY2ssXG5cdFx0XHRmaXhNZXRob2RzID0gb3BlcmF0aW9uLmZpeDtcblxuXHRcdFx0dGhpcy5fdmFsaWRhdGlvbi53YWl0KG1ldGhvZE5hbWUsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR2YXIgZmVhdHVyZUdyb3VwID0gdGhpcy5fdmFsaWRhdGlvbi5nZXRGZWF0dXJlR3JvdXAoKSxcblx0XHRcdFx0cmVzdHJpY3Rpb25MYXllcnMgPSB0aGlzLl92YWxpZGF0aW9uLmdldFJlc3RyaWN0aW9uTGF5ZXJzKG1ldGhvZE5hbWUpLFxuXHRcdFx0XHRmaXhlZEdlb21ldHJ5LCBpLCBmaXhNZXRob2QsIHJlc3RvcmVFZGl0O1xuXG5cdFx0XHRcdGZ1bmN0aW9uIGZpeExheWVyIChnZW9tZXRyeSwgcmVzdHJpY3Rpb25MYXllcikge1xuXG5cdFx0XHRcdFx0cmVzdHJpY3Rpb25HZW9tZXRyeSA9IHJlc3RyaWN0aW9uTGF5ZXIuanN0cy5nZW9tZXRyeSgpO1xuXG5cdFx0XHRcdFx0aWYgKGdlb21ldHJ5W2NoZWNrTWV0aG9kXShyZXN0cmljdGlvbkdlb21ldHJ5KSkge1xuXHRcdFx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IGZpeE1ldGhvZHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0Zml4TWV0aG9kID0gZml4TWV0aG9kc1tpXTtcblxuXHRcdFx0XHRcdFx0XHRnZW9tZXRyeSA9IGdlb21ldHJ5W2ZpeE1ldGhvZF0ocmVzdHJpY3Rpb25HZW9tZXRyeSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGdlb21ldHJ5O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbihsYXllcikge1xuXHRcdFx0XHRcdGZpeGVkR2VvbWV0cnkgPSByZXN0cmljdGlvbkxheWVycy5yZWR1Y2UoZml4TGF5ZXIsIGxheWVyLmpzdHMuZ2VvbWV0cnkoKSk7XG5cblx0XHRcdFx0XHRpZiAoZml4ZWRHZW9tZXRyeSAmJiBmaXhlZEdlb21ldHJ5ICE9PSBsYXllcikge1xuXHRcdFx0XHRcdFx0aWYgKGxheWVyLmVkaXRpbmcpIHtcblx0XHRcdFx0XHRcdFx0cmVzdG9yZUVkaXQgPSBsYXllci5lZGl0aW5nLmVuYWJsZWQoKTtcblx0XHRcdFx0XHRcdFx0bGF5ZXIuZWRpdGluZy5kaXNhYmxlKCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0XHRcdFx0cmVzdG9yZUVkaXQgPSBmYWxzZTtcblxuXHRcdFx0XHRcdFx0bGF5ZXIuc2V0TGF0TG5ncyhMLmpzdHMuanN0c1RvTGF0TG5ncyhmaXhlZEdlb21ldHJ5KSk7XG5cblx0XHRcdFx0XHRcdGlmIChyZXN0b3JlRWRpdClcblx0XHRcdFx0XHRcdFx0bGF5ZXIuZWRpdGluZy5lbmFibGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0XHRcblx0XHR9XG5cdH0pO1xuXG59KSgpOyIsIjsoZnVuY3Rpb24oKSB7XG5cblx0dmFyIEpTVFNfTUVUSE9EUyA9IHtcblx0XHRXaXRoaW46ICd3aXRoaW4nXG5cdH07XG5cblx0TC5GZWF0dXJlR3JvdXAuVmFsaWRhdGlvbiA9IEwuSGFuZGxlci5leHRlbmQoe1xuXG5cdFx0aW5jbHVkZXM6IEwuTWl4aW4uRXZlbnRzLFxuXG5cdFx0b3B0aW9uczoge1xuXG5cdFx0fSxcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uKGZlYXR1cmVHcm91cCkge1xuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwID0gZmVhdHVyZUdyb3VwO1xuXHRcdFx0dGhpcy5fYmluZGVkID0ge307XG5cdFx0XHR0aGlzLl9lcnJvcnMgPSB7fTtcblx0XHR9LFxuXG5cdFx0YWRkSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uSWQsIGNvbGxlY3Rpb24sIG1ldGhvZE5hbWU7XG5cblx0XHRcdGZvciAodmFyIG5hbWUgaW4gSlNUU19NRVRIT0RTKSB7XG5cblx0XHRcdFx0bWV0aG9kTmFtZSA9IEpTVFNfTUVUSE9EU1tuYW1lXTtcblxuXHRcdFx0XHRjb2xsZWN0aW9uSWQgPSB0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSk7XG5cdFx0XHRcdGNvbGxlY3Rpb24gPSB0aGlzW2NvbGxlY3Rpb25JZF07XG5cdFx0XHRcdGlmIChjb2xsZWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5mb3JFYWNoKHRoaXMuX3dhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fd2F0Y2hNZShtZXRob2ROYW1lKTtcblx0XHRcdH1cblxuXHRcdH0sXG5cblx0XHRnZXRSZXN0cmljdGlvbkxheWVyczogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uSWQgID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXHRcdFx0aWYgKHRoaXNbY29sbGVjdGlvbklkXSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpc1tjb2xsZWN0aW9uSWRdLnNsaWNlKDApO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRnZXRGZWF0dXJlR3JvdXA6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9mZWF0dXJlR3JvdXA7XG5cdFx0fSxcblxuXHRcdGlzVmFsaWQ6IGZ1bmN0aW9uKG1ldGhvZE5hbWUpIHtcblx0XHRcdGlmIChtZXRob2ROYW1lICYmIHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSkge1xuXHRcdFx0XHRyZXR1cm4gIXRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdGZpcmVPbk1hcDogZnVuY3Rpb24gKGV2ZW50TmFtZSwgZXZlbnQpIHtcblx0XHRcdGlmICh0aGlzLl9mZWF0dXJlR3JvdXAuX21hcClcblx0XHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLl9tYXAuZmlyZShldmVudE5hbWUsIGV2ZW50KTtcblx0XHR9LFxuXG5cdFx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uSWQsIGNvbGxlY3Rpb24sIG1ldGhvZE5hbWU7XG5cblx0XHRcdGZvciAodmFyIG5hbWUgaW4gSlNUU19NRVRIT0RTKSB7XG5cblx0XHRcdFx0bWV0aG9kTmFtZSA9IEpTVFNfTUVUSE9EU1tuYW1lXTtcblx0XHRcdFx0Y29sbGVjdGlvbklkID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXHRcdFx0XHRjb2xsZWN0aW9uID0gdGhpc1tjb2xsZWN0aW9uSWRdO1xuXG5cdFx0XHRcdGlmIChjb2xsZWN0aW9uKVxuXHRcdFx0XHRcdGNvbGxlY3Rpb24uZm9yRWFjaCh0aGlzLl91bndhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXG5cdFx0XHRcdHRoaXMuX3Vud2F0Y2hNZShtZXRob2ROYW1lKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogRGlzYWJsZSB0ZW1wb3JhcmlseSBvbiB2YWxpZGF0aW9uIGFuZCBleGVjdXRlIGZuXG5cdFx0ICogQHBhcmFtICB7U3RyaW5nfSAgIG9wIHZhbGlkYXRpb24gbmFtZVxuXHRcdCAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiBcblx0XHQgKiBAcGFyYW0gIHtPYmplY3R9IGNvbnRleHQgdGhpc0FyZ1xuXHRcdCAqIEByZXR1cm4ge0FueX0gZm4gcmVzdWx0XG5cdFx0ICovXG5cdFx0d2FpdDogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGZuLCBjb250ZXh0KSB7XG5cblx0XHRcdHZhciBjb2xsZWN0aW9uSWQgPSB0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSk7XG5cblx0XHRcdGlmICh0aGlzW2NvbGxlY3Rpb25JZF0pIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzW2NvbGxlY3Rpb25JZF0uZm9yRWFjaCh0aGlzLl91bndhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHRcdHRoaXMuX3Vud2F0Y2hNZShtZXRob2ROYW1lKTtcblxuXHRcdFx0XHRcdHJldHVybiBmbi5jYWxsKGNvbnRleHQsIHRoaXMpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmVuYWJsZWQoKSkge1xuXHRcdFx0XHRcdFx0dGhpc1tjb2xsZWN0aW9uSWRdLmZvckVhY2godGhpcy5fd2F0Y2guYmluZCh0aGlzLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdFx0XHR0aGlzLl93YXRjaE1lKG1ldGhvZE5hbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHR3aXRoaW46IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuX29uKEpTVFNfTUVUSE9EUy5XaXRoaW4sIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCkpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblxuXHRcdF9jb2xsZWN0aW9uSWQ6IGZ1bmN0aW9uIChtZXRob2ROYW1lKSB7XG5cdFx0XHRyZXR1cm4gbWV0aG9kTmFtZSA/ICdfJyArIG1ldGhvZE5hbWUgKyAncycgOiBudWxsO1xuXHRcdH0sXG5cblx0XHRfZ2V0SGFuZGxlcjogZnVuY3Rpb24oaGFuZGxlciwgbWV0aG9kTmFtZSkge1xuXHRcdFx0dmFyIGlkID0gTC5zdGFtcChoYW5kbGVyKTtcblxuXHRcdFx0aWYgKCF0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV0pXG5cdFx0XHRcdHRoaXMuX2JpbmRlZFttZXRob2ROYW1lXSA9IHt9O1xuXG5cdFx0XHRpZiAoIXRoaXMuX2JpbmRlZFttZXRob2ROYW1lXVtpZF0pXG5cdFx0XHRcdHRoaXMuX2JpbmRlZFttZXRob2ROYW1lXVtpZF0gPSBoYW5kbGVyLmJpbmQodGhpcywgbWV0aG9kTmFtZSk7XG5cblx0XHRcdHJldHVybiB0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV1baWRdO1xuXHRcdH0sXG5cblx0XHRfb2ZmOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXHRcdFx0dmFyIGNvbGxlY3Rpb25JZCA9IHRoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKTtcblxuXHRcdFx0aWYgKHRoaXNbY29sbGVjdGlvbklkXSkge1xuXHRcdFx0XHR0aGlzW2NvbGxlY3Rpb25JZF0uZm9yRWFjaCh0aGlzLl91bndhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHRkZWxldGUgdGhpc1tjb2xsZWN0aW9uSWRdO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfb246IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBsYXllcnMpIHtcblx0XHRcdHRoaXMuX29mZihtZXRob2ROYW1lKTtcblx0XHRcdHRoaXNbdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpXSA9IGxheWVycztcblx0XHR9LFxuXG5cdFx0X3ZhbGlkYXRlRmVhdHVyZTogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGV2dCkge1xuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLmpzdHMuY2xlYW4oKTtcblx0XHRcdHRoaXMuX3ZhbGlkYXRlVGFyZ2V0KG1ldGhvZE5hbWUpO1xuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVSZXN0cmljdGlvbjogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGV2dCkge1xuXHRcdFx0dmFyIG5hbWUgPSBtZXRob2ROYW1lLnNsaWNlKDQpO1xuXG5cdFx0XHRpZiAodGhpcy5fZmVhdHVyZUdyb3VwLmlzRW1wdHkoKSlcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHR2YXIgcmVzdHJpY3Rpb25JZCA9IEwuc3RhbXAoZXZ0LnRhcmdldCk7XG5cblx0XHRcdGlmICghdGhpcy5fZmVhdHVyZUdyb3VwLmpzdHNbbWV0aG9kTmFtZV0oZXZ0LnRhcmdldCkpIHtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSlcblx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0gPSBbXTtcblxuXHRcdFx0XHRpZiAodGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLmluZGV4T2YocmVzdHJpY3Rpb25JZCkgPT09IC0xKVxuXHRcdFx0XHRcdHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5wdXNoKHJlc3RyaWN0aW9uSWQpO1xuXG5cdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBuYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwLCByZXN0cmljdGlvbkxheWVyOiBldnQudGFyZ2V0fTtcblxuXHRcdFx0XHR0aGlzLmZpcmUoJ2ludmFsaWQnLCBldnQpO1xuXHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzppbnZhbGlkJywgZXZ0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0pIHtcblx0XHRcdFx0XHR2YXIgaW5kZXggPSB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0uaW5kZXhPZihyZXN0cmljdGlvbklkKTtcblxuXHRcdFx0XHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0uc3BsaWNlKGluZGV4LCAxKTtcblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6dmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVSZXN0cmljdGlvbkZlYXR1cmU6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uSWQgPSB0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSksXG5cdFx0XHRjb2xsZWN0aW9uLCByZXN0cmljdGlvbkxheWVyO1xuXG5cdFx0XHRpZiAoKGNvbGxlY3Rpb24gPSB0aGlzW2NvbGxlY3Rpb25JZF0pKSB7XG5cdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgY29sbGVjdGlvbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGlmIChjb2xsZWN0aW9uW2ldLmhhc0xheWVyKGV2dC50YXJnZXQpKSB7XG5cblx0XHRcdFx0XHRcdChyZXN0cmljdGlvbkxheWVyID0gY29sbGVjdGlvbltpXSkuanN0cy5jbGVhbigpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN0cmljdGlvbkxheWVyKVxuXHRcdFx0XHR0aGlzLl92YWxpZGF0ZVJlc3RyaWN0aW9uKG1ldGhvZE5hbWUsIHt0YXJnZXQ6IHJlc3RyaWN0aW9uTGF5ZXJ9KTtcblx0XHR9LFxuXG5cdFx0X3ZhbGlkYXRlVGFyZ2V0OiBmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0XHR2YXIgZXZ0LCB2YWxpZCA9IHRydWUsIG5hbWUgPSBtZXRob2ROYW1lLnN1YnN0cmluZyg0KTtcblxuXHRcdFx0aWYgKHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSAmJiB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoKVxuXHRcdFx0XHR2YWxpZCA9IGZhbHNlO1xuXG5cdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0gPSBbXTtcblxuXHRcdFx0aWYgKHRoaXMuX2ZlYXR1cmVHcm91cC5pc0VtcHR5KCkpIHtcblx0XHRcdFx0aWYgKCF2YWxpZCkge1xuXHRcdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBuYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwfTtcblx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzp2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHZhciByZXN0cmljdGlvbkxheWVycyA9IHRoaXNbdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpXSxcblx0XHRcdG1ldGhvZCA9IHRoaXMuX2ZlYXR1cmVHcm91cC5qc3RzW21ldGhvZE5hbWVdO1xuXG5cdFx0XHRpZiAocmVzdHJpY3Rpb25MYXllcnMpIHtcblx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXG5cdFx0XHRcdHJlc3RyaWN0aW9uTGF5ZXJzLmZvckVhY2goZnVuY3Rpb24ocmVzdHJpY3Rpb25MYXllcikge1xuXG5cdFx0XHRcdFx0aWYgKCFtZXRob2QuY2FsbCh0aGlzLl9mZWF0dXJlR3JvdXAuanN0cywgcmVzdHJpY3Rpb25MYXllcikpIHtcblxuXHRcdFx0XHRcdFx0dGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLnB1c2goTC5zdGFtcChyZXN0cmljdGlvbkxheWVyKSk7XG5cdFx0XHRcdFx0XHRcblx0XHRcdFx0XHRcdGV2dC5yZXN0cmljdGlvbkxheWVyID0gcmVzdHJpY3Rpb25MYXllcjtcblxuXHRcdFx0XHRcdFx0dGhpcy5maXJlKCdpbnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OmludmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGggJiYgIXZhbGlkKSB7XG5cblx0XHRcdFx0XHRldnQgPSB7dmFsaWRhdGlvbjogbmFtZSwgdGFyZ2V0TGF5ZXI6IHRoaXMuX2ZlYXR1cmVHcm91cH07XG5cdFx0XHRcdFx0dGhpcy5maXJlKCd2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6dmFsaWQnLCBldnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF91bndhdGNoOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZmVhdHVyZUdyb3VwKSB7XG5cdFx0XHR2YXIgd2F0Y2hlciA9IHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVSZXN0cmljdGlvbiwgbWV0aG9kTmFtZSk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5vZmYoJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcnJlbW92ZScsIHdhdGNoZXIpO1xuXG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fd2F0Y2hSZXN0cmljdGlvbkZlYXR1cmUsIG1ldGhvZE5hbWUpKTtcblxuXHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdFx0aWYgKGxheWVyLmVkaXRpbmcpIHtcblx0XHRcdFx0XHRsYXllci5vZmYoJ2VkaXQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlUmVzdHJpY3Rpb25GZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMpO1xuXHRcdH0sXG5cblx0XHRfdW53YXRjaE1lOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAuZWFjaExheWVyKGZ1bmN0aW9uIChsYXllcikge1xuXHRcdFx0XHRpZiAobGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRcdGxheWVyLm9mZignZWRpdCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVGZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fd2F0Y2hGZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCBsYXllcnJlbW92ZScsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVUYXJnZXQsIG1ldGhvZE5hbWUpKTtcblx0XHR9LFxuXG5cdFx0X3dhdGNoOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZmVhdHVyZUdyb3VwKSB7XG5cblx0XHRcdHZhciB3YXRjaGVyID0gdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZVJlc3RyaWN0aW9uLCBtZXRob2ROYW1lKTtcblxuXHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdFx0dGhpcy5fd2F0Y2hSZXN0cmljdGlvbkZlYXR1cmUobWV0aG9kTmFtZSwge2xheWVyOiBsYXllcn0pO1xuXHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5vbignbGF5ZXJhZGQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3dhdGNoUmVzdHJpY3Rpb25GZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVycmVtb3ZlJywgd2F0Y2hlcik7XG5cdFx0fSxcblxuXHRcdF93YXRjaEZlYXR1cmU6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblx0XHRcdGlmIChldnQubGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRldnQubGF5ZXIub24oJ2VkaXQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlRmVhdHVyZSwgbWV0aG9kTmFtZSkpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfd2F0Y2hNZTogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblxuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdFx0dGhpcy5fd2F0Y2hGZWF0dXJlKG1ldGhvZE5hbWUsIHtsYXllcjogbGF5ZXJ9KTtcblx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkJywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl93YXRjaEZlYXR1cmUsIG1ldGhvZE5hbWUpKTtcblx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cC5vbignbGF5ZXJhZGQgbGF5ZXJyZW1vdmUnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlVGFyZ2V0LCBtZXRob2ROYW1lKSk7XG5cdFx0fSxcblxuXHRcdF93YXRjaFJlc3RyaWN0aW9uRmVhdHVyZTogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGV2dCkge1xuXHRcdFx0aWYgKGV2dC5sYXllci5lZGl0aW5nKSB7XG5cdFx0XHRcdGV2dC5sYXllci5vbignZWRpdCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVSZXN0cmljdGlvbkZlYXR1cmUsIG1ldGhvZE5hbWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0fSk7XG5cblxuXHRMLkZlYXR1cmVHcm91cC5hZGRJbml0SG9vayhmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF0aGlzLnZhbGlkYXRpb24pXG5cdFx0XHR0aGlzLnZhbGlkYXRpb24gPSBuZXcgTC5GZWF0dXJlR3JvdXAuVmFsaWRhdGlvbih0aGlzKTtcblxuXHRcdGlmICghdGhpcy5maXgpXG5cdFx0XHR0aGlzLmZpeCA9IG5ldyBMLkZlYXR1cmVHcm91cC5GaXhlcih0aGlzLnZhbGlkYXRpb24pO1xuXHR9KTtcblxufSkoKTsiXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
