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
			if (this._withins)
				this._withins.forEach(this._watch.bind(this, WITHIN));
		},

		fireOnMap: function (name, evt) {
			if (this._featureGroup._map)
				this._featureGroup._map.fire(name, evt);
		},

		removeHooks: function () {
			this._unwithin();
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
			var id = L.stamp(evt.target);

			if (!this._featureGroup[op](evt.target)) {

				if (!this._errors[op])
					this._errors[op] = [];

				if (this._errors[op].indexOf(id) === -1)
					this._errors[op].push(id);

				evt = {validation: op, targetLayer: this, sourceLayer: evt.target};

				this.fire('invalid', evt);
				this.fireOnMap('draw:invalid', evt);
			} else {
				if (this._errors[op]) {
					var index = this._errors[op].indexOf(id);

					if (index > -1) {
						this._errors[op].splice(index, 1);

						if (this._errors.length === 0) {
							evt = {validation: op, targetLayer: this};
							this.fire('valid', evt);
							this.fireOnMap('draw:valid', evt);
						}
					}
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
			if (this._withins)
				this._withins.forEach(this._unwatch.bind(this, WITHIN));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkltcG9ydHMuanMiLCJTaGFwZVppcC5qcyIsIkwuRmVhdHVyZUdyb3VwLlZhbGlkYXRpb24uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoibGVhZmxldC5kcmF3LnBsdXMuanMiLCJzb3VyY2VzQ29udGVudCI6WyI7KGZ1bmN0aW9uKCkge1xuXG5cdGlmICghTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMpXG5cdFx0TC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMgPSB7fTtcblxuXHRMLkRyYXcuSW1wb3J0cyA9IEwuRHJhdy5GZWF0dXJlLmV4dGVuZCh7XG5cdFx0c3RhdGljczoge1xuXHRcdFx0Rk9STUFUUzogW10sXG5cdFx0XHRUWVBFOiAnaW1wb3J0cydcblx0XHR9LFxuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG1hcCwgb3B0aW9ucykge1xuXHRcdFx0dGhpcy50eXBlID0gTC5EcmF3LkltcG9ydHMuVFlQRTtcblxuXHRcdFx0TC5EcmF3LkZlYXR1cmUucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBtYXAsIG9wdGlvbnMpO1xuXHRcdH0sXG5cblx0XHRnZXRBY3Rpb25zOiBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdHJldHVybiBMLkRyYXcuSW1wb3J0cy5GT1JNQVRTLm1hcChmdW5jdGlvbihmb3JtYXQpIHtcblx0XHRcdFx0dmFyIG93bkVsZW1lbnQgPSBudWxsO1xuXG5cdFx0XHRcdGlmIChmb3JtYXQuY3JlYXRlQWN0aW9uRWxlbWVudClcblx0XHRcdFx0XHRvd25FbGVtZW50ID0gZm9ybWF0LmNyZWF0ZUFjdGlvbkVsZW1lbnQuY2FsbCh0aGlzKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0dGl0bGU6IGZvcm1hdC50aXRsZSxcblx0XHRcdFx0XHR0ZXh0OiBmb3JtYXQudGV4dCxcblx0XHRcdFx0XHRjYWxsYmFjazogZm9ybWF0LmNhbGxiYWNrLFxuXHRcdFx0XHRcdGNvbnRleHQ6IHRoaXMsXG5cdFx0XHRcdFx0b3duRWxlbWVudDogb3duRWxlbWVudFxuXHRcdFx0XHR9O1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fVxuXHR9KTtcblxufSkoKTsiLCI7KGZ1bmN0aW9uKCkge1xuXG5cdGlmICghTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXApIHtcblx0XHRMLmRyYXdMb2NhbC5kcmF3LnRvb2xiYXIuaW1wb3J0cy5zaGFwZVppcCA9IHtcblx0XHRcdHRleHQ6ICdJbXBvcnQgYSBzaGFwZWZpbGUgemlwJyxcblx0XHRcdHRpdGxlOiAnUGxlYXNlLCBzZWxlY3QgYSB6aXAgZmlsZS4nXG5cdFx0fTtcblx0fVxuXG5cdFNocFppcEZvcm1hdCA9IHtcblxuXHRcdF9oYW5kbGVyczoge30sXG5cblx0XHRfbmV4dElkOiAxLFxuXG5cdFx0Y3JlYXRlT3BlbkJ1dHRvbjogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgbGluayA9IEwuRG9tVXRpbC5jcmVhdGUoJ2EnKTtcblxuXHRcdFx0bGluay5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0XHRsaW5rLmlubmVySFRNTCA9IEwuZHJhd0xvY2FsLmRyYXcudG9vbGJhci5pbXBvcnRzLnNoYXBlWmlwLnRleHQ7XG5cdFx0XHRsaW5rLnRpdGxlID0gTC5kcmF3TG9jYWwuZHJhdy50b29sYmFyLmltcG9ydHMuc2hhcGVaaXAudGl0bGU7XG5cblx0XHRcdHZhciBpbnB1dCA9IEwuRG9tVXRpbC5jcmVhdGUoJ2lucHV0JywgJ2xlYWZsZXQtZHJhdy1kcmF3LWltcG9ydHMtYWN0aW9uJywgbGluayk7XG5cdFx0XHRpbnB1dC50eXBlID0gJ2ZpbGUnO1xuXG5cdFx0XHR2YXIgaGFuZGxlciA9IHRoaXM7XG5cblx0XHRcdGlucHV0Lm9uY2hhbmdlID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFNocFppcEZvcm1hdC5fb3BlblNoYXBlWmlwKGhhbmRsZXIsIGlucHV0KTtcblx0XHRcdH07XG5cblx0XHRcdHJldHVybiBsaW5rO1xuXHRcdH0sXG5cblx0XHRub3A6IGZ1bmN0aW9uKCkge30sXG5cblx0XHRfZ2V0V29ya2VyOiBmdW5jdGlvbigpIHtcblx0XHRcdGlmICghdGhpcy5fd29ya2VyKSB7XG5cdFx0XHRcdGlmIChMLkRyYXcuSW1wb3J0cy5TSFBKU19VUkwpIHtcblxuXHRcdFx0XHRcdC8vIE5vIGV4dGVybmFsIC5qcyBzY3JpcHRcblx0XHRcdFx0XHR2YXIgc2NyaXB0ID0gXCJ0cnkgeyBpbXBvcnRTY3JpcHRzKCdcIiArIEwuRHJhdy5JbXBvcnRzLlNIUEpTX1VSTCArIFwiJyk7IH0gY2F0Y2ggKGUpIHtjb25zb2xlLmVycm9yKGUpOyB0aHJvdyBlO31cXG5cIiArXG5cdFx0XHRcdFx0XCJvbm1lc3NhZ2UgPSBmdW5jdGlvbihlKSB7XFxuXCIgK1xuXHRcdFx0XHRcdFx0XCJjb25zb2xlLmxvZygnUHJvY2Vzc2luZyBTaGFwZVppcC4uLicpO1xcblwiICtcblx0XHRcdFx0XHRcdFwidmFyIGdlb0pTT04gPSBzaHAucGFyc2VaaXAoZS5kYXRhLmJ5dGVBcnJheSk7XFxuXCIgK1xuXHRcdFx0XHRcdFx0XCJjb25zb2xlLmxvZygnU2hhcGVaaXAgcHJvY2Vzc2VkIScpO1xcblwiICtcblx0XHRcdFx0XHRcdFwicG9zdE1lc3NhZ2Uoe2lkOiBlLmRhdGEuaWQsIGdlb0pTT046IGdlb0pTT059KTtcXG5cIiArXG5cdFx0XHRcdFx0XCJ9XCI7XG5cblx0XHRcdFx0XHR2YXIgdXJsRGF0YSA9IFVSTC5jcmVhdGVPYmplY3RVUkwobmV3IEJsb2IoW3NjcmlwdF0sIHt0eXBlOiBcImFwcGxpY2F0aW9uL2phdmFzY3JpcHRcIn0pKTtcblx0XHRcdFx0XHR0aGlzLl93b3JrZXIgPSBuZXcgV29ya2VyKHVybERhdGEpO1xuXG5cdFx0XHRcdFx0dGhpcy5fd29ya2VyLm9ubWVzc2FnZSA9IHRoaXMuX29ubWVzc2FnZS5iaW5kKHRoaXMpO1xuXHRcdFx0XHRcdHRoaXMuX3dvcmtlci5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhhcmd1bWVudHMpO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignTmVlZCBzaGFwZWZpbGUtanMgVVJMJyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLl93b3JrZXI7XG5cdFx0fSxcblxuXHRcdF9vbm1lc3NhZ2U6IGZ1bmN0aW9uKGUpIHtcblx0XHRcdHZhciBnZW9KU09OID0gZS5kYXRhLmdlb0pTT047XG5cdFx0XHR2YXIgaGFuZGxlciA9IHRoaXMuX2hhbmRsZXJzW2UuZGF0YS5pZF07XG5cblx0XHRcdC8vIFRPRE86IElzIGl0IGFsd2F5cyBGZWF0dXJlQ29sbGVjdGlvbj9cblx0XHRcdFxuXHRcdFx0dmFyIHByb3BlcnRpZXMsIGdlb21ldHJ5LCBuZXdGZWF0dXJlLCBpLCBsYXllcjtcblxuXHRcdFx0Z2VvSlNPTi5mZWF0dXJlcy5mb3JFYWNoKGZ1bmN0aW9uKGZlYXR1cmUpIHtcblx0XHRcdFx0cHJvcGVydGllcyA9IGZlYXR1cmUucHJvcGVydGllcztcblx0XHRcdFx0Z2VvbWV0cnkgPSBmZWF0dXJlLmdlb21ldHJ5O1xuXG5cdFx0XHRcdGlmIChnZW9tZXRyeS50eXBlLnN0YXJ0c1dpdGgoXCJNdWx0aVwiKSkge1xuXHRcdFx0XHRcdGZvciAoaT0wOyBpIDwgZ2VvbWV0cnkuY29vcmRpbmF0ZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdG5ld0ZlYXR1cmUgPSB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IGdlb21ldHJ5LnR5cGUuc3Vic3RyaW5nKDUpLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzLFxuXHRcdFx0XHRcdFx0XHRjb29yZGluYXRlczogZ2VvbWV0cnkuY29vcmRpbmF0ZXNbaV1cblx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdGxheWVyID0gTC5HZW9KU09OLmdlb21ldHJ5VG9MYXllcihuZXdGZWF0dXJlKTtcblx0XHRcdFx0XHRcdGhhbmRsZXIuX2ZpcmVDcmVhdGVkRXZlbnQobGF5ZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsYXllciA9IEwuR2VvSlNPTi5nZW9tZXRyeVRvTGF5ZXIoZmVhdHVyZSk7XG5cdFx0XHRcdFx0aGFuZGxlci5fZmlyZUNyZWF0ZWRFdmVudChsYXllcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRoYW5kbGVyLmRpc2FibGUoKTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cblx0XHRfb3BlblNoYXBlWmlwOiBmdW5jdGlvbihoYW5kbGVyLCBpbnB1dCkge1xuXHRcdFx0aWYgKCFpbnB1dC5maWxlcyAmJiAhaW5wdXQuZmlsZXNbMF0pXG5cdFx0XHRcdHJldHVybjtcblxuXHRcdFx0dmFyIHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG5cblx0XHRcdHJlYWRlci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcblxuXHRcdFx0XHRpZiAocmVhZGVyLnJlYWR5U3RhdGUgIT09IDIpXG5cdFx0XHRcdFx0cmV0dXJuO1xuXG5cdFx0XHRcdGlmIChyZWFkZXIucmVzdWx0KSB7XG5cdFx0XHRcdFx0U2hwWmlwRm9ybWF0Ll9wYXJzZShoYW5kbGVyLCByZWFkZXIucmVzdWx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHR9O1xuXG5cdFx0XHRoYW5kbGVyLl9tYXAuZmlyZSgnZHJhdzppbXBvcnRzdGFydCcpO1xuXHRcdFx0cmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGlucHV0LmZpbGVzWzBdKTtcblx0XHR9LFxuXG5cdFx0X3BhcnNlOiBmdW5jdGlvbihoYW5kbGVyLCBieXRlQXJyYXkpIHtcblx0XHRcdHZhciB3b3JrZXIgPSB0aGlzLl9nZXRXb3JrZXIoKTtcblx0XHRcdHZhciBpZCA9IHRoaXMuX25leHRJZCsrO1xuXHRcdFx0dGhpcy5faGFuZGxlcnNbaWRdID0gaGFuZGxlcjtcblxuXHRcdFx0d29ya2VyLnBvc3RNZXNzYWdlKHtpZDogaWQsIGJ5dGVBcnJheTogYnl0ZUFycmF5fSwgW2J5dGVBcnJheV0pO1xuXHRcdH0sXG5cdH07XG5cblx0TC5EcmF3LkltcG9ydHMuRk9STUFUUy5wdXNoKHtcblx0XHRjYWxsYmFjazogU2hwWmlwRm9ybWF0Lm5vcCxcblx0XHRjcmVhdGVBY3Rpb25FbGVtZW50OiBTaHBaaXBGb3JtYXQuY3JlYXRlT3BlbkJ1dHRvblxuXG5cdH0pO1xufSkoKTsiLCI7KGZ1bmN0aW9uKCkge1xuXG5cdHZhciBXSVRISU4gPSAnd2l0aGluJztcblxuXHRMLkZlYXR1cmVHcm91cC5WYWxpZGF0aW9uID0gTC5IYW5kbGVyLmV4dGVuZCh7XG5cblx0XHRpbmNsdWRlczogTC5NaXhpbi5FdmVudHMsXG5cblx0XHRvcHRpb25zOiB7XG5cblx0XHR9LFxuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oZmVhdHVyZUdyb3VwKSB7XG5cdFx0XHR0aGlzLl9mZWF0dXJlR3JvdXAgPSBmZWF0dXJlR3JvdXA7XG5cdFx0XHR0aGlzLl9iaW5kZWQgPSB7fTtcblx0XHRcdHRoaXMuX2Vycm9ycyA9IHt9O1xuXHRcdH0sXG5cblx0XHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKHRoaXMuX3dpdGhpbnMpXG5cdFx0XHRcdHRoaXMuX3dpdGhpbnMuZm9yRWFjaCh0aGlzLl93YXRjaC5iaW5kKHRoaXMsIFdJVEhJTikpO1xuXHRcdH0sXG5cblx0XHRmaXJlT25NYXA6IGZ1bmN0aW9uIChuYW1lLCBldnQpIHtcblx0XHRcdGlmICh0aGlzLl9mZWF0dXJlR3JvdXAuX21hcClcblx0XHRcdFx0dGhpcy5fZmVhdHVyZUdyb3VwLl9tYXAuZmlyZShuYW1lLCBldnQpO1xuXHRcdH0sXG5cblx0XHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy5fdW53aXRoaW4oKTtcblx0XHR9LFxuXG5cdFx0d2l0aGluOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLl91bndpdGhpbigpO1xuXG5cdFx0XHR0aGlzLl93aXRoaW5zID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcblxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblxuXHRcdF9nZXRIYW5kbGVyOiBmdW5jdGlvbihoYW5kbGVyLCBvcCkge1xuXHRcdFx0dmFyIGlkID0gTC5zdGFtcChoYW5kbGVyKTtcblxuXHRcdFx0aWYgKCF0aGlzLl9iaW5kZWRbb3BdKVxuXHRcdFx0XHR0aGlzLl9iaW5kZWRbb3BdID0ge307XG5cblx0XHRcdGlmICghdGhpcy5fYmluZGVkW29wXVtpZF0pXG5cdFx0XHRcdHRoaXMuX2JpbmRlZFtvcF1baWRdID0gaGFuZGxlci5iaW5kKHRoaXMsIG9wKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuX2JpbmRlZFtvcF1baWRdO1xuXHRcdH0sXG5cblx0XHRfdmFsaWRhdGU6IGZ1bmN0aW9uIChvcCwgZXZ0KSB7XG5cdFx0XHR2YXIgaWQgPSBMLnN0YW1wKGV2dC50YXJnZXQpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX2ZlYXR1cmVHcm91cFtvcF0oZXZ0LnRhcmdldCkpIHtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX2Vycm9yc1tvcF0pXG5cdFx0XHRcdFx0dGhpcy5fZXJyb3JzW29wXSA9IFtdO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9lcnJvcnNbb3BdLmluZGV4T2YoaWQpID09PSAtMSlcblx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbb3BdLnB1c2goaWQpO1xuXG5cdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBvcCwgdGFyZ2V0TGF5ZXI6IHRoaXMsIHNvdXJjZUxheWVyOiBldnQudGFyZ2V0fTtcblxuXHRcdFx0XHR0aGlzLmZpcmUoJ2ludmFsaWQnLCBldnQpO1xuXHRcdFx0XHR0aGlzLmZpcmVPbk1hcCgnZHJhdzppbnZhbGlkJywgZXZ0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9lcnJvcnNbb3BdKSB7XG5cdFx0XHRcdFx0dmFyIGluZGV4ID0gdGhpcy5fZXJyb3JzW29wXS5pbmRleE9mKGlkKTtcblxuXHRcdFx0XHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lcnJvcnNbb3BdLnNwbGljZShpbmRleCwgMSk7XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9lcnJvcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdGV2dCA9IHt2YWxpZGF0aW9uOiBvcCwgdGFyZ2V0TGF5ZXI6IHRoaXN9O1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZpcmUoJ3ZhbGlkJywgZXZ0KTtcblx0XHRcdFx0XHRcdFx0dGhpcy5maXJlT25NYXAoJ2RyYXc6dmFsaWQnLCBldnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfb25MYXllclByZUFkZDogZnVuY3Rpb24gKG9wLCBldnQpIHtcblx0XHR9LFxuXG5cdFx0X29uTGF5ZXJSZW1vdmU6IGZ1bmN0aW9uIChvcCwgZXZ0KSB7XG5cdFx0fSxcblxuXHRcdF9vbkxheWVyUHJlUmVtb3ZlOiBmdW5jdGlvbihvcCwgZXZ0KSB7XG5cdFx0fSxcblxuXHRcdF91bndpdGhpbjogZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKHRoaXMuX3dpdGhpbnMpXG5cdFx0XHRcdHRoaXMuX3dpdGhpbnMuZm9yRWFjaCh0aGlzLl91bndhdGNoLmJpbmQodGhpcywgV0lUSElOKSk7XG5cdFx0fSxcblxuXHRcdF91bndhdGNoOiBmdW5jdGlvbiAob3AsIGZlYXR1cmVHcm91cCkge1xuXHRcdFx0dmFyIHdhdGNoZXIgPSB0aGlzLl9nZXRIYW5kbGVyKHRoaXMuX3ZhbGlkYXRlLCBvcCk7XG5cblx0XHRcdGZlYXR1cmVHcm91cC5vZmYoJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub2ZmKCdsYXllcnJlbW92ZScsIHdhdGNoZXIpO1xuXHRcdH0sXG5cblx0XHRfd2F0Y2g6IGZ1bmN0aW9uIChvcCwgZmVhdHVyZUdyb3VwKSB7XG5cblx0XHRcdHZhciB3YXRjaGVyID0gdGhpcy5fZ2V0SGFuZGxlcih0aGlzLl92YWxpZGF0ZSwgb3ApO1xuXG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVyYWRkJywgd2F0Y2hlcik7XG5cdFx0XHRmZWF0dXJlR3JvdXAub24oJ2xheWVycmVtb3ZlJywgd2F0Y2hlcik7XG5cdFx0fVxuXG5cdH0pO1xuXG5cblx0TC5GZWF0dXJlR3JvdXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdGhpcy52YWxpZGF0aW9uKVxuXHRcdFx0dGhpcy52YWxpZGF0aW9uID0gbmV3IEwuRmVhdHVyZUdyb3VwLlZhbGlkYXRpb24odGhpcyk7XG5cdH0pO1xuXG59KSgpOyJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
