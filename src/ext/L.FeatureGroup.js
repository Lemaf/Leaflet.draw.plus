L.FeatureGroup.addInitHook(function() {

	if (L.Jsts)
		this.on('edit', this.jsts.clean, this.jsts);

});