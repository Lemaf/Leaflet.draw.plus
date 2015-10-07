;(function () {

	var addLayer = L.FeatureGroup.prototype.addLayer,
	removeLayer: L.FeatureGroup.prototype.removeLayer;

	L.FeatureGroup.include({

		addLayer: function (layer) {
			this.fire('layerpreadd', {layer: layer});
			return addLayer.call(this, layer);
		},

		removeLayer: function (layer) {
			this.fire('layerpreremove', {layer: layer});
			return removeLayer.call(this, layer);
		}
	});

})();