!function(){L.drawLocal.draw.toolbar.imports||(L.drawLocal.draw.toolbar.imports={}),L.Draw.Imports=L.Draw.Feature.extend({statics:{FORMATS:[],TYPE:"imports"},initialize:function(t,i){this.type=L.Draw.Imports.TYPE,L.Draw.Feature.prototype.initialize.call(this,t,i)},getActions:function(){return L.Draw.Imports.FORMATS.map(function(t){var i=null;return t.createActionElement&&(i=t.createActionElement.call(this)),{enabled:!0,title:t.title,text:t.text,callback:t.callback,context:this,ownElement:i}},this)}})}(),function(){L.drawLocal.draw.toolbar.imports.shapeZip||(L.drawLocal.draw.toolbar.imports.shapeZip={text:"Import a shapefile zip",title:"Please, select a zip file."}),ShpZipFormat={_handlers:{},_nextId:1,createOpenButton:function(){var t=L.DomUtil.create("a");t.style.position="relative",t.innerHTML=L.drawLocal.draw.toolbar.imports.shapeZip.text,t.title=L.drawLocal.draw.toolbar.imports.shapeZip.title;var i=L.DomUtil.create("input","leaflet-draw-draw-imports-action",t);i.type="file";var e=this;return i.onchange=function(){ShpZipFormat._openShapeZip(e,i)},t},nop:function(){},_getWorker:function(){if(!this._worker){if(!L.Draw.Imports.SHPJS_URL)throw new Error("Need shapefile-js URL");var t="try { importScripts('"+L.Draw.Imports.SHPJS_URL+"'); } catch (e) {console.error(e); throw e;}\nonmessage = function(e) {\nconsole.log('Processing ShapeZip...');\nvar geoJSON = shp.parseZip(e.data.byteArray);\nconsole.log('ShapeZip processed!');\npostMessage({id: e.data.id, geoJSON: geoJSON});\n}",i=URL.createObjectURL(new Blob([t],{type:"application/javascript"}));this._worker=new Worker(i),this._worker.onmessage=this._onmessage.bind(this),this._worker.onerror=function(){console.log(arguments)}}return this._worker},_onmessage:function(t){var i,e,r,a,n,o=t.data.geoJSON,s=this._handlers[t.data.id];o.features.forEach(function(t){if(i=t.properties,e=t.geometry,e.type.startsWith("Multi"))for(a=0;a<e.coordinates.length;a++)r={type:e.type.substring(5),properties:i,coordinates:e.coordinates[a]},n=L.GeoJSON.geometryToLayer(r),s._fireCreatedEvent(n);else n=L.GeoJSON.geometryToLayer(t),s._fireCreatedEvent(n);s.disable()})},_openShapeZip:function(t,i){if(i.files||i.files[0]){var e=new FileReader;e.onload=function(){2===e.readyState&&e.result&&ShpZipFormat._parse(t,e.result)},t._map.fire("draw:importstart"),e.readAsArrayBuffer(i.files[0])}},_parse:function(t,i){var e=this._getWorker(),r=this._nextId++;this._handlers[r]=t,e.postMessage({id:r,byteArray:i},[i])}},L.Draw.Imports.FORMATS.push({callback:ShpZipFormat.nop,createActionElement:ShpZipFormat.createOpenButton})}(),function(){L.FeatureGroup.Edit=L.Handler.extend({initialize:function(t){this._layer=t},addHooks:function(){this._layer.eachLayer(this._enableEditing,this),this._layer.on("layeradd",this._enableEditing,this),this._layer.on("layerremove",this._disableEditing,this)},removeHooks:function(){this._layer.eachLayer(this._disableEditing,this),this._layer.off("layeradd",this._enableEditing,this),this._layer.off("layerremove",this._disableEditing,this)},_enableEditing:function(t){t.editing&&t.editing.enable()},_disableEditing:function(t){t.editing&&t.editing.disable()}}),L.FeatureGroup.addInitHook(function(){this.editing||(this.editing=new L.FeatureGroup.Edit(this))})}(),L.FeatureGroup.include({isEmpty:function(){for(var t in this._layers)return!1;return!0}}),function(){var t={within:{check:"jstsIntersects",fix:["jstsIntersection"]}},i={within:"jstsWithin"};L.FeatureGroup.Fixer=L.Class.extend({initialize:function(t){this._validation=t},within:function(){var e=this._validation.isValid(i.within);e||this._fix(i.within,t.within)},_fix:function(t,i){if(i){var e=i.check,r=i.fix;this._validation.wait(t,function(){function i(t,i){if(t[e](i))for(n=0;n<r.length;n++)o=r[n],t=t[o](i);return t}var a,n,o,s=this._validation.getFeatureGroup(),h=this._validation.getRestrictionLayers(t);s.eachLayer(function(t){t[e]&&(a=h.reduce(i,t),s.removeLayer(t),s.addLayer(a))})},this)}}})}(),function(){var t={Within:"jstsWithin"};L.FeatureGroup.Validation=L.Handler.extend({includes:L.Mixin.Events,options:{},initialize:function(t){this._featureGroup=t,this._binded={},this._errors={}},addHooks:function(){var i,e,r;for(var a in t)r=t[a],i=this._collectionId(r),e=this[i],e&&e.forEach(this._watch.bind(this,r)),this._watchMe(r)},getRestrictionLayers:function(t){var i=this._collectionId(t);return this[i]?this[i].slice(0):void 0},getFeatureGroup:function(){return this._featureGroup},isValid:function(t){return t&&this._errors[t]?!this._errors[t].length:void 0},fireOnMap:function(t,i){this._featureGroup._map&&this._featureGroup._map.fire(t,i)},removeHooks:function(){var i,e,r;for(var a in t)r=t[a],i=this._collectionId(r),e=this[i],e&&e.forEach(this._unwatch.bind(this,r)),this._unwatchMe(r)},wait:function(t,i,e){var r=this._collectionId(t);if(this[r])try{return this[r].forEach(this._unwatch.bind(this,t)),this._unwatchMe(t),i.call(e,this)}finally{this.enabled()&&(this[r].forEach(this._watch.bind(this,t)),this._watchMe(t))}},within:function(){return this._on(t.Within,Array.prototype.slice.call(arguments,0)),this},_collectionId:function(t){return t?"_"+t+"s":null},_getHandler:function(t,i){var e=L.stamp(t);return this._binded[i]||(this._binded[i]={}),this._binded[i][e]||(this._binded[i][e]=t.bind(this,i)),this._binded[i][e]},_off:function(t){var i=this._collectionId(t);this[i]&&(this[i].forEach(this._unwatch.bind(this,t)),delete this[i])},_on:function(t,i){this._off(t),this[this._collectionId(t)]=i},_validateRestriction:function(t,i){var e=t.slice(4);if(!this._featureGroup.isEmpty()){var r=L.stamp(i.target);if(this._featureGroup[t](i.target)){if(this._errors[t]){var a=this._errors[t].indexOf(r);a>-1&&(this._errors[t].splice(a,1),0===this._errors[t].length&&(i={validation:e,targetLayer:this._featureGroup},this.fire("valid",i),this.fireOnMap("draw:valid",i)))}}else this._errors[t]||(this._errors[t]=[]),-1===this._errors[t].indexOf(r)&&this._errors[t].push(r),i={validation:e,targetLayer:this._featureGroup,restrictionLayer:i.target},this.fire("invalid",i),this.fireOnMap("draw:invalid",i)}},_validateTarget:function(t){var i,e=!0,r=t.substring(4);if(this._errors[t]&&this._errors[t].length&&(e=!1),this._errors[t]=[],this._featureGroup.isEmpty())return void(e||(i={validation:r,targetLayer:this._featureGroup},this.fire("valid",i),this.fireOnMap("draw:valid",i)));var a=this[this._collectionId(t)],n=this._featureGroup[t];a&&(i={validation:r,targetLayer:this._featureGroup},a.forEach(function(e){n.call(this._featureGroup,e)||(this._errors[t].push(L.stamp(e)),i.restrictionLayer=e,this.fire("invalid",i),this.fireOnMap("draw:invalid",i))},this),this._errors[t].length||e||(i={validation:r,targetLayer:this._featureGroup},this.fire("valid",i),this.fireOnMap("draw:valid",i)))},_unwatch:function(t,i){var e=this._getHandler(this._validateRestriction,t);i.off("layeradd",e),i.off("layerremove",e)},_unwatchMe:function(t){this._featureGroup.off("layeradd layerremove",this._getHandler(this._validateTarget,t))},_watch:function(t,i){var e=this._getHandler(this._validateRestriction,t);i.on("layeradd",e),i.on("layerremove",e)},_watchMe:function(t){this._featureGroup.on("layeradd layerremove",this._getHandler(this._validateTarget,t))}}),L.FeatureGroup.addInitHook(function(){this.validation||(this.validation=new L.FeatureGroup.Validation(this)),this.fix||(this.fix=new L.FeatureGroup.Fixer(this.validation))})}();