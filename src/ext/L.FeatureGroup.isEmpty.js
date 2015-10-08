L.FeatureGroup.include({
	isEmpty: function() {

		for (var id in this._layers) {
			return false;
		}

		return true;
	}
});