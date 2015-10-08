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