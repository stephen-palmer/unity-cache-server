const cluster = require('cluster');
const consts = require("./constants");
const dns = require('dns');
const path = require('path');
const fs = require('fs-extra');

let logLevel = consts.LOG_TEST;

reverseByte = (b) => ((b & 0x0F) << 4) | ((b >> 4) & 0x0F);

/**
 * Reverses the hex digits for each byte in a GUID before converting to a string, the same way Unity serializes GUIDs to strings.
 * For example Buffer[10ab7cac5ef26c6e7ec6060be64419fc] => "01bac7cae52fc6e6e76c60b06e4491cf"
 * @param {Buffer} guidBuffer
 * @returns {String}
 */
exports.GUIDBufferToString = function(guidBuffer) {
    if(!guidBuffer || guidBuffer.length !== 16) throw new Error("Invalid GUID input");
    return guidBuffer.reduce((result, curVal) => result + reverseByte(curVal).toString(16).padStart(2, '0'), '');
};

/**
 *
 * @param {String} guidString
 * @returns {Buffer}
 * @constructor
 */
exports.GUIDStringToBuffer = function(guidString) {
    if(typeof(guidString) !== 'string' || guidString.length !== 32) throw new Error("Invalid GUID String input");
    const buf = Buffer.from(guidString, 'hex');
    buf.forEach((val, i) => buf[i] = reverseByte(buf[i]));
    return buf;
};

/**
 * @returns {string}
 */
function zeroPad(len, str) {
    for (let i = len - str.length; i > 0; i--) {
        str = '0' + str;
    }

    return str;
}

/**
 * @param {Number} input
 * @return {string}
 */
exports.encodeInt32 = function(input) {
    return zeroPad(consts.UINT32_SIZE, input.toString(16));
};

/**
 * @param {Number} input
 * @return {string}
 */
exports.encodeInt64 = function(input) {
    return zeroPad(consts.UINT64_SIZE, input.toString(16));
};

/**
 *
 * @param {Buffer} input
 * @returns {number}
 */
exports.readUInt32 = function(input) {
    return parseInt(input.toString('ascii', 0, consts.UINT32_SIZE), 16);
};

/**
 * @param {Buffer} input
 * @return {number}
 */
exports.readUInt64 = function(input) {
    return parseInt(input.toString('ascii', 0, consts.UINT64_SIZE), 16);
};

/**
 *
 * @param obj
 * @returns {boolean}
 */
exports.isBuffer = function(obj) {
    return !(obj === null) && !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
};

/**
 *
 * @param address
 * @param defaultPort
 * @returns {Promise<any>}
 */
exports.parseAndValidateAddressString = function(address, defaultPort) {
    // eslint-disable-next-line prefer-const
    let [host, port] = address.split(':');

    port = parseInt(port);
    if(!port) port = defaultPort;

    return new Promise((resolve, reject) => {
        dns.lookup(host, {family: 4, hints: dns.ADDRCONFIG}, (err, address) => {
            if(err) return reject(err);
            resolve({ host: address, port: port });
        });
    });
};

async function readDir(dir, fileCallback) {
    if(typeof(fileCallback) !== 'function')
        return;

    const files = await fs.readdir(dir);

    for(const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.lstat(filePath);
        if (stat.isSymbolicLink()) continue;

        if (stat.isDirectory()) {
            await readDir(filePath, fileCallback);
        }
        else {
            fileCallback({path: filePath, stats: stat});
        }
    }
}

exports.readDir = readDir;


/**
 *
 * @param {Number} lvl
 * @param {String} msg
 */
exports.log = exports.defaultLogger = (lvl, msg) => {
    if (lvl <= logLevel)
        console.log(`${msg}`);
};

/**
 *
 * @param {Number} lvl
 * @param {String} msg
 */
exports.defaultClusterLogger = (lvl, msg) => {
    if (lvl <= logLevel) {
        const prefix = cluster.isMaster ? "[Cluster:M] " : `[Cluster:${cluster.worker.id}] `;
        console.log(`${prefix}${msg}`);
    }
};

/**
 *
 * @param {Function} logger
 */
exports.setLogger = function(logger) {
    if(logger)
        exports.log = logger;
};

/**
 *
 * @param {Number} lvl
 */
exports.setLogLevel = function(lvl) {
   logLevel = Math.min(consts.LOG_DBG, Math.max(consts.LOG_NONE, lvl));
};

exports.getLogLevel = () => logLevel;

exports.initConfigDir = (rootDir) => {
    const configDir = process.env['NODE_CONFIG_DIR'];
    if(!configDir) {
        process.env['NODE_CONFIG_DIR'] = path.resolve(rootDir, "config/");
    }
};

exports.resolveCacheModule = (module, rootPath) => {

    // Try absolute path first
    let modulePath = path.resolve(module);

    try {
        return require(modulePath);
    }
    catch(err) {}

    // Try relative to module root
    modulePath = path.resolve(rootPath, module);

    try {
        return require(modulePath);
    }
    catch(err) {}

    // Finally, try inside of the module root lib/cache folder
    modulePath = path.resolve(rootPath, 'lib/cache', module);
    return require(modulePath);
};
