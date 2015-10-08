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