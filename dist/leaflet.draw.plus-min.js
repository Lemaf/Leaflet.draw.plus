!function(){L.drawLocal.draw.toolbar.imports||(L.drawLocal.draw.toolbar.imports={}),L.Draw.Imports=L.Draw.Feature.extend({statics:{FORMATS:[],TYPE:"imports"},initialize:function(t,i){this.type=L.Draw.Imports.TYPE,L.Draw.Feature.prototype.initialize.call(this,t,i)},getActions:function(){return L.Draw.Imports.FORMATS.map(function(t){var i=null;return t.createActionElement&&(i=t.createActionElement.call(this)),{enabled:!0,title:t.title,text:t.text,callback:t.callback,context:this,ownElement:i}},this)}})}(),function(){L.drawLocal.draw.toolbar.imports.shapeZip||(L.drawLocal.draw.toolbar.imports.shapeZip={text:"Import a shapefile zip",title:"Please, select a zip file."}),ShpZipFormat={_handlers:{},_nextId:1,createOpenButton:function(){var t=L.DomUtil.create("a");t.style.position="relative",t.innerHTML=L.drawLocal.draw.toolbar.imports.shapeZip.text,t.title=L.drawLocal.draw.toolbar.imports.shapeZip.title;var i=L.DomUtil.create("input","leaflet-draw-draw-imports-action",t);i.type="file";var e=this;return i.onchange=function(){ShpZipFormat._openShapeZip(e,i)},t},nop:function(){},_getWorker:function(){if(!this._worker){if(!L.Draw.Imports.SHPJS_URL)throw new Error("Need shapefile-js URL");var t="";L.Draw.Imports.PROJ_URL&&(t="importScripts('"+L.Draw.Imports.PROJ_URL+"');");var i="try { importScripts('"+L.Draw.Imports.SHPJS_URL+"');"+t+"} catch (e) {console.error(e); throw e;}\nonmessage = function(e) {\nconsole.log('Processing ShapeZip...');\nvar geoJSON = shp.parseZip(e.data.byteArray);\nconsole.log('ShapeZip processed!');\npostMessage({id: e.data.id, geoJSON: geoJSON});\n}",e=URL.createObjectURL(new Blob([i],{type:"application/javascript"}));this._worker=new Worker(e),this._worker.onmessage=this._onmessage.bind(this),this._worker.onerror=function(){console.log(arguments)}}return this._worker},_onmessage:function(t){var i,e,r,a,n,s=t.data.geoJSON,o=this._handlers[t.data.id];s.features.forEach(function(t){if(i=t.properties,e=t.geometry,e.type.startsWith("Multi"))for(a=0;a<e.coordinates.length;a++)r={type:e.type.substring(5),properties:i,coordinates:e.coordinates[a]},n=L.GeoJSON.geometryToLayer(r),o._fireCreatedEvent(n);else n=L.GeoJSON.geometryToLayer(t),o._fireCreatedEvent(n);o.disable()})},_openShapeZip:function(t,i){if(i.files||i.files[0]){var e=new FileReader;e.onload=function(){2===e.readyState&&e.result&&ShpZipFormat._parse(t,e.result)},t._map.fire("draw:importstart"),e.readAsArrayBuffer(i.files[0])}},_parse:function(t,i){var e=this._getWorker(),r=this._nextId++;this._handlers[r]=t,e.postMessage({id:r,byteArray:i},[i])}},L.Draw.Imports.FORMATS.push({callback:ShpZipFormat.nop,createActionElement:ShpZipFormat.createOpenButton})}(),function(){L.FeatureGroup.Edit=L.Handler.extend({initialize:function(t){this._layer=t},addHooks:function(){this._layer.eachLayer(this._enableEditing,this),this._layer.on("layeradd",this._enableEditing,this),this._layer.on("layerremove",this._disableEditing,this)},removeHooks:function(){this._layer.eachLayer(this._disableEditing,this),this._layer.off("layeradd",this._enableEditing,this),this._layer.off("layerremove",this._disableEditing,this)},_disableEditing:function(t){t=t.layer||t,t.editing&&(t.editing.disable(),t.off("edit",this._onLayerEdit,this))},_enableEditing:function(t){t=t.layer||t,t.editing&&(t.editing.enable(),t.on("edit",this._onLayerEdit,this))},_onLayerEdit:function(t){this._layer.fire("edit",{layer:t.layer||t.target})}}),L.FeatureGroup.addInitHook(function(){this.editing||(this.editing=new L.FeatureGroup.Edit(this))})}(),L.FeatureGroup.include({count:function(){var t=0;for(var i in this._layers)this._layers[i].count?t+=this._layers[i].count():t++;return t}}),L.FeatureGroup.include({isEmpty:function(){var t=!0,i=!0;for(var e in this._layers)if(t=!1,this._layers[e].isEmpty){if(!this._layers[e].isEmpty())return!1}else i=!1;return t||i}}),L.FeatureGroup.addInitHook(function(){L.Jsts&&this.on("edit",this.jsts.clean,this.jsts)}),L.FeatureGroup.include({setLatLngs:function(t){var i,e=this.count();if(1!==e)throw e?new Error("Ambigous setLatLngs"):new Error("Empty layer!");for(var r in this._layers){if(i=this._layers[r],!i.setLatLngs)throw new Error("L.FeatureGroup doesn't have a layer with setLatLngs");i.setLatLngs(t)}}}),function(){var t={within:{check:"intersects",fix:"intersection"},disjoint:{check:"intersects",fix:"difference"}},i={within:"within",disjoint:"disjoint"};L.FeatureGroup.Fixer=L.Class.extend({initialize:function(t){this._validation=t},within:function(){var e=this;setTimeout(function(){var r=e._validation.isValid(i.within);r||e._fix(i.within,t.within)})},disjoint:function(){var e=this;setTimeout(function(){var r=e._validation.isValid(i.disjoint);r||e._fix(i.disjoint,t.disjoint)})},_fix:function(t,i){if(i){var e=i.check,r=i.fix;this._validation.wait(t,function(){function i(t,i){return L.jsts.union(t,i.jsts.geometry(),"Polygon")}var a,n,s,o=this._validation.getFeatureGroup(),h=this._validation.getRestrictionLayers(t);o.eachLayer(function(t){if(s=h.filter(function(i){return t.jsts.geometry()[e](i.jsts.geometry())}),s.length){if(restrictionGeometry=s.slice(1).reduce(i,s[0].jsts.geometry()),a=L.jsts[r](t.jsts.geometry(),restrictionGeometry))if(t.editing?(n=t.editing.enabled(),t.editing.disable()):n=!1,a instanceof jsts.geom.MultiPolygon){o.removeLayer(t);for(var l=t.options,d=0,c=a.getNumGeometries();c>d;d++)t=L.jsts.jstsToleaflet(a.getGeometryN(d),l),o.addLayer(t),n&&t.editing&&t.editing.enable()}else t.setLatLngs(L.jsts.jstsToLatLngs(a)),n&&t.editing.enable()}else o.removeLayer(t)}),o.jsts.clean()},this)}}})}(),function(){var t={Within:"within",Disjoint:"disjoint"};L.FeatureGroup.Validation=L.Handler.extend({includes:L.Mixin.Events,options:{},initialize:function(t){this._featureGroup=t,this._binded={},this._errors={}},addHooks:function(){var i,e,r;for(var a in t)r=t[a],i=this._collectionId(r),e=this[i],e&&e.forEach(this._watch.bind(this,r)),this._watchMe(r)},getRestrictionLayers:function(t){var i=this._collectionId(t);return this[i]?this[i].slice(0):void 0},getFeatureGroup:function(){return this._featureGroup},isValid:function(t){return t&&this._errors[t]?!this._errors[t].length:void 0},fireOnMap:function(t,i){this._featureGroup._map&&this._featureGroup._map.fire(t,i)},removeHooks:function(){var i,e,r;for(var a in t)r=t[a],i=this._collectionId(r),e=this[i],e&&e.forEach(this._unwatch.bind(this,r)),this._unwatchMe(r)},wait:function(t,i,e){var r=this._collectionId(t);if(this[r])try{return this[r].forEach(this._unwatch.bind(this,t)),this._unwatchMe(t),i.call(e,this)}finally{this.enabled()&&(this[r].forEach(this._watch.bind(this,t)),this._watchMe(t))}},within:function(){return this._on(t.Within,Array.prototype.slice.call(arguments,0)),this},disjoint:function(){return this._on(t.Disjoint,Array.prototype.slice.call(arguments,0)),this},_collectionId:function(t){return t?"_"+t+"s":null},_getHandler:function(t,i){var e=L.stamp(t);return this._binded[i]||(this._binded[i]={}),this._binded[i][e]||(this._binded[i][e]=t.bind(this,i)),this._binded[i][e]},_off:function(t){var i=this._collectionId(t);this[i]&&(this[i].forEach(this._unwatch.bind(this,t)),delete this[i])},_on:function(t,i){this._off(t),this[this._collectionId(t)]=i},_validateFeature:function(t,i){var e=this;setTimeout(function(){e._featureGroup.jsts.clean(),e._validateTarget(t)})},_validateRestriction:function(t,i){if(!this._featureGroup.isEmpty()){var e=L.stamp(i.target);if(this._featureGroup.jsts[t](i.target)){if(this._errors[t]){var r=this._errors[t].indexOf(e);r>-1&&(this._errors[t].splice(r,1),0===this._errors[t].length&&(i={validation:t,targetLayer:this._featureGroup},this.fire("valid",i),this.fireOnMap("draw:valid",i)))}}else this._errors[t]||(this._errors[t]=[]),-1===this._errors[t].indexOf(e)&&this._errors[t].push(e),i={validation:t,targetLayer:this._featureGroup,restrictionLayer:i.target},this.fire("invalid",i),this.fireOnMap("draw:invalid",i)}},_validateRestrictionFeature:function(t,i){var e=this;setTimeout(function(){var r,a,n=e._collectionId(t);if(r=e[n])for(var s=0;s<r.length;s++)if(r[s].hasLayer(i.target)){(a=r[s]).jsts.clean();break}a&&e._validateRestriction(t,{target:a})})},_validateTarget:function(t){var i,e=!0;if(this._errors[t]&&this._errors[t].length&&(e=!1),this._errors[t]=[],this._featureGroup.isEmpty())return void(e||(i={validation:t,targetLayer:this._featureGroup},this.fire("valid",i),this.fireOnMap("draw:valid",i)));var r=this[this._collectionId(t)],a=this._featureGroup.jsts[t];r&&(i={validation:t,targetLayer:this._featureGroup},r.forEach(function(e){a.call(this._featureGroup.jsts,e)||(this._errors[t].push(L.stamp(e)),i.restrictionLayer=e,this.fire("invalid",i),this.fireOnMap("draw:invalid",i))},this),this._errors[t].length||e||(i={validation:t,targetLayer:this._featureGroup},this.fire("valid",i),this.fireOnMap("draw:valid",i)))},_unwatch:function(t,i){var e=this._getHandler(this._validateRestriction,t);i.off("layeradd",e),i.off("layerremove",e),i.off("layeradd",this._getHandler(this._watchRestrictionFeature,t)),i.eachLayer(function(i){i.editing&&i.off("edit",this._getHandler(this._validateRestrictionFeature,t))},this)},_unwatchMe:function(t){this._featureGroup.eachLayer(function(i){i.editing&&i.off("edit",this._getHandler(this._validateFeature,t))},this),this._featureGroup.off("layeradd",this._getHandler(this._watchFeature,t)),this._featureGroup.off("layeradd layerremove",this._getHandler(this._validateTarget,t))},_watch:function(t,i){var e=this._getHandler(this._validateRestriction,t);i.eachLayer(function(i){this._watchRestrictionFeature(t,{layer:i})},this),i.on("layeradd",this._getHandler(this._watchRestrictionFeature,t)),i.on("layeradd",e),i.on("layerremove",e)},_watchFeature:function(t,i){i.layer.editing&&i.layer.on("edit",this._getHandler(this._validateFeature,t))},_watchMe:function(t){this._featureGroup.eachLayer(function(i){this._watchFeature(t,{layer:i})},this),this._featureGroup.on("layeradd",this._getHandler(this._watchFeature,t)),this._featureGroup.on("layeradd layerremove",this._getHandler(this._validateTarget,t))},_watchRestrictionFeature:function(t,i){i.layer.editing&&i.layer.on("edit",this._getHandler(this._validateRestrictionFeature,t))}}),L.FeatureGroup.addInitHook(function(){this.validation||(this.validation=new L.FeatureGroup.Validation(this)),this.fix||(this.fix=new L.FeatureGroup.Fixer(this.validation))})}();