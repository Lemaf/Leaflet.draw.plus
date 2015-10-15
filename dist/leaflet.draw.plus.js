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
L.FeatureGroup.addInitHook(function() {

	if (L.Jsts)
		this.on('edit', this.jsts.clean, this.jsts);

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
				fixedGeometry, i, fixMethod, restoreEdit, filtered;

				function fixLayer (geometry, restrictionLayer) {
					restrictionGeometry = restrictionLayer.jsts.geometry();

					for (i = 0; i < fixMethods.length; i++) {
						fixMethod = fixMethods[i];

						geometry = L.jsts[fixMethod](geometry, restrictionGeometry);
					}

					return geometry;
				}

				featureGroup.eachLayer(function(layer) {

					filtered = restrictionLayers.filter(function (restrictionLayer) {
						return (layer.jsts.geometry())[checkMethod](restrictionLayer.jsts.geometry());
					});

					if (filtered.length) {

						fixedGeometry = filtered.reduce(fixLayer, layer.jsts.geometry());

						if (fixedGeometry && fixedGeometry !== layer) {
							if (layer.editing) {
								restoreEdit = layer.editing.enabled();
								layer.editing.disable();
							} else
								restoreEdit = false;

							if (fixedGeometry instanceof jsts.geom.MultiPolygon) {
								featureGroup.removeLayer(layer);

								var options = layer.options;

								for (var i=0, il = fixedGeometry.getNumGeometries(); i < il; i++) {
									layer = L.jsts.jstsToleaflet(fixedGeometry.getGeometryN(i), options);
									featureGroup.addLayer(layer);
									if (restoreEdit && layer.editing)
										layer.editing.enable();
								}

							} else {
								layer.setLatLngs(L.jsts.jstsToLatLngs(fixedGeometry));

								if (restoreEdit)
									layer.editing.enable();
							}
						}
					} else {
						featureGroup.removeLayer(layer);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkltcG9ydHMuanMiLCJTaGFwZVppcC5qcyIsIkwuRmVhdHVyZUdyb3VwLkVkaXQuanMiLCJMLkZlYXR1cmVHcm91cC5jb3VudC5qcyIsIkwuRmVhdHVyZUdyb3VwLmlzRW1wdHkuanMiLCJMLkZlYXR1cmVHcm91cC5qcyIsIkwuRmVhdHVyZUdyb3VwLnNldExhdExuZ3MuanMiLCJMLkdlb0pTT04uaXNFbXB0eS5qcyIsIkwuRmVhdHVyZUdyb3VwLkZpeGVyLmpzIiwiTC5GZWF0dXJlR3JvdXAuVmFsaWRhdGlvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNsSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcEJBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3ZHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoibGVhZmxldC5kcmF3LnBsdXMuanMiLCJzb3VyY2VzQ29udGVudCI6WyI7KGZ1bmN0aW9uKCkge1xuXG5cdGlmICghTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMpXG5cdFx0TC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMgPSB7fTtcblxuXHRMLkRyYXcuSW1wb3J0cyA9IEwuRHJhdy5GZWF0dXJlLmV4dGVuZCh7XG5cdFx0c3RhdGljczoge1xuXHRcdFx0Rk9STUFUUzogW10sXG5cdFx0XHRUWVBFOiAnaW1wb3J0cydcblx0XHR9LFxuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG1hcCwgb3B0aW9ucykge1xuXHRcdFx0dGhpcy50eXBlID0gTC5EcmF3LkltcG9ydHMuVFlQRTtcblxuXHRcdFx0TC5EcmF3LkZlYXR1cmUucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBtYXAsIG9wdGlvbnMpO1xuXHRcdH0sXG5cblx0XHRnZXRBY3Rpb25zOiBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdHJldHVybiBMLkRyYXcuSW1wb3J0cy5GT1JNQVRTLm1hcChmdW5jdGlvbihmb3JtYXQpIHtcblx0XHRcdFx0dmFyIG93bkVsZW1lbnQgPSBudWxsO1xuXG5cdFx0XHRcdGlmIChmb3JtYXQuY3JlYXRlQWN0aW9uRWxlbWVudClcblx0XHRcdFx0XHRvd25FbGVtZW50ID0gZm9ybWF0LmNyZWF0ZUFjdGlvbkVsZW1lbnQuY2FsbCh0aGlzKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0dGl0bGU6IGZvcm1hdC50aXRsZSxcblx0XHRcdFx0XHR0ZXh0OiBmb3JtYXQudGV4dCxcblx0XHRcdFx0XHRjYWxsYmFjazogZm9ybWF0LmNhbGxiYWNrLFxuXHRcdFx0XHRcdGNvbnRleHQ6IHRoaXMsXG5cdFx0XHRcdFx0b3duRWxlbWVudDogb3duRWxlbWVudFxuXHRcdFx0XHR9O1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fVxuXHR9KTtcblxufSkoKTsiLCI7KGZ1bmN0aW9uKCkge1xuXG5cdGlmICghTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXApIHtcblx0XHRMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcCA9IHtcblx0XHRcdHRleHQ6ICdJbXBvcnQgYSBzaGFwZWZpbGUgemlwJyxcblx0XHRcdHRpdGxlOiAnUGxlYXNlLCBzZWxlY3QgYSB6aXAgZmlsZS4nXG5cdFx0fTtcblx0fVxuXG5cdFNocFppcEZvcm1hdCA9IHtcblxuXHRcdF9oYW5kbGVyczoge30sXG5cblx0XHRfbmV4dElkOiAxLFxuXG5cdFx0Y3JlYXRlT3BlbkJ1dHRvbjogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgbGluayA9IEwuRG9tVXRpbC5jcmVhdGUoJ2EnKTtcblxuXHRcdFx0bGluay5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0XHRsaW5rLmlubmVySFRNTCA9IEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwLnRleHQ7XG5cdFx0XHRsaW5rLnRpdGxlID0gTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXAudGl0bGU7XG5cblx0XHRcdHZhciBpbnB1dCA9IEwuRG9tVXRpbC5jcmVhdGUoJ2lucHV0JywgJ2xlYWZsZXQtZHJhdy1kcmF3LWltcG9ydHMtYWN0aW9uJywgbGluayk7XG5cdFx0XHRpbnB1dC50eXBlID0gJ2ZpbGUnO1xuXG5cdFx0XHR2YXIgaGFuZGxlciA9IHRoaXM7XG5cblx0XHRcdGlucHV0Lm9uY2hhbmdlID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFNocFppcEZvcm1hdC5fb3BlblNoYXBlWmlwKGhhbmRsZXIsIGlucHV0KTtcblx0XHRcdH07XG5cblx0XHRcdHJldHVybiBsaW5rO1xuXHRcdH0sXG5cblx0XHRub3A6IGZ1bmN0aW9uKCkge30sXG5cblx0XHRfZ2V0V29ya2VyOiBmdW5jdGlvbigpIHtcblx0XHRcdGlmICghdGhpcy5fd29ya2VyKSB7XG5cdFx0XHRcdGlmIChMLkRyYXcuSW1wb3J0cy5TSFBKU19VUkwpIHtcblxuXHRcdFx0XHRcdC8vIE5vIGV4dGVybmFsIC5qcyBzY3JpcHRcblx0XHRcdFx0XHR2YXIgc2NyaXB0ID0gXCJ0cnkgeyBpbXBvcnRTY3JpcHRzKCdcIiArIEwuRHJhdy5JbXBvcnRzLlNIUEpTX1VSTCArIFwiJyk7IH0gY2F0Y2ggKGUpIHtjb25zb2xlLmVycm9yKGUpOyB0aHJvdyBlO31cXG5cIiArXG5cdFx0XHRcdFx0XCJvbm1lc3NhZ2UgPSBmdW5jdGlvbihlKSB7XFxuXCIgK1xuXHRcdFx0XHRcdFx0XCJjb25zb2xlLmxvZygnUHJvY2Vzc2luZyBTaGFwZVppcC4uLicpO1xcblwiICtcblx0XHRcdFx0XHRcdFwidmFyIGdlb0pTT04gPSBzaHAucGFyc2VaaXAoZS5kYXRhLmJ5dGVBcnJheSk7XFxuXCIgK1xuXHRcdFx0XHRcdFx0XCJjb25zb2xlLmxvZygnU2hhcGVaaXAgcHJvY2Vzc2VkIScpO1xcblwiICtcblx0XHRcdFx0XHRcdFwicG9zdE1lc3NhZ2Uoe2lkOiBlLmRhdGEuaWQsIGdlb0pTT046IGdlb0pTT059KTtcXG5cIiArXG5cdFx0XHRcdFx0XCJ9XCI7XG5cblx0XHRcdFx0XHR2YXIgdXJsRGF0YSA9IFVSTC5jcmVhdGVPYmplY3RVUkwobmV3IEJsb2IoW3NjcmlwdF0sIHt0eXBlOiBcImFwcGxpY2F0aW9uL2phdmFzY3JpcHRcIn0pKTtcblx0XHRcdFx0XHR0aGlzLl93b3JrZXIgPSBuZXcgV29ya2VyKHVybERhdGEpO1xuXG5cdFx0XHRcdFx0dGhpcy5fd29ya2VyLm9ubWVzc2FnZSA9IHRoaXMuX29ubWVzc2FnZS5iaW5kKHRoaXMpO1xuXHRcdFx0XHRcdHRoaXMuX3dvcmtlci5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhhcmd1bWVudHMpO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignTmVlZCBzaGFwZWZpbGUtanMgVVJMJyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLl93b3JrZXI7XG5cdFx0fSxcblxuXHRcdF9vbm1lc3NhZ2U6IGZ1bmN0aW9uKGUpIHtcblx0XHRcdHZhciBnZW9KU09OID0gZS5kYXRhLmdlb0pTT047XG5cdFx0XHR2YXIgaGFuZGxlciA9IHRoaXMuX2hhbmRsZXJzW2UuZGF0YS5pZF07XG5cblx0XHRcdC8vIFRPRE86IElzIGl0IGFsd2F5cyBGZWF0dXJlQ29sbGVjdGlvbj9cblx0XHRcdFxuXHRcdFx0dmFyIHByb3BlcnRpZXMsIGdlb21ldHJ5LCBuZXdGZWF0dXJlLCBpLCBsYXllcjtcblxuXHRcdFx0Z2VvSlNPTi5mZWF0dXJlcy5mb3JFYWNoKGZ1bmN0aW9uKGZlYXR1cmUpIHtcblx0XHRcdFx0cHJvcGVydGllcyA9IGZlYXR1cmUucHJvcGVydGllcztcblx0XHRcdFx0Z2VvbWV0cnkgPSBmZWF0dXJlLmdlb21ldHJ5O1xuXG5cdFx0XHRcdGlmIChnZW9tZXRyeS50eXBlLnN0YXJ0c1dpdGgoXCJNdWx0aVwiKSkge1xuXHRcdFx0XHRcdGZvciAoaT0wOyBpIDwgZ2VvbWV0cnkuY29vcmRpbmF0ZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdG5ld0ZlYXR1cmUgPSB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IGdlb21ldHJ5LnR5cGUuc3Vic3RyaW5nKDUpLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzLFxuXHRcdFx0XHRcdFx0XHRjb29yZGluYXRlczogZ2VvbWV0cnkuY29vcmRpbmF0ZXNbaV1cblx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdGxheWVyID0gTC5HZW9KU09OLmdlb21ldHJ5VG9MYXllcihuZXdGZWF0dXJlKTtcblx0XHRcdFx0XHRcdGhhbmRsZXIuX2ZpcmVDcmVhdGVkRXZlbnQobGF5ZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsYXllciA9IEwuR2VvSlNPTi5nZW9tZXRyeVRvTGF5ZXIoZmVhdHVyZSk7XG5cdFx0XHRcdFx0aGFuZGxlci5fZmlyZUNyZWF0ZWRFdmVudChsYXllcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRoYW5kbGVyLmRpc2FibGUoKTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cblx0XHRfb3BlblNoYXBlWmlwOiBmdW5jdGlvbihoYW5kbGVyLCBpbnB1dCkge1xuXHRcdFx0aWYgKCFpbnB1dC5maWxlcyAmJiAhaW5wdXQuZmlsZXNbMF0pXG5cdFx0XHRcdHJldHVybjtcblxuXHRcdFx0dmFyIHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG5cblx0XHRcdHJlYWRlci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcblxuXHRcdFx0XHRpZiAocmVhZGVyLnJlYWR5U3RhdGUgIT09IDIpXG5cdFx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHRcdGlmIChyZWFkZXIucmVzdWx0KSB7XG5cdFx0XHRcdFx0U2hwWmlwRm9ybWF0Ll9wYXJzZShoYW5kbGVyLCByZWFkZXIucmVzdWx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHR9O1xuXG5cdFx0XHRoYW5kbGVyLl9tYXAuZmlyZSgnZHJhdzppbXBvcnRzdGFydCcpO1xuXHRcdFx0cmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGlucHV0LmZpbGVzWzBdKTtcblx0XHR9LFxuXG5cdFx0X3BhcnNlOiBmdW5jdGlvbihoYW5kbGVyLCBieXRlQXJyYXkpIHtcblx0XHRcdHZhciB3b3JrZXIgPSB0aGlzLl9nZXRXb3JrZXIoKTtcblx0XHRcdHZhciBpZCA9IHRoaXMuX25leHRJZCsrO1xuXHRcdFx0dGhpcy5faGFuZGxlcnNbaWRdID0gaGFuZGxlcjtcblxuXHRcdFx0d29ya2VyLnBvc3RNZXNzYWdlKHtpZDogaWQsIGJ5dGVBcnJheTogYnl0ZUFycmF5fSwgW2J5dGVBcnJheV0pO1xuXHRcdH0sXG5cdH07XG5cblx0TC5EcmF3LkltcG9ydHMuRk9STUFUUy5wdXNoKHtcblx0XHRjYWxsYmFjazogU2hwWmlwRm9ybWF0Lm5vcCxcblx0XHRjcmVhdGVBY3Rpb25FbGVtZW50OiBTaHBaaXBGb3JtYXQuY3JlYXRlT3BlbkJ1dHRvblxuXG5cdH0pO1xufSkoKTsiLCIoZnVuY3Rpb24gKCkge1xuXG5cdEwuRmVhdHVyZUdyb3VwLkVkaXQgPSBMLkhhbmRsZXIuZXh0ZW5kKHtcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uIChsYXllcikge1xuXHRcdFx0dGhpcy5fbGF5ZXIgPSBsYXllcjtcblx0XHR9LFxuXG5cdFx0YWRkSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuX2xheWVyLmVhY2hMYXllcih0aGlzLl9lbmFibGVFZGl0aW5nLCB0aGlzKTtcblx0XHRcdHRoaXMuX2xheWVyLm9uKCdsYXllcmFkZCcsIHRoaXMuX2VuYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdFx0dGhpcy5fbGF5ZXIub24oJ2xheWVycmVtb3ZlJywgdGhpcy5fZGlzYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdH0sXG5cblx0XHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy5fbGF5ZXIuZWFjaExheWVyKHRoaXMuX2Rpc2FibGVFZGl0aW5nLCB0aGlzKTtcblx0XHRcdHRoaXMuX2xheWVyLm9mZignbGF5ZXJhZGQnLCB0aGlzLl9lbmFibGVFZGl0aW5nLCB0aGlzKTtcblx0XHRcdHRoaXMuX2xheWVyLm9mZignbGF5ZXJyZW1vdmUnLCB0aGlzLl9kaXNhYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0fSxcblxuXHRcdF9kaXNhYmxlRWRpdGluZzogZnVuY3Rpb24gKGxheWVyKSB7XG5cdFx0XHRsYXllciA9IGxheWVyLmxheWVyIHx8IGxheWVyO1xuXHRcdFx0aWYgKGxheWVyLmVkaXRpbmcpIHtcblx0XHRcdFx0bGF5ZXIuZWRpdGluZy5kaXNhYmxlKCk7XG5cdFx0XHRcdGxheWVyLm9mZignZWRpdCcsIHRoaXMuX29uTGF5ZXJFZGl0LCB0aGlzKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X2VuYWJsZUVkaXRpbmc6IGZ1bmN0aW9uIChsYXllcikge1xuXHRcdFx0bGF5ZXIgPSBsYXllci5sYXllciB8fCBsYXllcjtcblx0XHRcdGlmIChsYXllci5lZGl0aW5nKSB7XG5cdFx0XHRcdGxheWVyLmVkaXRpbmcuZW5hYmxlKCk7XG5cdFx0XHRcdGxheWVyLm9uKCdlZGl0JywgdGhpcy5fb25MYXllckVkaXQsIHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfb25MYXllckVkaXQ6IGZ1bmN0aW9uIChldnQpIHtcblx0XHRcdHRoaXMuX2xheWVyLmZpcmUoJ2VkaXQnLCB7bGF5ZXI6IGV2dC5sYXllciB8fCBldnQudGFyZ2V0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRMLkZlYXR1cmVHcm91cC5hZGRJbml0SG9vayhmdW5jdGlvbiAoKSB7XG5cblx0XHRpZiAoIXRoaXMuZWRpdGluZylcblx0XHRcdHRoaXMuZWRpdGluZyA9IG5ldyBMLkZlYXR1cmVHcm91cC5FZGl0KHRoaXMpO1xuXG5cdH0pO1xuXG59KSgpOyIsIkwuRmVhdHVyZUdyb3VwLmluY2x1ZGUoe1xuXHRjb3VudDogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBjb3VudCA9IDA7XG5cblx0XHRmb3IgKHZhciBpZCBpbiB0aGlzLl9sYXllcnMpIHtcblx0XHRcdGlmICh0aGlzLl9sYXllcnNbaWRdLmNvdW50KVxuXHRcdFx0XHRjb3VudCArPSB0aGlzLl9sYXllcnNbaWRdLmNvdW50KCk7XG5cdFx0XHRlbHNlXG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvdW50O1xuXHR9XG59KTsiLCJMLkZlYXR1cmVHcm91cC5pbmNsdWRlKHtcblx0aXNFbXB0eTogZnVuY3Rpb24oKSB7XG5cblx0XHR2YXIgZW1wdHkgPSB0cnVlLCBkZWVwRW1wdHkgPSB0cnVlO1xuXG5cdFx0Zm9yICh2YXIgaWQgaW4gdGhpcy5fbGF5ZXJzKSB7XG5cdFx0XHRlbXB0eSA9IGZhbHNlO1xuXHRcdFx0aWYgKHRoaXMuX2xheWVyc1tpZF0uaXNFbXB0eSkge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2xheWVyc1tpZF0uaXNFbXB0eSgpKVxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0gZWxzZVxuXHRcdFx0XHRkZWVwRW1wdHkgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZW1wdHkgfHwgZGVlcEVtcHR5O1xuXHR9XG59KTsiLCJMLkZlYXR1cmVHcm91cC5hZGRJbml0SG9vayhmdW5jdGlvbigpIHtcblxuXHRpZiAoTC5Kc3RzKVxuXHRcdHRoaXMub24oJ2VkaXQnLCB0aGlzLmpzdHMuY2xlYW4sIHRoaXMuanN0cyk7XG5cbn0pOyIsIkwuRmVhdHVyZUdyb3VwLmluY2x1ZGUoe1xuXHRzZXRMYXRMbmdzOiBmdW5jdGlvbihsYXRsbmdzKSB7XG5cdFx0dmFyIGNvdW50ID0gdGhpcy5jb3VudCgpLCBsYXllcjtcblxuXHRcdGlmIChjb3VudCA9PT0gMSkge1xuXHRcdFx0Zm9yICh2YXIgaWQgaW4gdGhpcy5fbGF5ZXJzKSB7XG5cdFx0XHRcdGxheWVyID0gdGhpcy5fbGF5ZXJzW2lkXTtcblxuXHRcdFx0XHRpZiAobGF5ZXIuc2V0TGF0TG5ncylcblx0XHRcdFx0XHRsYXllci5zZXRMYXRMbmdzKGxhdGxuZ3MpO1xuXHRcdFx0XHRlbHNlXG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiTC5GZWF0dXJlR3JvdXAgZG9lc24ndCBoYXZlIGEgbGF5ZXIgd2l0aCBzZXRMYXRMbmdzXCIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoY291bnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQW1iaWdvdXMgc2V0TGF0TG5ncycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFbXB0eSBsYXllciFcIik7XG5cdFx0fVxuXG5cdH1cbn0pOyIsIiIsIjsoZnVuY3Rpb24gKCkge1xuXG5cdHZhciBGSVhfT1BFUkFUSU9OUyA9IHtcblx0XHR3aXRoaW46IHtcblx0XHRcdGNoZWNrOiAnaW50ZXJzZWN0cycsXG5cdFx0XHRmaXg6IFsnaW50ZXJzZWN0aW9uJ11cblx0XHR9XG5cdH07XG5cblx0dmFyIEpTVFNfTUVUSE9EUyA9IHtcblx0XHR3aXRoaW46ICd3aXRoaW4nXG5cdH07XG5cblx0TC5GZWF0dXJlR3JvdXAuRml4ZXIgPSBMLkNsYXNzLmV4dGVuZCh7XG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAodmFsaWRhdGlvbikge1xuXHRcdFx0dGhpcy5fdmFsaWRhdGlvbiA9IHZhbGlkYXRpb247XG5cdFx0fSxcblxuXHRcdHdpdGhpbjogZnVuY3Rpb24gKCkge1xuXHRcdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRcdFx0dmFyIHZhbGlkID0gc2VsZi5fdmFsaWRhdGlvbi5pc1ZhbGlkKEpTVFNfTUVUSE9EUy53aXRoaW4pO1xuXG5cdFx0XHRcdGlmICghdmFsaWQpIHtcblx0XHRcdFx0XHRzZWxmLl9maXgoSlNUU19NRVRIT0RTLndpdGhpbiwgRklYX09QRVJBVElPTlMud2l0aGluKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSxcblxuXHRcdF9maXg6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBvcGVyYXRpb24pIHtcblxuXG5cdFx0XHRpZiAoIW9wZXJhdGlvbilcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHR2YXIgY2hlY2tNZXRob2QgPSBvcGVyYXRpb24uY2hlY2ssXG5cdFx0XHRmaXhNZXRob2RzID0gb3BlcmF0aW9uLmZpeDtcblxuXHRcdFx0dGhpcy5fdmFsaWRhdGlvbi53YWl0KG1ldGhvZE5hbWUsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR2YXIgZmVhdHVyZUdyb3VwID0gdGhpcy5fdmFsaWRhdGlvbi5nZXRGZWF0dXJlR3JvdXAoKSxcblx0XHRcdFx0cmVzdHJpY3Rpb25MYXllcnMgPSB0aGlzLl92YWxpZGF0aW9uLmdldFJlc3RyaWN0aW9uTGF5ZXJzKG1ldGhvZE5hbWUpLFxuXHRcdFx0XHRmaXhlZEdlb21ldHJ5LCBpLCBmaXhNZXRob2QsIHJlc3RvcmVFZGl0LCBmaWx0ZXJlZDtcblxuXHRcdFx0XHRmdW5jdGlvbiBmaXhMYXllciAoZ2VvbWV0cnksIHJlc3RyaWN0aW9uTGF5ZXIpIHtcblx0XHRcdFx0XHRyZXN0cmljdGlvbkdlb21ldHJ5ID0gcmVzdHJpY3Rpb25MYXllci5qc3RzLmdlb21ldHJ5KCk7XG5cblx0XHRcdFx0XHRmb3IgKGkgPSAwOyBpIDwgZml4TWV0aG9kcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0Zml4TWV0aG9kID0gZml4TWV0aG9kc1tpXTtcblxuXHRcdFx0XHRcdFx0Z2VvbWV0cnkgPSBMLmpzdHNbZml4TWV0aG9kXShnZW9tZXRyeSwgcmVzdHJpY3Rpb25HZW9tZXRyeSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGdlb21ldHJ5O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbihsYXllcikge1xuXG5cdFx0XHRcdFx0ZmlsdGVyZWQgPSByZXN0cmljdGlvbkxheWVycy5maWx0ZXIoZnVuY3Rpb24gKHJlc3RyaWN0aW9uTGF5ZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiAobGF5ZXIuanN0cy5nZW9tZXRyeSgpKVtjaGVja01ldGhvZF0ocmVzdHJpY3Rpb25MYXllci5qc3RzLmdlb21ldHJ5KCkpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKGZpbHRlcmVkLmxlbmd0aCkge1xuXG5cdFx0XHRcdFx0XHRmaXhlZEdlb21ldHJ5ID0gZmlsdGVyZWQucmVkdWNlKGZpeExheWVyLCBsYXllci5qc3RzLmdlb21ldHJ5KCkpO1xuXG5cdFx0XHRcdFx0XHRpZiAoZml4ZWRHZW9tZXRyeSAmJiBmaXhlZEdlb21ldHJ5ICE9PSBsYXllcikge1xuXHRcdFx0XHRcdFx0XHRpZiAobGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRcdFx0XHRcdHJlc3RvcmVFZGl0ID0gbGF5ZXIuZWRpdGluZy5lbmFibGVkKCk7XG5cdFx0XHRcdFx0XHRcdFx0bGF5ZXIuZWRpdGluZy5kaXNhYmxlKCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRcdFx0XHRcdHJlc3RvcmVFZGl0ID0gZmFsc2U7XG5cblx0XHRcdFx0XHRcdFx0aWYgKGZpeGVkR2VvbWV0cnkgaW5zdGFuY2VvZiBqc3RzLmdlb20uTXVsdGlQb2x5Z29uKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZmVhdHVyZUdyb3VwLnJlbW92ZUxheWVyKGxheWVyKTtcblxuXHRcdFx0XHRcdFx0XHRcdHZhciBvcHRpb25zID0gbGF5ZXIub3B0aW9ucztcblxuXHRcdFx0XHRcdFx0XHRcdGZvciAodmFyIGk9MCwgaWwgPSBmaXhlZEdlb21ldHJ5LmdldE51bUdlb21ldHJpZXMoKTsgaSA8IGlsOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRcdGxheWVyID0gTC5qc3RzLmpzdHNUb2xlYWZsZXQoZml4ZWRHZW9tZXRyeS5nZXRHZW9tZXRyeU4oaSksIG9wdGlvbnMpO1xuXHRcdFx0XHRcdFx0XHRcdFx0ZmVhdHVyZUdyb3VwLmFkZExheWVyKGxheWVyKTtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChyZXN0b3JlRWRpdCAmJiBsYXllci5lZGl0aW5nKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRsYXllci5lZGl0aW5nLmVuYWJsZSgpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGxheWVyLnNldExhdExuZ3MoTC5qc3RzLmpzdHNUb0xhdExuZ3MoZml4ZWRHZW9tZXRyeSkpO1xuXG5cdFx0XHRcdFx0XHRcdFx0aWYgKHJlc3RvcmVFZGl0KVxuXHRcdFx0XHRcdFx0XHRcdFx0bGF5ZXIuZWRpdGluZy5lbmFibGUoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRmZWF0dXJlR3JvdXAucmVtb3ZlTGF5ZXIobGF5ZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0ZmVhdHVyZUdyb3VwLmpzdHMuY2xlYW4oKTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdFx0XG5cdFx0fVxuXHR9KTtcblxufSkoKTsiLCI7KGZ1bmN0aW9uKCkge1xuXG5cdHZhciBKU1RTX01FVEhPRFMgPSB7XG5cdFx0V2l0aGluOiAnd2l0aGluJ1xuXHR9O1xuXG5cdEwuRmVhdHVyZUdyb3VwLlZhbGlkYXRpb24gPSBMLkhhbmRsZXIuZXh0ZW5kKHtcblxuXHRcdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcblxuXHRcdG9wdGlvbnM6IHtcblxuXHRcdH0sXG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbihmZWF0dXJlR3JvdXApIHtcblx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cCA9IGZlYXR1cmVHcm91cDtcblx0XHRcdHRoaXMuX2JpbmRlZCA9IHt9O1xuXHRcdFx0dGhpcy5fZXJyb3JzID0ge307XG5cdFx0fSxcblxuXHRcdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbklkLCBjb2xsZWN0aW9uLCBtZXRob2ROYW1lO1xuXG5cdFx0XHRmb3IgKHZhciBuYW1lIGluIEpTVFNfTUVUSE9EUykge1xuXG5cdFx0XHRcdG1ldGhvZE5hbWUgPSBKU1RTX01FVEhPRFNbbmFtZV07XG5cblx0XHRcdFx0Y29sbGVjdGlvbklkID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXHRcdFx0XHRjb2xsZWN0aW9uID0gdGhpc1tjb2xsZWN0aW9uSWRdO1xuXHRcdFx0XHRpZiAoY29sbGVjdGlvbikge1xuXHRcdFx0XHRcdGNvbGxlY3Rpb24uZm9yRWFjaCh0aGlzLl93YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX3dhdGNoTWUobWV0aG9kTmFtZSk7XG5cdFx0XHR9XG5cblx0XHR9LFxuXG5cdFx0Z2V0UmVzdHJpY3Rpb25MYXllcnM6IGZ1bmN0aW9uIChtZXRob2ROYW1lKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbklkICA9IHRoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKTtcblx0XHRcdGlmICh0aGlzW2NvbGxlY3Rpb25JZF0pIHtcblx0XHRcdFx0cmV0dXJuIHRoaXNbY29sbGVjdGlvbklkXS5zbGljZSgwKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0Z2V0RmVhdHVyZUdyb3VwOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmVhdHVyZUdyb3VwO1xuXHRcdH0sXG5cblx0XHRpc1ZhbGlkOiBmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0XHRpZiAobWV0aG9kTmFtZSAmJiB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0pIHtcblx0XHRcdFx0cmV0dXJuICF0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRmaXJlT25NYXA6IGZ1bmN0aW9uIChldmVudE5hbWUsIGV2ZW50KSB7XG5cdFx0XHRpZiAodGhpcy5fZmVhdHVyZUdyb3VwLl9tYXApXG5cdFx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cC5fbWFwLmZpcmUoZXZlbnROYW1lLCBldmVudCk7XG5cdFx0fSxcblxuXHRcdHJlbW92ZUhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbklkLCBjb2xsZWN0aW9uLCBtZXRob2ROYW1lO1xuXG5cdFx0XHRmb3IgKHZhciBuYW1lIGluIEpTVFNfTUVUSE9EUykge1xuXG5cdFx0XHRcdG1ldGhvZE5hbWUgPSBKU1RTX01FVEhPRFNbbmFtZV07XG5cdFx0XHRcdGNvbGxlY3Rpb25JZCA9IHRoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKTtcblx0XHRcdFx0Y29sbGVjdGlvbiA9IHRoaXNbY29sbGVjdGlvbklkXTtcblxuXHRcdFx0XHRpZiAoY29sbGVjdGlvbilcblx0XHRcdFx0XHRjb2xsZWN0aW9uLmZvckVhY2godGhpcy5fdW53YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblxuXHRcdFx0XHR0aGlzLl91bndhdGNoTWUobWV0aG9kTmFtZSk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIERpc2FibGUgdGVtcG9yYXJpbHkgb24gdmFsaWRhdGlvbiBhbmQgZXhlY3V0ZSBmblxuXHRcdCAqIEBwYXJhbSAge1N0cmluZ30gICBvcCB2YWxpZGF0aW9uIG5hbWVcblx0XHQgKiBAcGFyYW0gIHtGdW5jdGlvbn0gZm4gXG5cdFx0ICogQHBhcmFtICB7T2JqZWN0fSBjb250ZXh0IHRoaXNBcmdcblx0XHQgKiBAcmV0dXJuIHtBbnl9IGZuIHJlc3VsdFxuXHRcdCAqL1xuXHRcdHdhaXQ6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBmbiwgY29udGV4dCkge1xuXG5cdFx0XHR2YXIgY29sbGVjdGlvbklkID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRpZiAodGhpc1tjb2xsZWN0aW9uSWRdKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dGhpc1tjb2xsZWN0aW9uSWRdLmZvckVhY2godGhpcy5fdW53YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblx0XHRcdFx0XHR0aGlzLl91bndhdGNoTWUobWV0aG9kTmFtZSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gZm4uY2FsbChjb250ZXh0LCB0aGlzKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRpZiAodGhpcy5lbmFibGVkKCkpIHtcblx0XHRcdFx0XHRcdHRoaXNbY29sbGVjdGlvbklkXS5mb3JFYWNoKHRoaXMuX3dhdGNoLmJpbmQodGhpcywgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fd2F0Y2hNZShtZXRob2ROYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0d2l0aGluOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl9vbihKU1RTX01FVEhPRFMuV2l0aGluLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0sXG5cblx0XHRfY29sbGVjdGlvbklkOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXHRcdFx0cmV0dXJuIG1ldGhvZE5hbWUgPyAnXycgKyBtZXRob2ROYW1lICsgJ3MnIDogbnVsbDtcblx0XHR9LFxuXG5cdFx0X2dldEhhbmRsZXI6IGZ1bmN0aW9uKGhhbmRsZXIsIG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBpZCA9IEwuc3RhbXAoaGFuZGxlcik7XG5cblx0XHRcdGlmICghdGhpcy5fYmluZGVkW21ldGhvZE5hbWVdKVxuXHRcdFx0XHR0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV0gPSB7fTtcblxuXHRcdFx0aWYgKCF0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV1baWRdKVxuXHRcdFx0XHR0aGlzLl9iaW5kZWRbbWV0aG9kTmFtZV1baWRdID0gaGFuZGxlci5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5fYmluZGVkW21ldGhvZE5hbWVdW2lkXTtcblx0XHR9LFxuXG5cdFx0X29mZjogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBjb2xsZWN0aW9uSWQgPSB0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSk7XG5cblx0XHRcdGlmICh0aGlzW2NvbGxlY3Rpb25JZF0pIHtcblx0XHRcdFx0dGhpc1tjb2xsZWN0aW9uSWRdLmZvckVhY2godGhpcy5fdW53YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblx0XHRcdFx0ZGVsZXRlIHRoaXNbY29sbGVjdGlvbklkXTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X29uOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgbGF5ZXJzKSB7XG5cdFx0XHR0aGlzLl9vZmYobWV0aG9kTmFtZSk7XG5cdFx0XHR0aGlzW3RoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKV0gPSBsYXllcnM7XG5cdFx0fSxcblxuXHRcdF92YWxpZGF0ZUZlYXR1cmU6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblx0XHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRzZWxmLl9mZWF0dXJlR3JvdXAuanN0cy5jbGVhbigpO1xuXHRcdFx0XHRzZWxmLl92YWxpZGF0ZVRhcmdldChtZXRob2ROYW1lKTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVSZXN0cmljdGlvbjogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGV2dCkge1xuXG5cdFx0XHRpZiAodGhpcy5fZmVhdHVyZUdyb3VwLmlzRW1wdHkoKSlcblx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHR2YXIgcmVzdHJpY3Rpb25JZCA9IEwuc3RhbXAoZXZ0LnRhcmdldCk7XG5cblx0XHRcdGlmICghdGhpcy5fZmVhdHVyZUdyb3VwLmpzdHNbbWV0aG9kTmFtZV0oZXZ0LnRhcmdldCkpIHtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSlcblx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0gPSBbXTtcblxuXHRcdFx0XHRpZiAodGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLmluZGV4T2YocmVzdHJpY3Rpb25JZCkgPT09IC0xKVxuXHRcdFx0XHRcdHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5wdXNoKHJlc3RyaWN0aW9uSWQpO1xuXG5cdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBtZXRob2ROYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwLCByZXN0cmljdGlvbkxheWVyOiBldnQudGFyZ2V0fTtcblxuXHRcdFx0XHR0aGlzLmZpcmUoJ2ludmFsaWQnLCBldnQpO1xuXHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzppbnZhbGlkJywgZXZ0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0pIHtcblx0XHRcdFx0XHR2YXIgaW5kZXggPSB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0uaW5kZXhPZihyZXN0cmljdGlvbklkKTtcblxuXHRcdFx0XHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0uc3BsaWNlKGluZGV4LCAxKTtcblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG1ldGhvZE5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6dmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVSZXN0cmljdGlvbkZlYXR1cmU6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblx0XHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHR2YXIgY29sbGVjdGlvbklkID0gc2VsZi5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpLFxuXHRcdFx0XHRjb2xsZWN0aW9uLCByZXN0cmljdGlvbkxheWVyO1xuXG5cdFx0XHRcdGlmICgoY29sbGVjdGlvbiA9IHNlbGZbY29sbGVjdGlvbklkXSkpIHtcblx0XHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGNvbGxlY3Rpb24ubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGlmIChjb2xsZWN0aW9uW2ldLmhhc0xheWVyKGV2dC50YXJnZXQpKSB7XG5cblx0XHRcdFx0XHRcdFx0KHJlc3RyaWN0aW9uTGF5ZXIgPSBjb2xsZWN0aW9uW2ldKS5qc3RzLmNsZWFuKCk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyZXN0cmljdGlvbkxheWVyKSB7XG5cdFx0XHRcdFx0c2VsZi5fdmFsaWRhdGVSZXN0cmljdGlvbihtZXRob2ROYW1lLCB7dGFyZ2V0OiByZXN0cmljdGlvbkxheWVyfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVUYXJnZXQ6IGZ1bmN0aW9uKG1ldGhvZE5hbWUpIHtcblx0XHRcdHZhciBldnQsIHZhbGlkID0gdHJ1ZTtcblxuXHRcdFx0aWYgKHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXSAmJiB0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoKVxuXHRcdFx0XHR2YWxpZCA9IGZhbHNlO1xuXG5cdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0gPSBbXTtcblxuXHRcdFx0aWYgKHRoaXMuX2ZlYXR1cmVHcm91cC5pc0VtcHR5KCkpIHtcblx0XHRcdFx0aWYgKCF2YWxpZCkge1xuXHRcdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBtZXRob2ROYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwfTtcblx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzp2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHZhciByZXN0cmljdGlvbkxheWVycyA9IHRoaXNbdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpXSxcblx0XHRcdG1ldGhvZCA9IHRoaXMuX2ZlYXR1cmVHcm91cC5qc3RzW21ldGhvZE5hbWVdO1xuXG5cdFx0XHRpZiAocmVzdHJpY3Rpb25MYXllcnMpIHtcblx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG1ldGhvZE5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXG5cdFx0XHRcdHJlc3RyaWN0aW9uTGF5ZXJzLmZvckVhY2goZnVuY3Rpb24ocmVzdHJpY3Rpb25MYXllcikge1xuXG5cdFx0XHRcdFx0aWYgKCFtZXRob2QuY2FsbCh0aGlzLl9mZWF0dXJlR3JvdXAuanN0cywgcmVzdHJpY3Rpb25MYXllcikpIHtcblxuXHRcdFx0XHRcdFx0dGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLnB1c2goTC5zdGFtcChyZXN0cmljdGlvbkxheWVyKSk7XG5cdFx0XHRcdFx0XHRcblx0XHRcdFx0XHRcdGV2dC5yZXN0cmljdGlvbkxheWVyID0gcmVzdHJpY3Rpb25MYXllcjtcblxuXHRcdFx0XHRcdFx0dGhpcy5maXJlKCdpbnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OmludmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5sZW5ndGggJiYgIXZhbGlkKSB7XG5cblx0XHRcdFx0XHRldnQgPSB7dmFsaWRhdGlvbjogbWV0aG9kTmFtZSwgdGFyZ2V0TGF5ZXI6IHRoaXMuX2ZlYXR1cmVHcm91cH07XG5cdFx0XHRcdFx0dGhpcy5maXJlKCd2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6dmFsaWQnLCBldnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF91bndhdGNoOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZmVhdHVyZUdyb3VwKSB7XG5cdFx0XHR2YXIgd2F0Y2hlciA9IHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVSZXN0cmljdGlvbiwgbWV0aG9kTmFtZSk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5vZmYoJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcnJlbW92ZScsIHdhdGNoZXIpO1xuXG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fd2F0Y2hSZXN0cmljdGlvbkZlYXR1cmUsIG1ldGhvZE5hbWUpKTtcblxuXHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdFx0aWYgKGxheWVyLmVkaXRpbmcpIHtcblx0XHRcdFx0XHRsYXllci5vZmYoJ2VkaXQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlUmVzdHJpY3Rpb25GZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMpO1xuXHRcdH0sXG5cblx0XHRfdW53YXRjaE1lOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAuZWFjaExheWVyKGZ1bmN0aW9uIChsYXllcikge1xuXHRcdFx0XHRpZiAobGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRcdGxheWVyLm9mZignZWRpdCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVGZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fd2F0Y2hGZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCBsYXllcnJlbW92ZScsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVUYXJnZXQsIG1ldGhvZE5hbWUpKTtcblx0XHR9LFxuXG5cdFx0X3dhdGNoOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZmVhdHVyZUdyb3VwKSB7XG5cblx0XHRcdHZhciB3YXRjaGVyID0gdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZVJlc3RyaWN0aW9uLCBtZXRob2ROYW1lKTtcblxuXHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdFx0dGhpcy5fd2F0Y2hSZXN0cmljdGlvbkZlYXR1cmUobWV0aG9kTmFtZSwge2xheWVyOiBsYXllcn0pO1xuXHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5vbignbGF5ZXJhZGQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3dhdGNoUmVzdHJpY3Rpb25GZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVycmVtb3ZlJywgd2F0Y2hlcik7XG5cdFx0fSxcblxuXHRcdF93YXRjaEZlYXR1cmU6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblx0XHRcdGlmIChldnQubGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRldnQubGF5ZXIub24oJ2VkaXQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlRmVhdHVyZSwgbWV0aG9kTmFtZSkpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfd2F0Y2hNZTogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblxuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdFx0dGhpcy5fd2F0Y2hGZWF0dXJlKG1ldGhvZE5hbWUsIHtsYXllcjogbGF5ZXJ9KTtcblx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkJywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl93YXRjaEZlYXR1cmUsIG1ldGhvZE5hbWUpKTtcblx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cC5vbignbGF5ZXJhZGQgbGF5ZXJyZW1vdmUnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlVGFyZ2V0LCBtZXRob2ROYW1lKSk7XG5cdFx0fSxcblxuXHRcdF93YXRjaFJlc3RyaWN0aW9uRmVhdHVyZTogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGV2dCkge1xuXHRcdFx0aWYgKGV2dC5sYXllci5lZGl0aW5nKSB7XG5cdFx0XHRcdGV2dC5sYXllci5vbignZWRpdCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVSZXN0cmljdGlvbkZlYXR1cmUsIG1ldGhvZE5hbWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0fSk7XG5cblxuXHRMLkZlYXR1cmVHcm91cC5hZGRJbml0SG9vayhmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF0aGlzLnZhbGlkYXRpb24pXG5cdFx0XHR0aGlzLnZhbGlkYXRpb24gPSBuZXcgTC5GZWF0dXJlR3JvdXAuVmFsaWRhdGlvbih0aGlzKTtcblxuXHRcdGlmICghdGhpcy5maXgpXG5cdFx0XHR0aGlzLmZpeCA9IG5ldyBMLkZlYXR1cmVHcm91cC5GaXhlcih0aGlzLnZhbGlkYXRpb24pO1xuXHR9KTtcblxufSkoKTsiXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
