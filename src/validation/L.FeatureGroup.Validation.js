;(function() {

	var WITHIN = 'within';

	L.FeatureGroup.Validation = L.Handler.extend({

		implements: L.Mixin.Events,

		options: {

		},

		initialize: function(featureGroup) {
			this._featureGroup = featureGroup;
			this._handlers = {};
		},

		addHooks: function () {

		},

		removeHooks: function () {

		},

		within: function () {
			this._unwithin();

			this._withins = Array.prototype.slice.call(arguments, 0);
			this._withins.forEach(this._watch.bind(this, WITHIN));
		},

		_onLayerAdd: function (op, evt) {
			var featureGroup = evt.target,
			layer = evt.layer;

			this.eachLayer(function (myLayer) {

			}, this);
		},

		_onLayerRemove: function (op, evt) {
		},

		_unwithin: function () {
			if (this._withins)
				this._withins.forEach(this._unwatch.bind(this, WITHIN));
		},

		_unwatch: function (op, featureGroup) {
			var id = L.stamp(featureGroup);

			var handlers = this._handlers[id][op];

			featureGroup.off('layeradd', handlers.onLayerAdd);
			featureGroup.off('layerremove', handlers.onLayerRemove);

			delete this._handlers[id][op];
		},

		_watch: function (op, featureGroup) {
			var id = L.stamp(featureGroup);

			if (!this._handlers[id])
				this._handlers[id] = {};

			this._handlers[id][op] = {
				onLayerPreAdd: this._onLayerPreAdd.bind(this, op),
				onLayerAdd: this._onLayerAdd.bind(this, op),
				onLayerPreRemove: this._onLayerPreRemove.bind(this, op),
				onLayerRemove: this._onLayerRemove.bind(this, op)
			};


			featureGroup.on('layeradd', this._handlers[id][op].onLayerAdd);
			featureGroup.on('layerremove', this._handlers[id][op].onLayerRemove);
		}

	});


	L.FeatureGroup.addInitHook(function () {
		if (!this.validation)
			this.validation = new L.FeatureGroup.Validation(this);
	});

})();