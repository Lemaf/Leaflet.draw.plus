;(function () {

	var FIX_OPERATIONS = {
		within: {
			check: 'intersects',
			fix: 'intersection'
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
			
		}
	});

})();