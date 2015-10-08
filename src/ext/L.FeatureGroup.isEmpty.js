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