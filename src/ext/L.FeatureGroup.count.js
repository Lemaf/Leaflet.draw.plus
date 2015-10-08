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