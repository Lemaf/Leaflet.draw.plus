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

						geometry = geometry[fixMethod](restrictionGeometry);
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

							layer.setLatLngs(L.jsts.jstsToLatLngs(fixedGeometry));

							if (restoreEdit)
								layer.editing.enable();
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