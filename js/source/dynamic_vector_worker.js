'use strict';
var VectorTileWorkerSource = require('./vector_tile_worker_source');
var util = require('../util/util');

module.exports = function (self) {
    self.registerWorkerSource('vector-dynamic', DynamicVectorWorker);
};

function DynamicVectorWorker (actor, styleLayers, loadVectorData) {
    VectorTileWorkerSource.call(this, actor, styleLayers, loadVectorData);
}

DynamicVectorWorker.prototype = util.inherit(VectorTileWorkerSource, {
    updateTile: function (params, callback) {
        var source = params.source;
        var uid = params.uid;
        if (!this.loaded[source][uid]) {
            return callback();
        }

        var layerFamilies = this.styleLayers.getLayerFamilies();
        var tile = this.loaded[source][uid];
        tile.updateProperties(params.data, layerFamilies, this.actor, callback);
    }
});
