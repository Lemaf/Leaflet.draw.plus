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
			layer = layer.layer || layer;
			if (layer.editing) {
				layer.editing.disable();
				layer.off('edit', this._onLayerEdit, this);
			}
		},

		_enableEditing: function (layer) {
			layer = layer.layer || layer;
			if (layer.editing) {
				layer.editing.enable();
				layer.on('edit', this._onLayerEdit, this);
			}
		},

		_onLayerEdit: function (evt) {
			this._layer.fire('edit', {layer: evt.layer || evt.target});
		}
	});

	L.FeatureGroup.addInitHook(function () {

		if (!this.editing)
			this.editing = new L.FeatureGroup.Edit(this);

	});

})();
L.FeatureGroup.include({
	count: function () {
		var count = 0;

		for (var id in this._layers) {
			if (this._layers[id].count)
				count += this._layers[id].count();
			else
				count++;
		}

		return count;
	}
});
L.FeatureGroup.include({
	isEmpty: function() {

		var empty = true, deepEmpty = true;

		for (var id in this._layers) {
			empty = false;
			if (this._layers[id].isEmpty) {
				if (!this._layers[id].isEmpty())
					return false;
			} else
				deepEmpty = false;
		}

		return empty || deepEmpty;
	}
});
L.FeatureGroup.include({
	setLatLngs: function(latlngs) {
		var count = this.count(), layer;

		if (count === 1) {
			for (var id in this._layers) {
				layer = this._layers[id];

				if (layer.setLatLngs)
					layer.setLatLngs(latlngs);
				else
					throw new Error("L.FeatureGroup doesn't have a layer with setLatLngs");
			}
		} else if (count) {
			throw new Error('Ambigous setLatLngs');
		} else {
			throw new Error("Empty layer!");
		}

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

				featureGroup.jsts.clean();
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
			var self = this;
			setTimeout(function () {
				self._featureGroup.jsts.clean();
				self._validateTarget(methodName);
			});
		},

		_validateRestriction: function (methodName, evt) {

			if (this._featureGroup.isEmpty())
				return;

			var restrictionId = L.stamp(evt.target);

			if (!this._featureGroup.jsts[methodName](evt.target)) {

				if (!this._errors[methodName])
					this._errors[methodName] = [];

				if (this._errors[methodName].indexOf(restrictionId) === -1)
					this._errors[methodName].push(restrictionId);

				evt = {validation: methodName, targetLayer: this._featureGroup, restrictionLayer: evt.target};

				this.fire('invalid', evt);
				this.fireOnMap('draw:invalid', evt);
			} else {
				if (this._errors[methodName]) {
					var index = this._errors[methodName].indexOf(restrictionId);

					if (index > -1) {
						this._errors[methodName].splice(index, 1);

						if (this._errors[methodName].length === 0) {
							evt = {validation: methodName, targetLayer: this._featureGroup};
							this.fire('valid', evt);
							this.fireOnMap('draw:valid', evt);
						}
					}
				}
			}
		},

		_validateRestrictionFeature: function (methodName, evt) {
			var self = this;
			setTimeout(function () {
				var collectionId = self._collectionId(methodName),
				collection, restrictionLayer;

				if ((collection = self[collectionId])) {
					for (var i = 0; i < collection.length; i++) {
						if (collection[i].hasLayer(evt.target)) {

							(restrictionLayer = collection[i]).jsts.clean();
							break;
						}
					}
				}

				if (restrictionLayer) {
					self._validateRestriction(methodName, {target: restrictionLayer});
				}
			});
		},

		_validateTarget: function(methodName) {
			var evt, valid = true;

			if (this._errors[methodName] && this._errors[methodName].length)
				valid = false;

			this._errors[methodName] = [];

			if (this._featureGroup.isEmpty()) {
				if (!valid) {
					evt = {validation: methodName, targetLayer: this._featureGroup};
					this.fire('valid', evt);
					this.fireOnMap('draw:valid', evt);
				}

				return;
			}

			var restrictionLayers = this[this._collectionId(methodName)],
			method = this._featureGroup.jsts[methodName];

			if (restrictionLayers) {
				evt = {validation: methodName, targetLayer: this._featureGroup};

				restrictionLayers.forEach(function(restrictionLayer) {

					if (!method.call(this._featureGroup.jsts, restrictionLayer)) {

						this._errors[methodName].push(L.stamp(restrictionLayer));
						
						evt.restrictionLayer = restrictionLayer;

						this.fire('invalid', evt);
						this.fireOnMap('draw:invalid', evt);
					}

				}, this);

				if (!this._errors[methodName].length && !valid) {

					evt = {validation: methodName, targetLayer: this._featureGroup};
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkltcG9ydHMuanMiLCJTaGFwZVppcC5qcyIsIkwuRmVhdHVyZUdyb3VwLkVkaXQuanMiLCJMLkZlYXR1cmVHcm91cC5jb3VudC5qcyIsIkwuRmVhdHVyZUdyb3VwLmlzRW1wdHkuanMiLCJMLkZlYXR1cmVHcm91cC5zZXRMYXRMbmdzLmpzIiwiTC5HZW9KU09OLmlzRW1wdHkuanMiLCJMLkZlYXR1cmVHcm91cC5GaXhlci5qcyIsIkwuRmVhdHVyZUdyb3VwLlZhbGlkYXRpb24uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3BCQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNsRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImxlYWZsZXQuZHJhdy5wbHVzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiOyhmdW5jdGlvbigpIHtcblxuXHRpZiAoIUwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzKVxuXHRcdEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzID0ge307XG5cblx0TC5EcmF3LkltcG9ydHMgPSBMLkRyYXcuRmVhdHVyZS5leHRlbmQoe1xuXHRcdHN0YXRpY3M6IHtcblx0XHRcdEZPUk1BVFM6IFtdLFxuXHRcdFx0VFlQRTogJ2ltcG9ydHMnXG5cdFx0fSxcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uIChtYXAsIG9wdGlvbnMpIHtcblx0XHRcdHRoaXMudHlwZSA9IEwuRHJhdy5JbXBvcnRzLlRZUEU7XG5cblx0XHRcdEwuRHJhdy5GZWF0dXJlLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgbWFwLCBvcHRpb25zKTtcblx0XHR9LFxuXG5cdFx0Z2V0QWN0aW9uczogZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRyZXR1cm4gTC5EcmF3LkltcG9ydHMuRk9STUFUUy5tYXAoZnVuY3Rpb24oZm9ybWF0KSB7XG5cdFx0XHRcdHZhciBvd25FbGVtZW50ID0gbnVsbDtcblxuXHRcdFx0XHRpZiAoZm9ybWF0LmNyZWF0ZUFjdGlvbkVsZW1lbnQpXG5cdFx0XHRcdFx0b3duRWxlbWVudCA9IGZvcm1hdC5jcmVhdGVBY3Rpb25FbGVtZW50LmNhbGwodGhpcyk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHRpdGxlOiBmb3JtYXQudGl0bGUsXG5cdFx0XHRcdFx0dGV4dDogZm9ybWF0LnRleHQsXG5cdFx0XHRcdFx0Y2FsbGJhY2s6IGZvcm1hdC5jYWxsYmFjayxcblx0XHRcdFx0XHRjb250ZXh0OiB0aGlzLFxuXHRcdFx0XHRcdG93bkVsZW1lbnQ6IG93bkVsZW1lbnRcblx0XHRcdFx0fTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblx0fSk7XG5cbn0pKCk7IiwiOyhmdW5jdGlvbigpIHtcblxuXHRpZiAoIUwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwKSB7XG5cdFx0TC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXAgPSB7XG5cdFx0XHR0ZXh0OiAnSW1wb3J0IGEgc2hhcGVmaWxlIHppcCcsXG5cdFx0XHR0aXRsZTogJ1BsZWFzZSwgc2VsZWN0IGEgemlwIGZpbGUuJ1xuXHRcdH07XG5cdH1cblxuXHRTaHBaaXBGb3JtYXQgPSB7XG5cblx0XHRfaGFuZGxlcnM6IHt9LFxuXG5cdFx0X25leHRJZDogMSxcblxuXHRcdGNyZWF0ZU9wZW5CdXR0b246IGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGxpbmsgPSBMLkRvbVV0aWwuY3JlYXRlKCdhJyk7XG5cblx0XHRcdGxpbmsuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdFx0bGluay5pbm5lckhUTUwgPSBMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcC50ZXh0O1xuXHRcdFx0bGluay50aXRsZSA9IEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwLnRpdGxlO1xuXG5cdFx0XHR2YXIgaW5wdXQgPSBMLkRvbVV0aWwuY3JlYXRlKCdpbnB1dCcsICdsZWFmbGV0LWRyYXctZHJhdy1pbXBvcnRzLWFjdGlvbicsIGxpbmspO1xuXHRcdFx0aW5wdXQudHlwZSA9ICdmaWxlJztcblxuXHRcdFx0dmFyIGhhbmRsZXIgPSB0aGlzO1xuXG5cdFx0XHRpbnB1dC5vbmNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRTaHBaaXBGb3JtYXQuX29wZW5TaGFwZVppcChoYW5kbGVyLCBpbnB1dCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gbGluaztcblx0XHR9LFxuXG5cdFx0bm9wOiBmdW5jdGlvbigpIHt9LFxuXG5cdFx0X2dldFdvcmtlcjogZnVuY3Rpb24oKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3dvcmtlcikge1xuXHRcdFx0XHRpZiAoTC5EcmF3LkltcG9ydHMuU0hQSlNfVVJMKSB7XG5cblx0XHRcdFx0XHQvLyBObyBleHRlcm5hbCAuanMgc2NyaXB0XG5cdFx0XHRcdFx0dmFyIHNjcmlwdCA9IFwidHJ5IHsgaW1wb3J0U2NyaXB0cygnXCIgKyBMLkRyYXcuSW1wb3J0cy5TSFBKU19VUkwgKyBcIicpOyB9IGNhdGNoIChlKSB7Y29uc29sZS5lcnJvcihlKTsgdGhyb3cgZTt9XFxuXCIgK1xuXHRcdFx0XHRcdFwib25tZXNzYWdlID0gZnVuY3Rpb24oZSkge1xcblwiICtcblx0XHRcdFx0XHRcdFwiY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgU2hhcGVaaXAuLi4nKTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcInZhciBnZW9KU09OID0gc2hwLnBhcnNlWmlwKGUuZGF0YS5ieXRlQXJyYXkpO1xcblwiICtcblx0XHRcdFx0XHRcdFwiY29uc29sZS5sb2coJ1NoYXBlWmlwIHByb2Nlc3NlZCEnKTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcInBvc3RNZXNzYWdlKHtpZDogZS5kYXRhLmlkLCBnZW9KU09OOiBnZW9KU09OfSk7XFxuXCIgK1xuXHRcdFx0XHRcdFwifVwiO1xuXG5cdFx0XHRcdFx0dmFyIHVybERhdGEgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtzY3JpcHRdLCB7dHlwZTogXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCJ9KSk7XG5cdFx0XHRcdFx0dGhpcy5fd29ya2VyID0gbmV3IFdvcmtlcih1cmxEYXRhKTtcblxuXHRcdFx0XHRcdHRoaXMuX3dvcmtlci5vbm1lc3NhZ2UgPSB0aGlzLl9vbm1lc3NhZ2UuYmluZCh0aGlzKTtcblx0XHRcdFx0XHR0aGlzLl93b3JrZXIub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coYXJndW1lbnRzKTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05lZWQgc2hhcGVmaWxlLWpzIFVSTCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya2VyO1xuXHRcdH0sXG5cblx0XHRfb25tZXNzYWdlOiBmdW5jdGlvbihlKSB7XG5cdFx0XHR2YXIgZ2VvSlNPTiA9IGUuZGF0YS5nZW9KU09OO1xuXHRcdFx0dmFyIGhhbmRsZXIgPSB0aGlzLl9oYW5kbGVyc1tlLmRhdGEuaWRdO1xuXG5cdFx0XHQvLyBUT0RPOiBJcyBpdCBhbHdheXMgRmVhdHVyZUNvbGxlY3Rpb24/XG5cdFx0XHRcblx0XHRcdHZhciBwcm9wZXJ0aWVzLCBnZW9tZXRyeSwgbmV3RmVhdHVyZSwgaSwgbGF5ZXI7XG5cblx0XHRcdGdlb0pTT04uZmVhdHVyZXMuZm9yRWFjaChmdW5jdGlvbihmZWF0dXJlKSB7XG5cdFx0XHRcdHByb3BlcnRpZXMgPSBmZWF0dXJlLnByb3BlcnRpZXM7XG5cdFx0XHRcdGdlb21ldHJ5ID0gZmVhdHVyZS5nZW9tZXRyeTtcblxuXHRcdFx0XHRpZiAoZ2VvbWV0cnkudHlwZS5zdGFydHNXaXRoKFwiTXVsdGlcIikpIHtcblx0XHRcdFx0XHRmb3IgKGk9MDsgaSA8IGdlb21ldHJ5LmNvb3JkaW5hdGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRuZXdGZWF0dXJlID0ge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBnZW9tZXRyeS50eXBlLnN1YnN0cmluZyg1KSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczogcHJvcGVydGllcyxcblx0XHRcdFx0XHRcdFx0Y29vcmRpbmF0ZXM6IGdlb21ldHJ5LmNvb3JkaW5hdGVzW2ldXG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRsYXllciA9IEwuR2VvSlNPTi5nZW9tZXRyeVRvTGF5ZXIobmV3RmVhdHVyZSk7XG5cdFx0XHRcdFx0XHRoYW5kbGVyLl9maXJlQ3JlYXRlZEV2ZW50KGxheWVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGF5ZXIgPSBMLkdlb0pTT04uZ2VvbWV0cnlUb0xheWVyKGZlYXR1cmUpO1xuXHRcdFx0XHRcdGhhbmRsZXIuX2ZpcmVDcmVhdGVkRXZlbnQobGF5ZXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGFuZGxlci5kaXNhYmxlKCk7XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0X29wZW5TaGFwZVppcDogZnVuY3Rpb24oaGFuZGxlciwgaW5wdXQpIHtcblx0XHRcdGlmICghaW5wdXQuZmlsZXMgJiYgIWlucHV0LmZpbGVzWzBdKVxuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXG5cdFx0XHRyZWFkZXIub25sb2FkID0gZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0aWYgKHJlYWRlci5yZWFkeVN0YXRlICE9PSAyKVxuXHRcdFx0XHRcdHJldHVybjtcblxuXHRcdFx0XHRpZiAocmVhZGVyLnJlc3VsdCkge1xuXHRcdFx0XHRcdFNocFppcEZvcm1hdC5fcGFyc2UoaGFuZGxlciwgcmVhZGVyLnJlc3VsdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fTtcblxuXHRcdFx0aGFuZGxlci5fbWFwLmZpcmUoJ2RyYXc6aW1wb3J0c3RhcnQnKTtcblx0XHRcdHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihpbnB1dC5maWxlc1swXSk7XG5cdFx0fSxcblxuXHRcdF9wYXJzZTogZnVuY3Rpb24oaGFuZGxlciwgYnl0ZUFycmF5KSB7XG5cdFx0XHR2YXIgd29ya2VyID0gdGhpcy5fZ2V0V29ya2VyKCk7XG5cdFx0XHR2YXIgaWQgPSB0aGlzLl9uZXh0SWQrKztcblx0XHRcdHRoaXMuX2hhbmRsZXJzW2lkXSA9IGhhbmRsZXI7XG5cblx0XHRcdHdvcmtlci5wb3N0TWVzc2FnZSh7aWQ6IGlkLCBieXRlQXJyYXk6IGJ5dGVBcnJheX0sIFtieXRlQXJyYXldKTtcblx0XHR9LFxuXHR9O1xuXG5cdEwuRHJhdy5JbXBvcnRzLkZPUk1BVFMucHVzaCh7XG5cdFx0Y2FsbGJhY2s6IFNocFppcEZvcm1hdC5ub3AsXG5cdFx0Y3JlYXRlQWN0aW9uRWxlbWVudDogU2hwWmlwRm9ybWF0LmNyZWF0ZU9wZW5CdXR0b25cblxuXHR9KTtcbn0pKCk7IiwiKGZ1bmN0aW9uICgpIHtcblxuXHRMLkZlYXR1cmVHcm91cC5FZGl0ID0gTC5IYW5kbGVyLmV4dGVuZCh7XG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdHRoaXMuX2xheWVyID0gbGF5ZXI7XG5cdFx0fSxcblxuXHRcdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl9sYXllci5lYWNoTGF5ZXIodGhpcy5fZW5hYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vbignbGF5ZXJhZGQnLCB0aGlzLl9lbmFibGVFZGl0aW5nLCB0aGlzKTtcblx0XHRcdHRoaXMuX2xheWVyLm9uKCdsYXllcnJlbW92ZScsIHRoaXMuX2Rpc2FibGVFZGl0aW5nLCB0aGlzKTtcblx0XHR9LFxuXG5cdFx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuX2xheWVyLmVhY2hMYXllcih0aGlzLl9kaXNhYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vZmYoJ2xheWVyYWRkJywgdGhpcy5fZW5hYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vZmYoJ2xheWVycmVtb3ZlJywgdGhpcy5fZGlzYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdH0sXG5cblx0XHRfZGlzYWJsZUVkaXRpbmc6IGZ1bmN0aW9uIChsYXllcikge1xuXHRcdFx0bGF5ZXIgPSBsYXllci5sYXllciB8fCBsYXllcjtcblx0XHRcdGlmIChsYXllci5lZGl0aW5nKSB7XG5cdFx0XHRcdGxheWVyLmVkaXRpbmcuZGlzYWJsZSgpO1xuXHRcdFx0XHRsYXllci5vZmYoJ2VkaXQnLCB0aGlzLl9vbkxheWVyRWRpdCwgdGhpcyk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9lbmFibGVFZGl0aW5nOiBmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdGxheWVyID0gbGF5ZXIubGF5ZXIgfHwgbGF5ZXI7XG5cdFx0XHRpZiAobGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRsYXllci5lZGl0aW5nLmVuYWJsZSgpO1xuXHRcdFx0XHRsYXllci5vbignZWRpdCcsIHRoaXMuX29uTGF5ZXJFZGl0LCB0aGlzKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X29uTGF5ZXJFZGl0OiBmdW5jdGlvbiAoZXZ0KSB7XG5cdFx0XHR0aGlzLl9sYXllci5maXJlKCdlZGl0Jywge2xheWVyOiBldnQubGF5ZXIgfHwgZXZ0LnRhcmdldH0pO1xuXHRcdH1cblx0fSk7XG5cblx0TC5GZWF0dXJlR3JvdXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xuXG5cdFx0aWYgKCF0aGlzLmVkaXRpbmcpXG5cdFx0XHR0aGlzLmVkaXRpbmcgPSBuZXcgTC5GZWF0dXJlR3JvdXAuRWRpdCh0aGlzKTtcblxuXHR9KTtcblxufSkoKTsiLCJMLkZlYXR1cmVHcm91cC5pbmNsdWRlKHtcblx0Y291bnQ6IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgY291bnQgPSAwO1xuXG5cdFx0Zm9yICh2YXIgaWQgaW4gdGhpcy5fbGF5ZXJzKSB7XG5cdFx0XHRpZiAodGhpcy5fbGF5ZXJzW2lkXS5jb3VudClcblx0XHRcdFx0Y291bnQgKz0gdGhpcy5fbGF5ZXJzW2lkXS5jb3VudCgpO1xuXHRcdFx0ZWxzZVxuXHRcdFx0XHRjb3VudCsrO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb3VudDtcblx0fVxufSk7IiwiTC5GZWF0dXJlR3JvdXAuaW5jbHVkZSh7XG5cdGlzRW1wdHk6IGZ1bmN0aW9uKCkge1xuXG5cdFx0dmFyIGVtcHR5ID0gdHJ1ZSwgZGVlcEVtcHR5ID0gdHJ1ZTtcblxuXHRcdGZvciAodmFyIGlkIGluIHRoaXMuX2xheWVycykge1xuXHRcdFx0ZW1wdHkgPSBmYWxzZTtcblx0XHRcdGlmICh0aGlzLl9sYXllcnNbaWRdLmlzRW1wdHkpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9sYXllcnNbaWRdLmlzRW1wdHkoKSlcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2Vcblx0XHRcdFx0ZGVlcEVtcHR5ID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVtcHR5IHx8IGRlZXBFbXB0eTtcblx0fVxufSk7IiwiTC5GZWF0dXJlR3JvdXAuaW5jbHVkZSh7XG5cdHNldExhdExuZ3M6IGZ1bmN0aW9uKGxhdGxuZ3MpIHtcblx0XHR2YXIgY291bnQgPSB0aGlzLmNvdW50KCksIGxheWVyO1xuXG5cdFx0aWYgKGNvdW50ID09PSAxKSB7XG5cdFx0XHRmb3IgKHZhciBpZCBpbiB0aGlzLl9sYXllcnMpIHtcblx0XHRcdFx0bGF5ZXIgPSB0aGlzLl9sYXllcnNbaWRdO1xuXG5cdFx0XHRcdGlmIChsYXllci5zZXRMYXRMbmdzKVxuXHRcdFx0XHRcdGxheWVyLnNldExhdExuZ3MobGF0bG5ncyk7XG5cdFx0XHRcdGVsc2Vcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJMLkZlYXR1cmVHcm91cCBkb2Vzbid0IGhhdmUgYSBsYXllciB3aXRoIHNldExhdExuZ3NcIik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChjb3VudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBbWJpZ291cyBzZXRMYXRMbmdzJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkVtcHR5IGxheWVyIVwiKTtcblx0XHR9XG5cblx0fVxufSk7IiwiIiwiOyhmdW5jdGlvbiAoKSB7XG5cblx0dmFyIEZJWF9PUEVSQVRJT05TID0ge1xuXHRcdHdpdGhpbjoge1xuXHRcdFx0Y2hlY2s6ICdpbnRlcnNlY3RzJyxcblx0XHRcdGZpeDogWydpbnRlcnNlY3Rpb24nXVxuXHRcdH1cblx0fTtcblxuXHR2YXIgSlNUU19NRVRIT0RTID0ge1xuXHRcdHdpdGhpbjogJ3dpdGhpbidcblx0fTtcblxuXHRMLkZlYXR1cmVHcm91cC5GaXhlciA9IEwuQ2xhc3MuZXh0ZW5kKHtcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uICh2YWxpZGF0aW9uKSB7XG5cdFx0XHR0aGlzLl92YWxpZGF0aW9uID0gdmFsaWRhdGlvbjtcblx0XHR9LFxuXG5cdFx0d2l0aGluOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR2YXIgdmFsaWQgPSBzZWxmLl92YWxpZGF0aW9uLmlzVmFsaWQoSlNUU19NRVRIT0RTLndpdGhpbik7XG5cblx0XHRcdFx0aWYgKCF2YWxpZCkge1xuXHRcdFx0XHRcdHNlbGYuX2ZpeChKU1RTX01FVEhPRFMud2l0aGluLCBGSVhfT1BFUkFUSU9OUy53aXRoaW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0X2ZpeDogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIG9wZXJhdGlvbikge1xuXG5cblx0XHRcdGlmICghb3BlcmF0aW9uKVxuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdHZhciBjaGVja01ldGhvZCA9IG9wZXJhdGlvbi5jaGVjayxcblx0XHRcdGZpeE1ldGhvZHMgPSBvcGVyYXRpb24uZml4O1xuXG5cdFx0XHR0aGlzLl92YWxpZGF0aW9uLndhaXQobWV0aG9kTmFtZSwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHZhciBmZWF0dXJlR3JvdXAgPSB0aGlzLl92YWxpZGF0aW9uLmdldEZlYXR1cmVHcm91cCgpLFxuXHRcdFx0XHRyZXN0cmljdGlvbkxheWVycyA9IHRoaXMuX3ZhbGlkYXRpb24uZ2V0UmVzdHJpY3Rpb25MYXllcnMobWV0aG9kTmFtZSksXG5cdFx0XHRcdGZpeGVkR2VvbWV0cnksIGksIGZpeE1ldGhvZCwgcmVzdG9yZUVkaXQ7XG5cblx0XHRcdFx0ZnVuY3Rpb24gZml4TGF5ZXIgKGdlb21ldHJ5LCByZXN0cmljdGlvbkxheWVyKSB7XG5cblx0XHRcdFx0XHRyZXN0cmljdGlvbkdlb21ldHJ5ID0gcmVzdHJpY3Rpb25MYXllci5qc3RzLmdlb21ldHJ5KCk7XG5cblx0XHRcdFx0XHRpZiAoZ2VvbWV0cnlbY2hlY2tNZXRob2RdKHJlc3RyaWN0aW9uR2VvbWV0cnkpKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGkgPSAwOyBpIDwgZml4TWV0aG9kcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRmaXhNZXRob2QgPSBmaXhNZXRob2RzW2ldO1xuXG5cdFx0XHRcdFx0XHRcdGdlb21ldHJ5ID0gZ2VvbWV0cnlbZml4TWV0aG9kXShyZXN0cmljdGlvbkdlb21ldHJ5KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gZ2VvbWV0cnk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmZWF0dXJlR3JvdXAuZWFjaExheWVyKGZ1bmN0aW9uKGxheWVyKSB7XG5cdFx0XHRcdFx0Zml4ZWRHZW9tZXRyeSA9IHJlc3RyaWN0aW9uTGF5ZXJzLnJlZHVjZShmaXhMYXllciwgbGF5ZXIuanN0cy5nZW9tZXRyeSgpKTtcblxuXHRcdFx0XHRcdGlmIChmaXhlZEdlb21ldHJ5ICYmIGZpeGVkR2VvbWV0cnkgIT09IGxheWVyKSB7XG5cdFx0XHRcdFx0XHRpZiAobGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRcdFx0XHRyZXN0b3JlRWRpdCA9IGxheWVyLmVkaXRpbmcuZW5hYmxlZCgpO1xuXHRcdFx0XHRcdFx0XHRsYXllci5lZGl0aW5nLmRpc2FibGUoKTtcblx0XHRcdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRcdFx0XHRyZXN0b3JlRWRpdCA9IGZhbHNlO1xuXG5cdFx0XHRcdFx0XHRsYXllci5zZXRMYXRMbmdzKEwuanN0cy5qc3RzVG9MYXRMbmdzKGZpeGVkR2VvbWV0cnkpKTtcblxuXHRcdFx0XHRcdFx0aWYgKHJlc3RvcmVFZGl0KVxuXHRcdFx0XHRcdFx0XHRsYXllci5lZGl0aW5nLmVuYWJsZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0ZmVhdHVyZUdyb3VwLmpzdHMuY2xlYW4oKTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdFx0XG5cdFx0fVxuXHR9KTtcblxufSkoKTsiLCI7KGZ1bmN0aW9uKCkge1xuXG5cdHZhciBKU1RTX01FVEhPRFMgPSB7XG5cdFx0V2l0aGluOiAnd2l0aGluJ1xuXHR9O1xuXG5cdEwuRmVhdHVyZUdyb3VwLlZhbGlkYXRpb24gPSBMLkhhbmRsZXIuZXh0ZW5kKHtcblxuXHRcdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcblxuXHRcdG9wdGlvbnM6IHtcblxuXHRcdH0sXG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbihmZWF0dXJlR3JvdXApIHtcblx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cCA9IGZlYXR1cmVHcm91cDtcblx0XHRcdHRoaXMuX2JpbmRlZCA9IHt9O1xuXHRcdFx0dGhpcy5fZXJyb3JzID0ge307XG5cdFx0fSxcblxuXHRcdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbklkLCBjb2xsZWN0aW9uLCBtZXRob2ROYW1lO1xuXG5cdFx0XHRmb3IgKHZhciBuYW1lIGluIEpTVFNfTUVUSE9EUykge1xuXG5cdFx0XHRcdG1ldGhvZE5hbWUgPSBKU1RTX01FVEhPRFNbbmFtZV07XG5cblx0XHRcdFx0Y29sbGVjdGlvbklkID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXHRcdFx0XHRjb2xsZWN0aW9uID0gdGhpc1tjb2xsZWN0aW9uSWRdO1xuXHRcdFx0XHRpZiAoY29sbGVjdGlvbikge1xuXHRcdFx0XHRcdGNvbGxlY3Rpb24uZm9yRWFjaCh0aGlzLl93YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX3dhdGNoTWUobWV0aG9kTmFtZSk7XG5cdFx0XHR9XG5cblx0XHR9LFxuXG5cdFx0Z2V0UmVzdHJpY3Rpb25MYXllcnM6IGZ1bmN0aW9uIChtZXRob2ROYW1lKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbklkICA9IHRoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKTtcblx0XHRcdGlmICh0aGlzW2NvbGxlY3Rpb25JZF0pIHtcblx0XHRcdFx0cmV0dXJuIHRoaXNbY29sbGVjdGlvbklkXS5zbGljZSgwKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0Z2V0RmVhdHVyZUdyb3VwOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmVhdHVyZUdyb3VwO1xuXHRcdH0sXG5cblx0XHRpc1ZhbGlkOiBmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0XHRpZiAobWV0aG9kTmFtZSAmJiB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0pIHtcblx0XHRcdFx0cmV0dXJuICF0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRmaXJlT25NYXA6IGZ1bmN0aW9uIChldmVudE5hbWUsIGV2ZW50KSB7XG5cdFx0XHRpZiAodGhpcy5fZmVhdHVyZUdyb3VwLl9tYXApXG5cdFx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cC5fbWFwLmZpcmUoZXZlbnROYW1lLCBldmVudCk7XG5cdFx0fSxcblxuXHRcdHJlbW92ZUhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbklkLCBjb2xsZWN0aW9uLCBtZXRob2ROYW1lO1xuXG5cdFx0XHRmb3IgKHZhciBuYW1lIGluIEpTVFNfTUVUSE9EUykge1xuXG5cdFx0XHRcdG1ldGhvZE5hbWUgPSBKU1RTX01FVEhPRFNbbmFtZV07XG5cdFx0XHRcdGNvbGxlY3Rpb25JZCA9IHRoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKTtcblx0XHRcdFx0Y29sbGVjdGlvbiA9IHRoaXNbY29sbGVjdGlvbklkXTtcblxuXHRcdFx0XHRpZiAoY29sbGVjdGlvbilcblx0XHRcdFx0XHRjb2xsZWN0aW9uLmZvckVhY2godGhpcy5fdW53YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblxuXHRcdFx0XHR0aGlzLl91bndhdGNoTWUobWV0aG9kTmFtZSk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIERpc2FibGUgdGVtcG9yYXJpbHkgb24gdmFsaWRhdGlvbiBhbmQgZXhlY3V0ZSBmblxuXHRcdCAqIEBwYXJhbSAge1N0cmluZ30gICBvcCB2YWxpZGF0aW9uIG5hbWVcblx0XHQgKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gXG5cdFx0ICogQHBhcmFtICB7T2JqZWN0fSBjb250ZXh0IHRoaXNBcmdcblx0XHQgKiBAcmV0dXJuIHtBbnl9IGZuIHJlc3VsdFxuXHRcdCAqL1xuXHRcdHdhaXQ6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBmbiwgY29udGV4dCkge1xuXG5cdFx0XHR2YXIgY29sbGVjdGlvbklkID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRpZiAodGhpc1tjb2xsZWN0aW9uSWRdKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dGhpc1tjb2xsZWN0aW9uSWRdLmZvckVhY2godGhpcy5fdW53YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblx0XHRcdFx0XHR0aGlzLl91bndhdGNoTWUobWV0aG9kTmFtZSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gZm4uY2FsbChjb250ZXh0LCB0aGlzKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRpZiAodGhpcy5lbmFibGVkKCkpIHtcblx0XHRcdFx0XHRcdHRoaXNbY29sbGVjdGlvbklkXS5mb3JFYWNoKHRoaXMuX3dhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fd2F0Y2hNZShtZXRob2ROYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0d2l0aGluOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl9vbihKU1RTX01FVEhPRFMuV2l0aGluLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0sXG5cblx0XHRfY29sbGVjdGlvbklkOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXHRcdFx0cmV0dXJuIG1ldGhvZE5hbWUgPyAnXycgKyBtZXRob2ROYW1lICsgJ3MnIDogbnVsbDtcblx0XHR9LFxuXG5cdFx0X2dldEhhbmRsZXI6IGZ1bmN0aW9uKGhhbmRsZXIsIG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBpZCA9IEwuc3RhbXAoaGFuZGxlcik7XG5cblx0XHRcdGlmICghdGhpcy5fYmluZGVkW21ldGhvZE5hbWVdKVxuXHRcdFx0XHR0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV0gPSB7fTtcblxuXHRcdFx0aWYgKCF0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV1baWRdKVxuXHRcdFx0XHR0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV1baWRdID0gaGFuZGxlci5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5fYmluZGVkW21ldGhvZE5hbWVdW2lkXTtcblx0XHR9LFxuXG5cdFx0X29mZjogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uSWQgPSB0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSk7XG5cblx0XHRcdGlmICh0aGlzW2NvbGxlY3Rpb25JZF0pIHtcblx0XHRcdFx0dGhpc1tjb2xsZWN0aW9uSWRdLmZvckVhY2godGhpcy5fdW53YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblx0XHRcdFx0ZGVsZXRlIHRoaXNbY29sbGVjdGlvbklkXTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X29uOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgbGF5ZXJzKSB7XG5cdFx0XHR0aGlzLl9vZmYobWV0aG9kTmFtZSk7XG5cdFx0XHR0aGlzW3RoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKV0gPSBsYXllcnM7XG5cdFx0fSxcblxuXHRcdF92YWxpZGF0ZUZlYXR1cmU6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblx0XHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRzZWxmLl9mZWF0dXJlR3JvdXAuanN0cy5jbGVhbigpO1xuXHRcdFx0XHRzZWxmLl92YWxpZGF0ZVRhcmdldChtZXRob2ROYW1lKTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVSZXN0cmljdGlvbjogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGV2dCkge1xuXG5cdFx0XHRpZiAodGhpcy5fZmVhdHVyZUdyb3VwLmlzRW1wdHkoKSlcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHR2YXIgcmVzdHJpY3Rpb25JZCA9IEwuc3RhbXAoZXZ0LnRhcmdldCk7XG5cblx0XHRcdGlmICghdGhpcy5fZmVhdHVyZUdyb3VwLmpzdHNbbWV0aG9kTmFtZV0oZXZ0LnRhcmdldCkpIHtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSlcblx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0gPSBbXTtcblxuXHRcdFx0XHRpZiAodGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLmluZGV4T2YocmVzdHJpY3Rpb25JZCkgPT09IC0xKVxuXHRcdFx0XHRcdHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5wdXNoKHJlc3RyaWN0aW9uSWQpO1xuXG5cdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBtZXRob2ROYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwLCByZXN0cmljdGlvbkxheWVyOiBldnQudGFyZ2V0fTtcblxuXHRcdFx0XHR0aGlzLmZpcmUoJ2ludmFsaWQnLCBldnQpO1xuXHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzppbnZhbGlkJywgZXZ0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0pIHtcblx0XHRcdFx0XHR2YXIgaW5kZXggPSB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0uaW5kZXhPZihyZXN0cmljdGlvbklkKTtcblxuXHRcdFx0XHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0uc3BsaWNlKGluZGV4LCAxKTtcblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG1ldGhvZE5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6dmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVSZXN0cmljdGlvbkZlYXR1cmU6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblx0XHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHR2YXIgY29sbGVjdGlvbklkID0gc2VsZi5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpLFxuXHRcdFx0XHRjb2xsZWN0aW9uLCByZXN0cmljdGlvbkxheWVyO1xuXG5cdFx0XHRcdGlmICgoY29sbGVjdGlvbiA9IHNlbGZbY29sbGVjdGlvbklkXSkpIHtcblx0XHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGNvbGxlY3Rpb24ubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGlmIChjb2xsZWN0aW9uW2ldLmhhc0xheWVyKGV2dC50YXJnZXQpKSB7XG5cblx0XHRcdFx0XHRcdFx0KHJlc3RyaWN0aW9uTGF5ZXIgPSBjb2xsZWN0aW9uW2ldKS5qc3RzLmNsZWFuKCk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyZXN0cmljdGlvbkxheWVyKSB7XG5cdFx0XHRcdFx0c2VsZi5fdmFsaWRhdGVSZXN0cmljdGlvbihtZXRob2ROYW1lLCB7dGFyZ2V0OiByZXN0cmljdGlvbkxheWVyfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVUYXJnZXQ6IGZ1bmN0aW9uKG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBldnQsIHZhbGlkID0gdHJ1ZTtcblxuXHRcdFx0aWYgKHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSAmJiB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoKVxuXHRcdFx0XHR2YWxpZCA9IGZhbHNlO1xuXG5cdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0gPSBbXTtcblxuXHRcdFx0aWYgKHRoaXMuX2ZlYXR1cmVHcm91cC5pc0VtcHR5KCkpIHtcblx0XHRcdFx0aWYgKCF2YWxpZCkge1xuXHRcdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBtZXRob2ROYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwfTtcblx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzp2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHZhciByZXN0cmljdGlvbkxheWVycyA9IHRoaXNbdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpXSxcblx0XHRcdG1ldGhvZCA9IHRoaXMuX2ZlYXR1cmVHcm91cC5qc3RzW21ldGhvZE5hbWVdO1xuXG5cdFx0XHRpZiAocmVzdHJpY3Rpb25MYXllcnMpIHtcblx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG1ldGhvZE5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXG5cdFx0XHRcdHJlc3RyaWN0aW9uTGF5ZXJzLmZvckVhY2goZnVuY3Rpb24ocmVzdHJpY3Rpb25MYXllcikge1xuXG5cdFx0XHRcdFx0aWYgKCFtZXRob2QuY2FsbCh0aGlzLl9mZWF0dXJlR3JvdXAuanN0cywgcmVzdHJpY3Rpb25MYXllcikpIHtcblxuXHRcdFx0XHRcdFx0dGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLnB1c2goTC5zdGFtcChyZXN0cmljdGlvbkxheWVyKSk7XG5cdFx0XHRcdFx0XHRcblx0XHRcdFx0XHRcdGV2dC5yZXN0cmljdGlvbkxheWVyID0gcmVzdHJpY3Rpb25MYXllcjtcblxuXHRcdFx0XHRcdFx0dGhpcy5maXJlKCdpbnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OmludmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGggJiYgIXZhbGlkKSB7XG5cblx0XHRcdFx0XHRldnQgPSB7dmFsaWRhdGlvbjogbWV0aG9kTmFtZSwgdGFyZ2V0TGF5ZXI6IHRoaXMuX2ZlYXR1cmVHcm91cH07XG5cdFx0XHRcdFx0dGhpcy5maXJlKCd2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6dmFsaWQnLCBldnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF91bndhdGNoOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZmVhdHVyZUdyb3VwKSB7XG5cdFx0XHR2YXIgd2F0Y2hlciA9IHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVSZXN0cmljdGlvbiwgbWV0aG9kTmFtZSk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5vZmYoJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcnJlbW92ZScsIHdhdGNoZXIpO1xuXG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fd2F0Y2hSZXN0cmljdGlvbkZlYXR1cmUsIG1ldGhvZE5hbWUpKTtcblxuXHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdFx0aWYgKGxheWVyLmVkaXRpbmcpIHtcblx0XHRcdFx0XHRsYXllci5vZmYoJ2VkaXQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlUmVzdHJpY3Rpb25GZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMpO1xuXHRcdH0sXG5cblx0XHRfdW53YXRjaE1lOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAuZWFjaExheWVyKGZ1bmN0aW9uIChsYXllcikge1xuXHRcdFx0XHRpZiAobGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRcdGxheWVyLm9mZignZWRpdCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVGZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fd2F0Y2hGZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCBsYXllcnJlbW92ZScsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVUYXJnZXQsIG1ldGhvZE5hbWUpKTtcblx0XHR9LFxuXG5cdFx0X3dhdGNoOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZmVhdHVyZUdyb3VwKSB7XG5cblx0XHRcdHZhciB3YXRjaGVyID0gdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZVJlc3RyaWN0aW9uLCBtZXRob2ROYW1lKTtcblxuXHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdFx0dGhpcy5fd2F0Y2hSZXN0cmljdGlvbkZlYXR1cmUobWV0aG9kTmFtZSwge2xheWVyOiBsYXllcn0pO1xuXHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5vbignbGF5ZXJhZGQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3dhdGNoUmVzdHJpY3Rpb25GZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVycmVtb3ZlJywgd2F0Y2hlcik7XG5cdFx0fSxcblxuXHRcdF93YXRjaEZlYXR1cmU6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblx0XHRcdGlmIChldnQubGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRldnQubGF5ZXIub24oJ2VkaXQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlRmVhdHVyZSwgbWV0aG9kTmFtZSkpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfd2F0Y2hNZTogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblxuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdFx0dGhpcy5fd2F0Y2hGZWF0dXJlKG1ldGhvZE5hbWUsIHtsYXllcjogbGF5ZXJ9KTtcblx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkJywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl93YXRjaEZlYXR1cmUsIG1ldGhvZE5hbWUpKTtcblx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cC5vbignbGF5ZXJhZGQgbGF5ZXJyZW1vdmUnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlVGFyZ2V0LCBtZXRob2ROYW1lKSk7XG5cdFx0fSxcblxuXHRcdF93YXRjaFJlc3RyaWN0aW9uRmVhdHVyZTogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGV2dCkge1xuXHRcdFx0aWYgKGV2dC5sYXllci5lZGl0aW5nKSB7XG5cdFx0XHRcdGV2dC5sYXllci5vbignZWRpdCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVSZXN0cmljdGlvbkZlYXR1cmUsIG1ldGhvZE5hbWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0fSk7XG5cblxuXHRMLkZlYXR1cmVHcm91cC5hZGRJbml0SG9vayhmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF0aGlzLnZhbGlkYXRpb24pXG5cdFx0XHR0aGlzLnZhbGlkYXRpb24gPSBuZXcgTC5GZWF0dXJlR3JvdXAuVmFsaWRhdGlvbih0aGlzKTtcblxuXHRcdGlmICghdGhpcy5maXgpXG5cdFx0XHR0aGlzLmZpeCA9IG5ldyBMLkZlYXR1cmVHcm91cC5GaXhlcih0aGlzLnZhbGlkYXRpb24pO1xuXHR9KTtcblxufSkoKTsiXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
