'use strict';
const helpers = require('../helpers');
const consts = require('../constants');
const config = require('config');
const Client = require('../client/client');

const OPTIONS_PATH = "Mirror.options";

const PROCESS_DELAY_MS = 2000;
const CONNECT_IDLE_TIMEOUT_MS = 10000;

class TransactionMirror {

    /**
     *
     * @param {Object} connectOptions
     * @param {CacheBase} cache
     */
    constructor(connectOptions, cache) {
        this._connectOptions = connectOptions;
        this._cache = cache;
        this._queue = [];
        this._processing = false;
        this._queueProcessDelay = TransactionMirror.options.queueProcessDelay || PROCESS_DELAY_MS;

        const address = connectOptions.address;
        const port = connectOptions.port;
        const idleTimeout = TransactionMirror.options.idleTimeout || CONNECT_IDLE_TIMEOUT_MS;
        this._client = new Client(address, port, {idleTimeout: idleTimeout});
    }

    static get options() {
        return config.get(OPTIONS_PATH);
    }

    get address() {
        return this._connectOptions.host;
    }

    _connect() {
        return this._client.connect();
    }

    async _processQueue() {
        const self = this;
        let client;

        const send = async (item) => {
            await client.beginTransaction(item.guid, item.hash);

            for (const type of item.types) {
                const info = await self._cache.getFileInfo(type, item.guid, item.hash);
                const stream = await self._cache.getFileStream(type, item.guid, item.hash);
                await client.putFile(type, item.guid, item.hash, stream, info.size);
            }

            await client.endTransaction();
        };

        try {
            client = await self._connect();

            while (self._queue.length > 0) {
                await send(self._queue.shift());
            }
        }
        catch (err) {
            helpers.log(consts.LOG_ERR, `[TransactionMirror] ${err}`);
        }

        self._processing = false;
    }

    /**
     *
     * @param {PutTransaction} trx
     */
    queueTransaction(trx) {
        if(trx.manifest.length === 0) return;

        this._queue.push({
            guid: trx.guid,
            hash: trx.hash,
            types: trx.manifest
        });

        if(!this._processing) {
            this._processing = true;
            setTimeout(this._processQueue.bind(this), this._queueProcessDelay);
        }
    }
}

module.exports = TransactionMirror;