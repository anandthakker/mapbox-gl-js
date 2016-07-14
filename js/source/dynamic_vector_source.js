'use strict';

var webworkify = require('webworkify');
var Bucket = require('../data/bucket');
var VectorTileSource = require('./vector_tile_source');
var vt = require('vector-tile');
var Protobuf = require('pbf');
var normalizeURL = require('../util/mapbox').normalizeTileURL;
var util = require('../util/util');

module.exports = DynamicVectorSource;

function DynamicVectorSource(id, options, dispatcher) {
    VectorTileSource.call(this, id, options, dispatcher);
    this.tileFeatures = {};
}

DynamicVectorSource.workerSourceURL = URL.createObjectURL(
    webworkify(require('./dynamic_vector_worker'), { bare: true })
);

DynamicVectorSource.prototype = util.inherit(VectorTileSource, {
    type: 'vector-dynamic',
    update: function(data) {
        this._dirty = true;
        console.info('Updating with random data; TODO: accept new data here and join against user-configured id property');
        this.fire('change');
    },
    loadTile: function(tile, callback) {
        if (this._dirty && tile.state === 'reloading') {
            return this.updateTile(tile, callback);
        }

        var overscaling = tile.coord.z > this.maxzoom ? Math.pow(2, tile.coord.z - this.maxzoom) : 1;
        var params = {
            type: this.type,
            url: normalizeURL(tile.coord.url(this.tiles, this.maxzoom, this.scheme), this.url),
            uid: tile.uid,
            coord: tile.coord,
            zoom: tile.coord.z,
            tileSize: this.tileSize * overscaling,
            source: this.id,
            overscaling: overscaling,
            angle: this.map.transform.angle,
            pitch: this.map.transform.pitch,
            showCollisionBoxes: this.map.showCollisionBoxes
        };

        if (tile.workerID) {
            params.rawTileData = tile.rawTileData;
            this.dispatcher.send('reload tile', params, done.bind(this), tile.workerID);
        } else {
            tile.workerID = this.dispatcher.send('load tile', params, done.bind(this));
        }

        function done(err, data) {
            if (tile.aborted)
                return;

            if (err) {
                return callback(err);
            }

            tile.loadVectorData(data, this.map.style);

            var layers = this.tileFeatures[tile.uid] = {};
            this.vtLayers = new vt.VectorTile(new Protobuf(new Uint8Array(tile.rawTileData))).layers;
            for (var id in this.vtLayers) {
                var features = layers[id] = [];
                var layer = this.vtLayers[id];
                for (var i = 0; i < layer.length; i++) {
                    features.push(layer.feature(i));
                }
            }

            if (tile.redoWhenDone) {
                tile.redoWhenDone = false;
                tile.redoPlacement(this);
            }

            callback(null);
        }
    },

    getTilePropertyData: function (tile) {
        return this.tileFeatures[tile.uid];
    },

    updateTile: function(tile, callback) {
        console.log('update tile', tile)
        var prevData = this.getTilePropertyData(tile);

        // dummy data; TODO: make it real
        var newData = {};
        for (var layer in prevData) {
            newData[layer] = [];
            for (var i = 0; i < prevData[layer].length; i++) {
                newData[layer].push({ foo: Math.random() * 100 });
            }
        }

        var params = {
            uid: tile.uid,
            source: this.id,
            data: newData
        };
        if (tile.workerID) {
            this.dispatcher.send(this.type + '.updateTile', params, done.bind(this), tile.workerID);
        } else {
            // load + update
        }

        function done (err, data) {
            for (var i = 0; i < data.buckets.length; i++) {
                var updatedBucket = data.buckets[i];
                var existingBucket = tile.buckets[updatedBucket.layerId];
                existingBucket.updatePaintBufferData(updatedBucket.arrays);
            }
            callback(err);
        }
    }
});

