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

					var projLine = '';

					if (L.Draw.Imports.PROJ_URL) {
						projLine = "importScripts('" + L.Draw.Imports.PROJ_URL + "');";
					}

					// No external .js script

					var script = "try { " +
					"importScripts('" + L.Draw.Imports.SHPJS_URL + "');" +
					projLine +
					"} catch (e) {console.error(e); throw e;}\n" +
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
			fix: 'intersection'
		},
		disjoint: {
			check: 'intersects',
			fix: 'difference'
		}
	};

	var JSTS_METHODS = {
		within: 'within',
		disjoint: 'disjoint'
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

		disjoint: function () {
			var self = this;
			setTimeout(function() {
				var valid = self._validation.isValid(JSTS_METHODS.disjoint);

				if (!valid) {
					self._fix(JSTS_METHODS.disjoint, FIX_OPERATIONS.disjoint);
				}
			});
		},

		_fix: function (methodName, operation) {


			if (!operation)
				return;

			var checkMethod = operation.check,
			fixMethod = operation.fix;

			this._validation.wait(methodName, function() {
				var featureGroup = this._validation.getFeatureGroup(),
				restrictionLayers = this._validation.getRestrictionLayers(methodName),
				fixedGeometry, i, restoreEdit, filtered;

				// function fixLayer (geometry, restrictionLayer) {
				// 	restrictionGeometry = restrictionLayer.jsts.geometry();

				// 	for (i = 0; i < fixMethods.length; i++) {
				// 		fixMethod = fixMethods[i];

				// 		geometry = L.jsts[fixMethod](geometry, restrictionGeometry);
				// 	}

				// 	return geometry;
				// }
				
				function union(geometry, layer) {
					return L.jsts.union(geometry, layer.jsts.geometry(), 'Polygon');
				}

				featureGroup.eachLayer(function(layer) {

					filtered = restrictionLayers.filter(function (restrictionLayer) {
						return (layer.jsts.geometry())[checkMethod](restrictionLayer.jsts.geometry());
					});

					if (filtered.length) {

						restrictionGeometry = filtered.slice(1).reduce(union, filtered[0].jsts.geometry());

						fixedGeometry = L.jsts[fixMethod](layer.jsts.geometry(), restrictionGeometry);

						if (fixedGeometry) {

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

			this._validation.fireOnMap('draw:fixed', {
				layer: this._validation.getFeatureGroup()
			});
			
		}
	});

})();
;(function() {

	var JSTS_METHODS = {
		Within: 'within',
		Disjoint: 'disjoint'
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

		disjoint: function () {
			this._on(JSTS_METHODS.Disjoint, Array.prototype.slice.call(arguments, 0));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkltcG9ydHMuanMiLCJTaGFwZVppcC5qcyIsIkwuRmVhdHVyZUdyb3VwLkVkaXQuanMiLCJMLkZlYXR1cmVHcm91cC5jb3VudC5qcyIsIkwuRmVhdHVyZUdyb3VwLmlzRW1wdHkuanMiLCJMLkZlYXR1cmVHcm91cC5qcyIsIkwuRmVhdHVyZUdyb3VwLnNldExhdExuZ3MuanMiLCJMLkdlb0pTT04uaXNFbXB0eS5qcyIsIkwuRmVhdHVyZUdyb3VwLkZpeGVyLmpzIiwiTC5GZWF0dXJlR3JvdXAuVmFsaWRhdGlvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzVJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNwQkE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3BJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoibGVhZmxldC5kcmF3LnBsdXMuanMiLCJzb3VyY2VzQ29udGVudCI6WyI7KGZ1bmN0aW9uKCkge1xuXG5cdGlmICghTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMpXG5cdFx0TC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMgPSB7fTtcblxuXHRMLkRyYXcuSW1wb3J0cyA9IEwuRHJhdy5GZWF0dXJlLmV4dGVuZCh7XG5cdFx0c3RhdGljczoge1xuXHRcdFx0Rk9STUFUUzogW10sXG5cdFx0XHRUWVBFOiAnaW1wb3J0cydcblx0XHR9LFxuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG1hcCwgb3B0aW9ucykge1xuXHRcdFx0dGhpcy50eXBlID0gTC5EcmF3LkltcG9ydHMuVFlQRTtcblxuXHRcdFx0TC5EcmF3LkZlYXR1cmUucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBtYXAsIG9wdGlvbnMpO1xuXHRcdH0sXG5cblx0XHRnZXRBY3Rpb25zOiBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdHJldHVybiBMLkRyYXcuSW1wb3J0cy5GT1JNQVRTLm1hcChmdW5jdGlvbihmb3JtYXQpIHtcblx0XHRcdFx0dmFyIG93bkVsZW1lbnQgPSBudWxsO1xuXG5cdFx0XHRcdGlmIChmb3JtYXQuY3JlYXRlQWN0aW9uRWxlbWVudClcblx0XHRcdFx0XHRvd25FbGVtZW50ID0gZm9ybWF0LmNyZWF0ZUFjdGlvbkVsZW1lbnQuY2FsbCh0aGlzKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0dGl0bGU6IGZvcm1hdC50aXRsZSxcblx0XHRcdFx0XHR0ZXh0OiBmb3JtYXQudGV4dCxcblx0XHRcdFx0XHRjYWxsYmFjazogZm9ybWF0LmNhbGxiYWNrLFxuXHRcdFx0XHRcdGNvbnRleHQ6IHRoaXMsXG5cdFx0XHRcdFx0b3duRWxlbWVudDogb3duRWxlbWVudFxuXHRcdFx0XHR9O1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fVxuXHR9KTtcblxufSkoKTsiLCI7KGZ1bmN0aW9uKCkge1xuXG5cdGlmICghTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXApIHtcblx0XHRMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcCA9IHtcblx0XHRcdHRleHQ6ICdJbXBvcnQgYSBzaGFwZWZpbGUgemlwJyxcblx0XHRcdHRpdGxlOiAnUGxlYXNlLCBzZWxlY3QgYSB6aXAgZmlsZS4nXG5cdFx0fTtcblx0fVxuXG5cdFNocFppcEZvcm1hdCA9IHtcblxuXHRcdF9oYW5kbGVyczoge30sXG5cblx0XHRfbmV4dElkOiAxLFxuXG5cdFx0Y3JlYXRlT3BlbkJ1dHRvbjogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgbGluayA9IEwuRG9tVXRpbC5jcmVhdGUoJ2EnKTtcblxuXHRcdFx0bGluay5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0XHRsaW5rLmlubmVySFRNTCA9IEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwLnRleHQ7XG5cdFx0XHRsaW5rLnRpdGxlID0gTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXAudGl0bGU7XG5cblx0XHRcdHZhciBpbnB1dCA9IEwuRG9tVXRpbC5jcmVhdGUoJ2lucHV0JywgJ2xlYWZsZXQtZHJhdy1kcmF3LWltcG9ydHMtYWN0aW9uJywgbGluayk7XG5cdFx0XHRpbnB1dC50eXBlID0gJ2ZpbGUnO1xuXG5cdFx0XHR2YXIgaGFuZGxlciA9IHRoaXM7XG5cblx0XHRcdGlucHV0Lm9uY2hhbmdlID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFNocFppcEZvcm1hdC5fb3BlblNoYXBlWmlwKGhhbmRsZXIsIGlucHV0KTtcblx0XHRcdH07XG5cblx0XHRcdHJldHVybiBsaW5rO1xuXHRcdH0sXG5cblx0XHRub3A6IGZ1bmN0aW9uKCkge30sXG5cblx0XHRfZ2V0V29ya2VyOiBmdW5jdGlvbigpIHtcblx0XHRcdGlmICghdGhpcy5fd29ya2VyKSB7XG5cdFx0XHRcdGlmIChMLkRyYXcuSW1wb3J0cy5TSFBKU19VUkwpIHtcblxuXHRcdFx0XHRcdHZhciBwcm9qTGluZSA9ICcnO1xuXG5cdFx0XHRcdFx0aWYgKEwuRHJhdy5JbXBvcnRzLlBST0pfVVJMKSB7XG5cdFx0XHRcdFx0XHRwcm9qTGluZSA9IFwiaW1wb3J0U2NyaXB0cygnXCIgKyBMLkRyYXcuSW1wb3J0cy5QUk9KX1VSTCArIFwiJyk7XCI7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gTm8gZXh0ZXJuYWwgLmpzIHNjcmlwdFxuXG5cdFx0XHRcdFx0dmFyIHNjcmlwdCA9IFwidHJ5IHsgXCIgK1xuXHRcdFx0XHRcdFwiaW1wb3J0U2NyaXB0cygnXCIgKyBMLkRyYXcuSW1wb3J0cy5TSFBKU19VUkwgKyBcIicpO1wiICtcblx0XHRcdFx0XHRwcm9qTGluZSArXG5cdFx0XHRcdFx0XCJ9IGNhdGNoIChlKSB7Y29uc29sZS5lcnJvcihlKTsgdGhyb3cgZTt9XFxuXCIgK1xuXHRcdFx0XHRcdFwib25tZXNzYWdlID0gZnVuY3Rpb24oZSkge1xcblwiICtcblx0XHRcdFx0XHRcdFwiY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgU2hhcGVaaXAuLi4nKTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcInZhciBnZW9KU09OID0gc2hwLnBhcnNlWmlwKGUuZGF0YS5ieXRlQXJyYXkpO1xcblwiICtcblx0XHRcdFx0XHRcdFwiY29uc29sZS5sb2coJ1NoYXBlWmlwIHByb2Nlc3NlZCEnKTtcXG5cIiArXG5cdFx0XHRcdFx0XHRcInBvc3RNZXNzYWdlKHtpZDogZS5kYXRhLmlkLCBnZW9KU09OOiBnZW9KU09OfSk7XFxuXCIgK1xuXHRcdFx0XHRcdFwifVwiO1xuXG5cdFx0XHRcdFx0dmFyIHVybERhdGEgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtzY3JpcHRdLCB7dHlwZTogXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCJ9KSk7XG5cdFx0XHRcdFx0dGhpcy5fd29ya2VyID0gbmV3IFdvcmtlcih1cmxEYXRhKTtcblxuXHRcdFx0XHRcdHRoaXMuX3dvcmtlci5vbm1lc3NhZ2UgPSB0aGlzLl9vbm1lc3NhZ2UuYmluZCh0aGlzKTtcblx0XHRcdFx0XHR0aGlzLl93b3JrZXIub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coYXJndW1lbnRzKTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05lZWQgc2hhcGVmaWxlLWpzIFVSTCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya2VyO1xuXHRcdH0sXG5cblx0XHRfb25tZXNzYWdlOiBmdW5jdGlvbihlKSB7XG5cdFx0XHR2YXIgZ2VvSlNPTiA9IGUuZGF0YS5nZW9KU09OO1xuXHRcdFx0dmFyIGhhbmRsZXIgPSB0aGlzLl9oYW5kbGVyc1tlLmRhdGEuaWRdO1xuXG5cdFx0XHQvLyBUT0RPOiBJcyBpdCBhbHdheXMgRmVhdHVyZUNvbGxlY3Rpb24/XG5cdFx0XHRcblx0XHRcdHZhciBwcm9wZXJ0aWVzLCBnZW9tZXRyeSwgbmV3RmVhdHVyZSwgaSwgbGF5ZXI7XG5cblx0XHRcdGdlb0pTT04uZmVhdHVyZXMuZm9yRWFjaChmdW5jdGlvbihmZWF0dXJlKSB7XG5cdFx0XHRcdHByb3BlcnRpZXMgPSBmZWF0dXJlLnByb3BlcnRpZXM7XG5cdFx0XHRcdGdlb21ldHJ5ID0gZmVhdHVyZS5nZW9tZXRyeTtcblxuXHRcdFx0XHRpZiAoZ2VvbWV0cnkudHlwZS5zdGFydHNXaXRoKFwiTXVsdGlcIikpIHtcblx0XHRcdFx0XHRmb3IgKGk9MDsgaSA8IGdlb21ldHJ5LmNvb3JkaW5hdGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRuZXdGZWF0dXJlID0ge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBnZW9tZXRyeS50eXBlLnN1YnN0cmluZyg1KSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczogcHJvcGVydGllcyxcblx0XHRcdFx0XHRcdFx0Y29vcmRpbmF0ZXM6IGdlb21ldHJ5LmNvb3JkaW5hdGVzW2ldXG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRsYXllciA9IEwuR2VvSlNPTi5nZW9tZXRyeVRvTGF5ZXIobmV3RmVhdHVyZSk7XG5cdFx0XHRcdFx0XHRoYW5kbGVyLl9maXJlQ3JlYXRlZEV2ZW50KGxheWVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGF5ZXIgPSBMLkdlb0pTT04uZ2VvbWV0cnlUb0xheWVyKGZlYXR1cmUpO1xuXHRcdFx0XHRcdGhhbmRsZXIuX2ZpcmVDcmVhdGVkRXZlbnQobGF5ZXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGFuZGxlci5kaXNhYmxlKCk7XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0X29wZW5TaGFwZVppcDogZnVuY3Rpb24oaGFuZGxlciwgaW5wdXQpIHtcblx0XHRcdGlmICghaW5wdXQuZmlsZXMgJiYgIWlucHV0LmZpbGVzWzBdKVxuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXG5cdFx0XHRyZWFkZXIub25sb2FkID0gZnVuY3Rpb24oKSB7XG5cblx0XHRcdFx0aWYgKHJlYWRlci5yZWFkeVN0YXRlICE9PSAyKVxuXHRcdFx0XHRcdHJldHVybjtcblxuXHRcdFx0XHRpZiAocmVhZGVyLnJlc3VsdCkge1xuXHRcdFx0XHRcdFNocFppcEZvcm1hdC5fcGFyc2UoaGFuZGxlciwgcmVhZGVyLnJlc3VsdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fTtcblxuXHRcdFx0aGFuZGxlci5fbWFwLmZpcmUoJ2RyYXc6aW1wb3J0c3RhcnQnKTtcblx0XHRcdHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihpbnB1dC5maWxlc1swXSk7XG5cdFx0fSxcblxuXHRcdF9wYXJzZTogZnVuY3Rpb24oaGFuZGxlciwgYnl0ZUFycmF5KSB7XG5cdFx0XHR2YXIgd29ya2VyID0gdGhpcy5fZ2V0V29ya2VyKCk7XG5cdFx0XHR2YXIgaWQgPSB0aGlzLl9uZXh0SWQrKztcblx0XHRcdHRoaXMuX2hhbmRsZXJzW2lkXSA9IGhhbmRsZXI7XG5cblx0XHRcdHdvcmtlci5wb3N0TWVzc2FnZSh7aWQ6IGlkLCBieXRlQXJyYXk6IGJ5dGVBcnJheX0sIFtieXRlQXJyYXldKTtcblx0XHR9LFxuXHR9O1xuXG5cdEwuRHJhdy5JbXBvcnRzLkZPUk1BVFMucHVzaCh7XG5cdFx0Y2FsbGJhY2s6IFNocFppcEZvcm1hdC5ub3AsXG5cdFx0Y3JlYXRlQWN0aW9uRWxlbWVudDogU2hwWmlwRm9ybWF0LmNyZWF0ZU9wZW5CdXR0b25cblxuXHR9KTtcbn0pKCk7IiwiKGZ1bmN0aW9uICgpIHtcblxuXHRMLkZlYXR1cmVHcm91cC5FZGl0ID0gTC5IYW5kbGVyLmV4dGVuZCh7XG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdHRoaXMuX2xheWVyID0gbGF5ZXI7XG5cdFx0fSxcblxuXHRcdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl9sYXllci5lYWNoTGF5ZXIodGhpcy5fZW5hYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vbignbGF5ZXJhZGQnLCB0aGlzLl9lbmFibGVFZGl0aW5nLCB0aGlzKTtcblx0XHRcdHRoaXMuX2xheWVyLm9uKCdsYXllcnJlbW92ZScsIHRoaXMuX2Rpc2FibGVFZGl0aW5nLCB0aGlzKTtcblx0XHR9LFxuXG5cdFx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuX2xheWVyLmVhY2hMYXllcih0aGlzLl9kaXNhYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vZmYoJ2xheWVyYWRkJywgdGhpcy5fZW5hYmxlRWRpdGluZywgdGhpcyk7XG5cdFx0XHR0aGlzLl9sYXllci5vZmYoJ2xheWVycmVtb3ZlJywgdGhpcy5fZGlzYWJsZUVkaXRpbmcsIHRoaXMpO1xuXHRcdH0sXG5cblx0XHRfZGlzYWJsZUVkaXRpbmc6IGZ1bmN0aW9uIChsYXllcikge1xuXHRcdFx0bGF5ZXIgPSBsYXllci5sYXllciB8fCBsYXllcjtcblx0XHRcdGlmIChsYXllci5lZGl0aW5nKSB7XG5cdFx0XHRcdGxheWVyLmVkaXRpbmcuZGlzYWJsZSgpO1xuXHRcdFx0XHRsYXllci5vZmYoJ2VkaXQnLCB0aGlzLl9vbkxheWVyRWRpdCwgdGhpcyk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9lbmFibGVFZGl0aW5nOiBmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdGxheWVyID0gbGF5ZXIubGF5ZXIgfHwgbGF5ZXI7XG5cdFx0XHRpZiAobGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRsYXllci5lZGl0aW5nLmVuYWJsZSgpO1xuXHRcdFx0XHRsYXllci5vbignZWRpdCcsIHRoaXMuX29uTGF5ZXJFZGl0LCB0aGlzKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X29uTGF5ZXJFZGl0OiBmdW5jdGlvbiAoZXZ0KSB7XG5cdFx0XHR0aGlzLl9sYXllci5maXJlKCdlZGl0Jywge2xheWVyOiBldnQubGF5ZXIgfHwgZXZ0LnRhcmdldH0pO1xuXHRcdH1cblx0fSk7XG5cblx0TC5GZWF0dXJlR3JvdXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xuXG5cdFx0aWYgKCF0aGlzLmVkaXRpbmcpXG5cdFx0XHR0aGlzLmVkaXRpbmcgPSBuZXcgTC5GZWF0dXJlR3JvdXAuRWRpdCh0aGlzKTtcblxuXHR9KTtcblxufSkoKTsiLCJMLkZlYXR1cmVHcm91cC5pbmNsdWRlKHtcblx0Y291bnQ6IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgY291bnQgPSAwO1xuXG5cdFx0Zm9yICh2YXIgaWQgaW4gdGhpcy5fbGF5ZXJzKSB7XG5cdFx0XHRpZiAodGhpcy5fbGF5ZXJzW2lkXS5jb3VudClcblx0XHRcdFx0Y291bnQgKz0gdGhpcy5fbGF5ZXJzW2lkXS5jb3VudCgpO1xuXHRcdFx0ZWxzZVxuXHRcdFx0XHRjb3VudCsrO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb3VudDtcblx0fVxufSk7IiwiTC5GZWF0dXJlR3JvdXAuaW5jbHVkZSh7XG5cdGlzRW1wdHk6IGZ1bmN0aW9uKCkge1xuXG5cdFx0dmFyIGVtcHR5ID0gdHJ1ZSwgZGVlcEVtcHR5ID0gdHJ1ZTtcblxuXHRcdGZvciAodmFyIGlkIGluIHRoaXMuX2xheWVycykge1xuXHRcdFx0ZW1wdHkgPSBmYWxzZTtcblx0XHRcdGlmICh0aGlzLl9sYXllcnNbaWRdLmlzRW1wdHkpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9sYXllcnNbaWRdLmlzRW1wdHkoKSlcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2Vcblx0XHRcdFx0ZGVlcEVtcHR5ID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVtcHR5IHx8IGRlZXBFbXB0eTtcblx0fVxufSk7IiwiTC5GZWF0dXJlR3JvdXAuYWRkSW5pdEhvb2soZnVuY3Rpb24oKSB7XG5cblx0aWYgKEwuSnN0cylcblx0XHR0aGlzLm9uKCdlZGl0JywgdGhpcy5qc3RzLmNsZWFuLCB0aGlzLmpzdHMpO1xuXG59KTsiLCJMLkZlYXR1cmVHcm91cC5pbmNsdWRlKHtcblx0c2V0TGF0TG5nczogZnVuY3Rpb24obGF0bG5ncykge1xuXHRcdHZhciBjb3VudCA9IHRoaXMuY291bnQoKSwgbGF5ZXI7XG5cblx0XHRpZiAoY291bnQgPT09IDEpIHtcblx0XHRcdGZvciAodmFyIGlkIGluIHRoaXMuX2xheWVycykge1xuXHRcdFx0XHRsYXllciA9IHRoaXMuX2xheWVyc1tpZF07XG5cblx0XHRcdFx0aWYgKGxheWVyLnNldExhdExuZ3MpXG5cdFx0XHRcdFx0bGF5ZXIuc2V0TGF0TG5ncyhsYXRsbmdzKTtcblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcIkwuRmVhdHVyZUdyb3VwIGRvZXNuJ3QgaGF2ZSBhIGxheWVyIHdpdGggc2V0TGF0TG5nc1wiKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGNvdW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FtYmlnb3VzIHNldExhdExuZ3MnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRW1wdHkgbGF5ZXIhXCIpO1xuXHRcdH1cblxuXHR9XG59KTsiLCIiLCI7KGZ1bmN0aW9uICgpIHtcblxuXHR2YXIgRklYX09QRVJBVElPTlMgPSB7XG5cdFx0d2l0aGluOiB7XG5cdFx0XHRjaGVjazogJ2ludGVyc2VjdHMnLFxuXHRcdFx0Zml4OiAnaW50ZXJzZWN0aW9uJ1xuXHRcdH0sXG5cdFx0ZGlzam9pbnQ6IHtcblx0XHRcdGNoZWNrOiAnaW50ZXJzZWN0cycsXG5cdFx0XHRmaXg6ICdkaWZmZXJlbmNlJ1xuXHRcdH1cblx0fTtcblxuXHR2YXIgSlNUU19NRVRIT0RTID0ge1xuXHRcdHdpdGhpbjogJ3dpdGhpbicsXG5cdFx0ZGlzam9pbnQ6ICdkaXNqb2ludCdcblx0fTtcblxuXHRMLkZlYXR1cmVHcm91cC5GaXhlciA9IEwuQ2xhc3MuZXh0ZW5kKHtcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uICh2YWxpZGF0aW9uKSB7XG5cdFx0XHR0aGlzLl92YWxpZGF0aW9uID0gdmFsaWRhdGlvbjtcblx0XHR9LFxuXG5cdFx0d2l0aGluOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR2YXIgdmFsaWQgPSBzZWxmLl92YWxpZGF0aW9uLmlzVmFsaWQoSlNUU19NRVRIT0RTLndpdGhpbik7XG5cblx0XHRcdFx0aWYgKCF2YWxpZCkge1xuXHRcdFx0XHRcdHNlbGYuX2ZpeChKU1RTX01FVEhPRFMud2l0aGluLCBGSVhfT1BFUkFUSU9OUy53aXRoaW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0ZGlzam9pbnQ6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHZhciB2YWxpZCA9IHNlbGYuX3ZhbGlkYXRpb24uaXNWYWxpZChKU1RTX01FVEhPRFMuZGlzam9pbnQpO1xuXG5cdFx0XHRcdGlmICghdmFsaWQpIHtcblx0XHRcdFx0XHRzZWxmLl9maXgoSlNUU19NRVRIT0RTLmRpc2pvaW50LCBGSVhfT1BFUkFUSU9OUy5kaXNqb2ludCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0sXG5cblx0XHRfZml4OiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgb3BlcmF0aW9uKSB7XG5cblxuXHRcdFx0aWYgKCFvcGVyYXRpb24pXG5cdFx0XHRcdHJldHVybjtcblxuXHRcdFx0dmFyIGNoZWNrTWV0aG9kID0gb3BlcmF0aW9uLmNoZWNrLFxuXHRcdFx0Zml4TWV0aG9kID0gb3BlcmF0aW9uLmZpeDtcblxuXHRcdFx0dGhpcy5fdmFsaWRhdGlvbi53YWl0KG1ldGhvZE5hbWUsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR2YXIgZmVhdHVyZUdyb3VwID0gdGhpcy5fdmFsaWRhdGlvbi5nZXRGZWF0dXJlR3JvdXAoKSxcblx0XHRcdFx0cmVzdHJpY3Rpb25MYXllcnMgPSB0aGlzLl92YWxpZGF0aW9uLmdldFJlc3RyaWN0aW9uTGF5ZXJzKG1ldGhvZE5hbWUpLFxuXHRcdFx0XHRmaXhlZEdlb21ldHJ5LCBpLCByZXN0b3JlRWRpdCwgZmlsdGVyZWQ7XG5cblx0XHRcdFx0Ly8gZnVuY3Rpb24gZml4TGF5ZXIgKGdlb21ldHJ5LCByZXN0cmljdGlvbkxheWVyKSB7XG5cdFx0XHRcdC8vIFx0cmVzdHJpY3Rpb25HZW9tZXRyeSA9IHJlc3RyaWN0aW9uTGF5ZXIuanN0cy5nZW9tZXRyeSgpO1xuXG5cdFx0XHRcdC8vIFx0Zm9yIChpID0gMDsgaSA8IGZpeE1ldGhvZHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Ly8gXHRcdGZpeE1ldGhvZCA9IGZpeE1ldGhvZHNbaV07XG5cblx0XHRcdFx0Ly8gXHRcdGdlb21ldHJ5ID0gTC5qc3RzW2ZpeE1ldGhvZF0oZ2VvbWV0cnksIHJlc3RyaWN0aW9uR2VvbWV0cnkpO1xuXHRcdFx0XHQvLyBcdH1cblxuXHRcdFx0XHQvLyBcdHJldHVybiBnZW9tZXRyeTtcblx0XHRcdFx0Ly8gfVxuXHRcdFx0XHRcblx0XHRcdFx0ZnVuY3Rpb24gdW5pb24oZ2VvbWV0cnksIGxheWVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEwuanN0cy51bmlvbihnZW9tZXRyeSwgbGF5ZXIuanN0cy5nZW9tZXRyeSgpLCAnUG9seWdvbicpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbihsYXllcikge1xuXG5cdFx0XHRcdFx0ZmlsdGVyZWQgPSByZXN0cmljdGlvbkxheWVycy5maWx0ZXIoZnVuY3Rpb24gKHJlc3RyaWN0aW9uTGF5ZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiAobGF5ZXIuanN0cy5nZW9tZXRyeSgpKVtjaGVja01ldGhvZF0ocmVzdHJpY3Rpb25MYXllci5qc3RzLmdlb21ldHJ5KCkpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKGZpbHRlcmVkLmxlbmd0aCkge1xuXG5cdFx0XHRcdFx0XHRyZXN0cmljdGlvbkdlb21ldHJ5ID0gZmlsdGVyZWQuc2xpY2UoMSkucmVkdWNlKHVuaW9uLCBmaWx0ZXJlZFswXS5qc3RzLmdlb21ldHJ5KCkpO1xuXG5cdFx0XHRcdFx0XHRmaXhlZEdlb21ldHJ5ID0gTC5qc3RzW2ZpeE1ldGhvZF0obGF5ZXIuanN0cy5nZW9tZXRyeSgpLCByZXN0cmljdGlvbkdlb21ldHJ5KTtcblxuXHRcdFx0XHRcdFx0aWYgKGZpeGVkR2VvbWV0cnkpIHtcblxuXHRcdFx0XHRcdFx0XHRpZiAobGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRcdFx0XHRcdHJlc3RvcmVFZGl0ID0gbGF5ZXIuZWRpdGluZy5lbmFibGVkKCk7XG5cdFx0XHRcdFx0XHRcdFx0bGF5ZXIuZWRpdGluZy5kaXNhYmxlKCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRcdFx0XHRcdHJlc3RvcmVFZGl0ID0gZmFsc2U7XG5cblx0XHRcdFx0XHRcdFx0aWYgKGZpeGVkR2VvbWV0cnkgaW5zdGFuY2VvZiBqc3RzLmdlb20uTXVsdGlQb2x5Z29uKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZmVhdHVyZUdyb3VwLnJlbW92ZUxheWVyKGxheWVyKTtcblxuXHRcdFx0XHRcdFx0XHRcdHZhciBvcHRpb25zID0gbGF5ZXIub3B0aW9ucztcblxuXHRcdFx0XHRcdFx0XHRcdGZvciAodmFyIGk9MCwgaWwgPSBmaXhlZEdlb21ldHJ5LmdldE51bUdlb21ldHJpZXMoKTsgaSA8IGlsOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdFx0XHRcdFx0bGF5ZXIgPSBMLmpzdHMuanN0c1RvbGVhZmxldChmaXhlZEdlb21ldHJ5LmdldEdlb21ldHJ5TihpKSwgb3B0aW9ucyk7XG5cdFx0XHRcdFx0XHRcdFx0XHRmZWF0dXJlR3JvdXAuYWRkTGF5ZXIobGF5ZXIpO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKHJlc3RvcmVFZGl0ICYmIGxheWVyLmVkaXRpbmcpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGxheWVyLmVkaXRpbmcuZW5hYmxlKCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0bGF5ZXIuc2V0TGF0TG5ncyhMLmpzdHMuanN0c1RvTGF0TG5ncyhmaXhlZEdlb21ldHJ5KSk7XG5cblx0XHRcdFx0XHRcdFx0XHRpZiAocmVzdG9yZUVkaXQpXG5cdFx0XHRcdFx0XHRcdFx0XHRsYXllci5lZGl0aW5nLmVuYWJsZSgpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGZlYXR1cmVHcm91cC5yZW1vdmVMYXllcihsYXllcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRmZWF0dXJlR3JvdXAuanN0cy5jbGVhbigpO1xuXG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0dGhpcy5fdmFsaWRhdGlvbi5maXJlT25NYXAoJ2RyYXc6Zml4ZWQnLCB7XG5cdFx0XHRcdGxheWVyOiB0aGlzLl92YWxpZGF0aW9uLmdldEZlYXR1cmVHcm91cCgpXG5cdFx0XHR9KTtcblx0XHRcdFxuXHRcdH1cblx0fSk7XG5cbn0pKCk7IiwiOyhmdW5jdGlvbigpIHtcblxuXHR2YXIgSlNUU19NRVRIT0RTID0ge1xuXHRcdFdpdGhpbjogJ3dpdGhpbicsXG5cdFx0RGlzam9pbnQ6ICdkaXNqb2ludCdcblx0fTtcblxuXHRMLkZlYXR1cmVHcm91cC5WYWxpZGF0aW9uID0gTC5IYW5kbGVyLmV4dGVuZCh7XG5cblx0XHRpbmNsdWRlczogTC5NaXhpbi5FdmVudHMsXG5cblx0XHRvcHRpb25zOiB7XG5cblx0XHR9LFxuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oZmVhdHVyZUdyb3VwKSB7XG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAgPSBmZWF0dXJlR3JvdXA7XG5cdFx0XHR0aGlzLl9iaW5kZWQgPSB7fTtcblx0XHRcdHRoaXMuX2Vycm9ycyA9IHt9O1xuXHRcdH0sXG5cblx0XHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdFx0dmFyIGNvbGxlY3Rpb25JZCwgY29sbGVjdGlvbiwgbWV0aG9kTmFtZTtcblxuXHRcdFx0Zm9yICh2YXIgbmFtZSBpbiBKU1RTX01FVEhPRFMpIHtcblxuXHRcdFx0XHRtZXRob2ROYW1lID0gSlNUU19NRVRIT0RTW25hbWVdO1xuXG5cdFx0XHRcdGNvbGxlY3Rpb25JZCA9IHRoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKTtcblx0XHRcdFx0Y29sbGVjdGlvbiA9IHRoaXNbY29sbGVjdGlvbklkXTtcblx0XHRcdFx0aWYgKGNvbGxlY3Rpb24pIHtcblx0XHRcdFx0XHRjb2xsZWN0aW9uLmZvckVhY2godGhpcy5fd2F0Y2guYmluZCh0aGlzLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl93YXRjaE1lKG1ldGhvZE5hbWUpO1xuXHRcdFx0fVxuXG5cdFx0fSxcblxuXHRcdGdldFJlc3RyaWN0aW9uTGF5ZXJzOiBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuXHRcdFx0dmFyIGNvbGxlY3Rpb25JZCAgPSB0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSk7XG5cdFx0XHRpZiAodGhpc1tjb2xsZWN0aW9uSWRdKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzW2NvbGxlY3Rpb25JZF0uc2xpY2UoMCk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdGdldEZlYXR1cmVHcm91cDogZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZlYXR1cmVHcm91cDtcblx0XHR9LFxuXG5cdFx0aXNWYWxpZDogZnVuY3Rpb24obWV0aG9kTmFtZSkge1xuXHRcdFx0aWYgKG1ldGhvZE5hbWUgJiYgdGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdKSB7XG5cdFx0XHRcdHJldHVybiAhdGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLmxlbmd0aDtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0ZmlyZU9uTWFwOiBmdW5jdGlvbiAoZXZlbnROYW1lLCBldmVudCkge1xuXHRcdFx0aWYgKHRoaXMuX2ZlYXR1cmVHcm91cC5fbWFwKVxuXHRcdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAuX21hcC5maXJlKGV2ZW50TmFtZSwgZXZlbnQpO1xuXHRcdH0sXG5cblx0XHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdFx0dmFyIGNvbGxlY3Rpb25JZCwgY29sbGVjdGlvbiwgbWV0aG9kTmFtZTtcblxuXHRcdFx0Zm9yICh2YXIgbmFtZSBpbiBKU1RTX01FVEhPRFMpIHtcblxuXHRcdFx0XHRtZXRob2ROYW1lID0gSlNUU19NRVRIT0RTW25hbWVdO1xuXHRcdFx0XHRjb2xsZWN0aW9uSWQgPSB0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSk7XG5cdFx0XHRcdGNvbGxlY3Rpb24gPSB0aGlzW2NvbGxlY3Rpb25JZF07XG5cblx0XHRcdFx0aWYgKGNvbGxlY3Rpb24pXG5cdFx0XHRcdFx0Y29sbGVjdGlvbi5mb3JFYWNoKHRoaXMuX3Vud2F0Y2guYmluZCh0aGlzLCBtZXRob2ROYW1lKSk7XG5cblx0XHRcdFx0dGhpcy5fdW53YXRjaE1lKG1ldGhvZE5hbWUpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBEaXNhYmxlIHRlbXBvcmFyaWx5IG9uIHZhbGlkYXRpb24gYW5kIGV4ZWN1dGUgZm5cblx0XHQgKiBAcGFyYW0gIHtTdHJpbmd9ICAgb3AgdmFsaWRhdGlvbiBuYW1lXG5cdFx0ICogQHBhcmFtICB7RnVuY3Rpb259IGZuIFxuXHRcdCAqIEBwYXJhbSAge09iamVjdH0gY29udGV4dCB0aGlzQXJnXG5cdFx0ICogQHJldHVybiB7QW55fSBmbiByZXN1bHRcblx0XHQgKi9cblx0XHR3YWl0OiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZm4sIGNvbnRleHQpIHtcblxuXHRcdFx0dmFyIGNvbGxlY3Rpb25JZCA9IHRoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKTtcblxuXHRcdFx0aWYgKHRoaXNbY29sbGVjdGlvbklkXSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXNbY29sbGVjdGlvbklkXS5mb3JFYWNoKHRoaXMuX3Vud2F0Y2guYmluZCh0aGlzLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdFx0dGhpcy5fdW53YXRjaE1lKG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIGZuLmNhbGwoY29udGV4dCwgdGhpcyk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzW2NvbGxlY3Rpb25JZF0uZm9yRWFjaCh0aGlzLl93YXRjaC5iaW5kKHRoaXMsIG1ldGhvZE5hbWUpKTtcblx0XHRcdFx0XHRcdHRoaXMuX3dhdGNoTWUobWV0aG9kTmFtZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdHdpdGhpbjogZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy5fb24oSlNUU19NRVRIT0RTLldpdGhpbiwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKSk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXG5cdFx0ZGlzam9pbnQ6IGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuX29uKEpTVFNfTUVUSE9EUy5EaXNqb2ludCwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKSk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXG5cdFx0X2NvbGxlY3Rpb25JZDogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblx0XHRcdHJldHVybiBtZXRob2ROYW1lID8gJ18nICsgbWV0aG9kTmFtZSArICdzJyA6IG51bGw7XG5cdFx0fSxcblxuXHRcdF9nZXRIYW5kbGVyOiBmdW5jdGlvbihoYW5kbGVyLCBtZXRob2ROYW1lKSB7XG5cdFx0XHR2YXIgaWQgPSBMLnN0YW1wKGhhbmRsZXIpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX2JpbmRlZFttZXRob2ROYW1lXSlcblx0XHRcdFx0dGhpcy5fYmluZGVkW21ldGhvZE5hbWVdID0ge307XG5cblx0XHRcdGlmICghdGhpcy5fYmluZGVkW21ldGhvZE5hbWVdW2lkXSlcblx0XHRcdFx0dGhpcy5fYmluZGVkW21ldGhvZE5hbWVdW2lkXSA9IGhhbmRsZXIuYmluZCh0aGlzLCBtZXRob2ROYW1lKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuX2JpbmRlZFttZXRob2ROYW1lXVtpZF07XG5cdFx0fSxcblxuXHRcdF9vZmY6IGZ1bmN0aW9uIChtZXRob2ROYW1lKSB7XG5cdFx0XHR2YXIgY29sbGVjdGlvbklkID0gdGhpcy5fY29sbGVjdGlvbklkKG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRpZiAodGhpc1tjb2xsZWN0aW9uSWRdKSB7XG5cdFx0XHRcdHRoaXNbY29sbGVjdGlvbklkXS5mb3JFYWNoKHRoaXMuX3Vud2F0Y2guYmluZCh0aGlzLCBtZXRob2ROYW1lKSk7XG5cdFx0XHRcdGRlbGV0ZSB0aGlzW2NvbGxlY3Rpb25JZF07XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9vbjogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGxheWVycykge1xuXHRcdFx0dGhpcy5fb2ZmKG1ldGhvZE5hbWUpO1xuXHRcdFx0dGhpc1t0aGlzLl9jb2xsZWN0aW9uSWQobWV0aG9kTmFtZSldID0gbGF5ZXJzO1xuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGVGZWF0dXJlOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZXZ0KSB7XG5cdFx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0c2VsZi5fZmVhdHVyZUdyb3VwLmpzdHMuY2xlYW4oKTtcblx0XHRcdFx0c2VsZi5fdmFsaWRhdGVUYXJnZXQobWV0aG9kTmFtZSk7XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0X3ZhbGlkYXRlUmVzdHJpY3Rpb246IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblxuXHRcdFx0aWYgKHRoaXMuX2ZlYXR1cmVHcm91cC5pc0VtcHR5KCkpXG5cdFx0XHRcdHJldHVybjtcblxuXHRcdFx0dmFyIHJlc3RyaWN0aW9uSWQgPSBMLnN0YW1wKGV2dC50YXJnZXQpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX2ZlYXR1cmVHcm91cC5qc3RzW21ldGhvZE5hbWVdKGV2dC50YXJnZXQpKSB7XG5cblx0XHRcdFx0aWYgKCF0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0pXG5cdFx0XHRcdFx0dGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdID0gW107XG5cblx0XHRcdFx0aWYgKHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5pbmRleE9mKHJlc3RyaWN0aW9uSWQpID09PSAtMSlcblx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ucHVzaChyZXN0cmljdGlvbklkKTtcblxuXHRcdFx0XHRldnQgPSB7dmFsaWRhdGlvbjogbWV0aG9kTmFtZSwgdGFyZ2V0TGF5ZXI6IHRoaXMuX2ZlYXR1cmVHcm91cCwgcmVzdHJpY3Rpb25MYXllcjogZXZ0LnRhcmdldH07XG5cblx0XHRcdFx0dGhpcy5maXJlKCdpbnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6aW52YWxpZCcsIGV2dCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdKSB7XG5cdFx0XHRcdFx0dmFyIGluZGV4ID0gdGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLmluZGV4T2YocmVzdHJpY3Rpb25JZCk7XG5cblx0XHRcdFx0XHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLnNwbGljZShpbmRleCwgMSk7XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBtZXRob2ROYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwfTtcblx0XHRcdFx0XHRcdFx0dGhpcy5maXJlKCd2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X3ZhbGlkYXRlUmVzdHJpY3Rpb25GZWF0dXJlOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZXZ0KSB7XG5cdFx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0dmFyIGNvbGxlY3Rpb25JZCA9IHNlbGYuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKSxcblx0XHRcdFx0Y29sbGVjdGlvbiwgcmVzdHJpY3Rpb25MYXllcjtcblxuXHRcdFx0XHRpZiAoKGNvbGxlY3Rpb24gPSBzZWxmW2NvbGxlY3Rpb25JZF0pKSB7XG5cdFx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBjb2xsZWN0aW9uLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRpZiAoY29sbGVjdGlvbltpXS5oYXNMYXllcihldnQudGFyZ2V0KSkge1xuXG5cdFx0XHRcdFx0XHRcdChyZXN0cmljdGlvbkxheWVyID0gY29sbGVjdGlvbltpXSkuanN0cy5jbGVhbigpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocmVzdHJpY3Rpb25MYXllcikge1xuXHRcdFx0XHRcdHNlbGYuX3ZhbGlkYXRlUmVzdHJpY3Rpb24obWV0aG9kTmFtZSwge3RhcmdldDogcmVzdHJpY3Rpb25MYXllcn0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9LFxuXG5cdFx0X3ZhbGlkYXRlVGFyZ2V0OiBmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0XHR2YXIgZXZ0LCB2YWxpZCA9IHRydWU7XG5cblx0XHRcdGlmICh0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0gJiYgdGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdLmxlbmd0aClcblx0XHRcdFx0dmFsaWQgPSBmYWxzZTtcblxuXHRcdFx0dGhpcy5fZXJyb3JzW21ldGhvZE5hbWVdID0gW107XG5cblx0XHRcdGlmICh0aGlzLl9mZWF0dXJlR3JvdXAuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGlmICghdmFsaWQpIHtcblx0XHRcdFx0XHRldnQgPSB7dmFsaWRhdGlvbjogbWV0aG9kTmFtZSwgdGFyZ2V0TGF5ZXI6IHRoaXMuX2ZlYXR1cmVHcm91cH07XG5cdFx0XHRcdFx0dGhpcy5maXJlKCd2YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6dmFsaWQnLCBldnQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR2YXIgcmVzdHJpY3Rpb25MYXllcnMgPSB0aGlzW3RoaXMuX2NvbGxlY3Rpb25JZChtZXRob2ROYW1lKV0sXG5cdFx0XHRtZXRob2QgPSB0aGlzLl9mZWF0dXJlR3JvdXAuanN0c1ttZXRob2ROYW1lXTtcblxuXHRcdFx0aWYgKHJlc3RyaWN0aW9uTGF5ZXJzKSB7XG5cdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBtZXRob2ROYW1lLCB0YXJnZXRMYXllcjogdGhpcy5fZmVhdHVyZUdyb3VwfTtcblxuXHRcdFx0XHRyZXN0cmljdGlvbkxheWVycy5mb3JFYWNoKGZ1bmN0aW9uKHJlc3RyaWN0aW9uTGF5ZXIpIHtcblxuXHRcdFx0XHRcdGlmICghbWV0aG9kLmNhbGwodGhpcy5fZmVhdHVyZUdyb3VwLmpzdHMsIHJlc3RyaWN0aW9uTGF5ZXIpKSB7XG5cblx0XHRcdFx0XHRcdHRoaXMuX2Vycm9yc1ttZXRob2ROYW1lXS5wdXNoKEwuc3RhbXAocmVzdHJpY3Rpb25MYXllcikpO1xuXHRcdFx0XHRcdFx0XG5cdFx0XHRcdFx0XHRldnQucmVzdHJpY3Rpb25MYXllciA9IHJlc3RyaWN0aW9uTGF5ZXI7XG5cblx0XHRcdFx0XHRcdHRoaXMuZmlyZSgnaW52YWxpZCcsIGV2dCk7XG5cdFx0XHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzppbnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdFx0aWYgKCF0aGlzLl9lcnJvcnNbbWV0aG9kTmFtZV0ubGVuZ3RoICYmICF2YWxpZCkge1xuXG5cdFx0XHRcdFx0ZXZ0ID0ge3ZhbGlkYXRpb246IG1ldGhvZE5hbWUsIHRhcmdldExheWVyOiB0aGlzLl9mZWF0dXJlR3JvdXB9O1xuXHRcdFx0XHRcdHRoaXMuZmlyZSgndmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdHRoaXMuZmlyZU9uTWFwKCdkcmF3OnZhbGlkJywgZXZ0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfdW53YXRjaDogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGZlYXR1cmVHcm91cCkge1xuXHRcdFx0dmFyIHdhdGNoZXIgPSB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlUmVzdHJpY3Rpb24sIG1ldGhvZE5hbWUpO1xuXG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcmFkZCcsIHdhdGNoZXIpO1xuXHRcdFx0ZmVhdHVyZUdyb3VwLm9mZignbGF5ZXJyZW1vdmUnLCB3YXRjaGVyKTtcblxuXHRcdFx0ZmVhdHVyZUdyb3VwLm9mZignbGF5ZXJhZGQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3dhdGNoUmVzdHJpY3Rpb25GZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5lYWNoTGF5ZXIoZnVuY3Rpb24gKGxheWVyKSB7XG5cdFx0XHRcdGlmIChsYXllci5lZGl0aW5nKSB7XG5cdFx0XHRcdFx0bGF5ZXIub2ZmKCdlZGl0JywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZVJlc3RyaWN0aW9uRmVhdHVyZSwgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9LFxuXG5cdFx0X3Vud2F0Y2hNZTogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcblxuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLmVhY2hMYXllcihmdW5jdGlvbiAobGF5ZXIpIHtcblx0XHRcdFx0aWYgKGxheWVyLmVkaXRpbmcpIHtcblx0XHRcdFx0XHRsYXllci5vZmYoJ2VkaXQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlRmVhdHVyZSwgbWV0aG9kTmFtZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLm9mZignbGF5ZXJhZGQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3dhdGNoRmVhdHVyZSwgbWV0aG9kTmFtZSkpO1xuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLm9mZignbGF5ZXJhZGQgbGF5ZXJyZW1vdmUnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlVGFyZ2V0LCBtZXRob2ROYW1lKSk7XG5cdFx0fSxcblxuXHRcdF93YXRjaDogZnVuY3Rpb24gKG1ldGhvZE5hbWUsIGZlYXR1cmVHcm91cCkge1xuXG5cdFx0XHR2YXIgd2F0Y2hlciA9IHRoaXMuX2dldEhhbmRsZXIodGhpcy5fdmFsaWRhdGVSZXN0cmljdGlvbiwgbWV0aG9kTmFtZSk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5lYWNoTGF5ZXIoZnVuY3Rpb24gKGxheWVyKSB7XG5cdFx0XHRcdHRoaXMuX3dhdGNoUmVzdHJpY3Rpb25GZWF0dXJlKG1ldGhvZE5hbWUsIHtsYXllcjogbGF5ZXJ9KTtcblx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkJywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl93YXRjaFJlc3RyaWN0aW9uRmVhdHVyZSwgbWV0aG9kTmFtZSkpO1xuXHRcdFx0ZmVhdHVyZUdyb3VwLm9uKCdsYXllcmFkZCcsIHdhdGNoZXIpO1xuXHRcdFx0ZmVhdHVyZUdyb3VwLm9uKCdsYXllcnJlbW92ZScsIHdhdGNoZXIpO1xuXHRcdH0sXG5cblx0XHRfd2F0Y2hGZWF0dXJlOiBmdW5jdGlvbiAobWV0aG9kTmFtZSwgZXZ0KSB7XG5cdFx0XHRpZiAoZXZ0LmxheWVyLmVkaXRpbmcpIHtcblx0XHRcdFx0ZXZ0LmxheWVyLm9uKCdlZGl0JywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZUZlYXR1cmUsIG1ldGhvZE5hbWUpKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X3dhdGNoTWU6IGZ1bmN0aW9uIChtZXRob2ROYW1lKSB7XG5cblx0XHRcdHRoaXMuX2ZlYXR1cmVHcm91cC5lYWNoTGF5ZXIoZnVuY3Rpb24gKGxheWVyKSB7XG5cdFx0XHRcdHRoaXMuX3dhdGNoRmVhdHVyZShtZXRob2ROYW1lLCB7bGF5ZXI6IGxheWVyfSk7XG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLm9uKCdsYXllcmFkZCcsIHRoaXMuX2dldEhhbmRsZXIodGhpcy5fd2F0Y2hGZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkIGxheWVycmVtb3ZlJywgdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZVRhcmdldCwgbWV0aG9kTmFtZSkpO1xuXHRcdH0sXG5cblx0XHRfd2F0Y2hSZXN0cmljdGlvbkZlYXR1cmU6IGZ1bmN0aW9uIChtZXRob2ROYW1lLCBldnQpIHtcblx0XHRcdGlmIChldnQubGF5ZXIuZWRpdGluZykge1xuXHRcdFx0XHRldnQubGF5ZXIub24oJ2VkaXQnLCB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlUmVzdHJpY3Rpb25GZWF0dXJlLCBtZXRob2ROYW1lKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH0pO1xuXG5cblx0TC5GZWF0dXJlR3JvdXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdGhpcy52YWxpZGF0aW9uKVxuXHRcdFx0dGhpcy52YWxpZGF0aW9uID0gbmV3IEwuRmVhdHVyZUdyb3VwLlZhbGlkYXRpb24odGhpcyk7XG5cblx0XHRpZiAoIXRoaXMuZml4KVxuXHRcdFx0dGhpcy5maXggPSBuZXcgTC5GZWF0dXJlR3JvdXAuRml4ZXIodGhpcy52YWxpZGF0aW9uKTtcblx0fSk7XG5cbn0pKCk7Il0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
