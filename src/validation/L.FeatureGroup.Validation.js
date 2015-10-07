;(function() {

	var WITHIN = 'within';

	L.FeatureGroup.Validation = L.Handler.extend({

		includes: L.Mixin.Events,

		options: {

		},

		initialize: function(featureGroup) {
			this._featureGroup = featureGroup;
			this._binded = {};
			this._errors = {};
		},

		addHooks: function () {
			if (this._withins) {
				this._withins.forEach(this._watch.bind(this, WITHIN));
				this._featureGroup.on('layeradd layerremove', this._getHandler(this._validateMe, WITHIN));
			}
		},

		fireOnMap: function (name, evt) {
			if (this._featureGroup._map)
				this._featureGroup._map.fire(name, evt);
		},

		removeHooks: function () {
			if (this._withins) {
				this._featureGroup.off('layeradd layerremove', this._getHandler(this._validateMe, WITHIN));
				this._unwithin();
			}
		},

		within: function () {
			this._unwithin();

			this._withins = Array.prototype.slice.call(arguments, 0);

			return this;
		},

		_getHandler: function(handler, op) {
			var id = L.stamp(handler);

			if (!this._binded[op])
				this._binded[op] = {};

			if (!this._binded[op][id])
				this._binded[op][id] = handler.bind(this, op);

			return this._binded[op][id];
		},

		_validate: function (op, evt) {

			if (!this._featureGroup.getLayers().length)
				return;

			var id = L.stamp(evt.target);

			if (!this._featureGroup[op](evt.target)) {

				if (!this._errors[op])
					this._errors[op] = [];

				if (this._errors[op].indexOf(id) === -1)
					this._errors[op].push(id);

				evt = {validation: op, targetLayer: this._featureGroup, sourceLayer: evt.target};

				this.fire('invalid', evt);
				this.fireOnMap('draw:invalid', evt);
			} else {
				if (this._errors[op]) {
					var index = this._errors[op].indexOf(id);

					if (index > -1) {
						this._errors[op].splice(index, 1);

						if (this._errors[op].length === 0) {
							evt = {validation: op, targetLayer: this._featureGroup};
							this.fire('valid', evt);
							this.fireOnMap('draw:valid', evt);
						}
					}
				}
			}
		},

		_validateMe: function(op) {
			var evt;
			var valid = true;

			if (this._errors[op] && this._errors[op].length)
				valid = false;

			this._errors[op] = [];

			if (!this._featureGroup.getLayers().length) {
				if (!valid) {
					evt = {validation: op, targetLayer: this._featureGroup};
					this.fire('valid', evt);
					this.fireOnMap('draw:valid', evt);
				}

				return;
			}

			var layers = this['_' + op + 's'];

			if (layers) {
				evt = {validation: op, targetLayer: this._featureGroup};

				
				layers.forEach(function(layer) {

					if (!this._featureGroup[op](layer)) {

						this._errors[op].push(L.stamp(layer));
						evt.sourceLayer = layer;
						this.fire('invalid', evt);
						this.fireOnMap('draw:invalid', evt);
					}

				}, this);

				if (!this._errors[op].length && !valid) {
					evt = {validation: op, targetLayer: this._featureGroup};
					this.fire('valid', evt);
					this.fireOnMap('draw:valid', evt);
				}
			}
		},

		_onLayerPreAdd: function (op, evt) {
		},

		_onLayerRemove: function (op, evt) {
		},

		_onLayerPreRemove: function(op, evt) {
		},

		_unwithin: function () {
			if (this._withins) {
				this._withins.forEach(this._unwatch.bind(this, WITHIN));
				delete this._withins;
			}
		},

		_unwatch: function (op, featureGroup) {
			var watcher = this._getHandler(this._validate, op);

			featureGroup.off('layeradd', watcher);
			featureGroup.off('layerremove', watcher);
		},

		_watch: function (op, featureGroup) {

			var watcher = this._getHandler(this._validate, op);

			featureGroup.on('layeradd', watcher);
			featureGroup.on('layerremove', watcher);
		}

	});


	L.FeatureGroup.addInitHook(function () {
		if (!this.validation)
			this.validation = new L.FeatureGroup.Validation(this);
	});

})();