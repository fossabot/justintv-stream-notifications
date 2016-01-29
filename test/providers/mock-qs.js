/**
 * Mock QueueServices for usage in tests.
 * @author Martin Giger
 * @license MPL-2.0
 * @module test/providers/mock-qs
 */

const { defer } = require("sdk/core/promise");
const qs = require("sdk/querystring");
const mockAPIEnpoints = require("./mockAPI.json");

const getRequest = (type, url)  => {
    if(type === "youtube") {
        const u = url.split("?");
        u[1] = qs.parse(u[1]);
        delete u[1].part;
        if("fields" in u[1])
            delete u[1].fields;
        if("hl" in u[1])
            delete u[1].hl;
        if("relevanceLanguage" in u[1])
            delete u[1].relevanceLanguage;
        delete u[1].key;

        u[1] = qs.stringify(u[1]);

        url = u.join("?");
    }
    console.log("Getting", url);
    if(type in mockAPIEnpoints && url in mockAPIEnpoints[type]) {
        return {
            status: 200,
            json: mockAPIEnpoints[type][url],
            text: typeof mockAPIEnpoints[type][url] === "string" ?
                mockAPIEnpoints[type][url] :
                JSON.stringify(mockAPIEnpoints[type][url])
        };
    }
    else {
        return {
            status: 404
        };
    }
};

const getMockAPIQS = (originalQS, type) => {
    return {
        queueRequest(url) {
            return Promise.resolve(getRequest(type, url));
        },
        unqueueUpdateRequest(priority) {},
        queueUpdateRequest(urls, priority, callback) {
            urls.forEach((url) => {
                callback(getRequest(type, url), url);
            });
        },
        HIGH_PRIORITY: originalQS.HIGH_PRIORITY,
        LOW_PRIORITY: originalQS.LOW_PRIORITY
    };
};
exports.getMockAPIQS = getMockAPIQS;

const getMockQS = (originalQS, ignoreQR = false) => {
    let { promise, resolve, reject } = defer();
    return {
        queueRequest(url) {
            if(!ignoreQR)
                resolve(url);
            return Promise.resolve({});
        },
        unqueueUpdateRequest(priority) {
            resolve(priority);
        },
        queueUpdateRequest(urls, priority, callback) {
            resolve({
                urls,
                priority,
                callback
            });
        },
        promise,
        HIGH_PRIORITY: originalQS.HIGH_PRIORITY,
        LOW_PRIORITY: originalQS.LOW_PRIORITY
    };
};
exports.getMockQS = getMockQS;

const endpoints = Object.keys(mockAPIEnpoints);
exports.apiEndpoints = endpoints;

/**
 * These are either defunct providers, or providers that don't use polling
 * (or beam, which I should switch to sockets)
 * @type array
 */
const IGNORE_QSUPDATE_PROVIDERS = [ "picarto", "beam" ];
exports.IGNORE_QSUPDATE_PROVIDERS = IGNORE_QSUPDATE_PROVIDERS;
