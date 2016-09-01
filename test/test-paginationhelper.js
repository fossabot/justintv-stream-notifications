/*
 * Created by Martin Giger
 * Licensed under MPL 2.0
 */
"use strict";

const requireHelper = require("./require_helper"),
    { PaginationHelper, promisedPaginationHelper } = requireHelper("../lib/pagination-helper");

exports.testPaginationHelper = function(assert, done) {
    const URL = "http://example.com/?offset=";
    let count = 0;
    new PaginationHelper({
        url: URL,
        pageSize: 1,
        request(url, callback, initial) {
            assert.equal(url, URL + count++, "request got the correct URL");
            if(initial) {
                callback(count);
            }
            else {
                return Promise.resolve(count);
            }
        },
        fetchNextPage(data) {
            assert.equal(data, count, "fetchNextPage got the correct data");
            return data < 2;
        },
        onComplete(data) {
            assert.ok(Array.isArray(data), "data is an array");
            assert.equal(data[0], 1, "First data element is has the correct value");
            assert.equal(data[data.length - 1], count, "Last data element has the correct value");
            assert.equal(data.length, count, "data has the correct length");
            done();
        },
        getItems(data) {
            assert.equal(data, count, "getItems got the correct data");
            return data;
        }
    });
};


exports.testPaginationHelperPageNumberGenerator = function(assert, done) {
    const URL = "http://example.com/?offset=",
        hash = "asdf";
    let count = 0;
    new PaginationHelper({
        url: URL,
        pageSize: 1,
        initialPage: "",
        request(url, callback) {
            if(count === 0) {
                assert.equal(url, URL, "Initial URL is correct");
            }
            else {
                assert.equal(url, URL + hash, "URL has hash the second time");
            }
            callback(count);
        },
        getPageNumber(page, pageSize, data) {
            assert.equal(page, "", "Initial page value was passed in correctly");
            assert.equal(pageSize, 1, "Page size was passed in correctly");
            assert.equal(data, count, "Correct data was passed to getPageNumber");
            count++;
            return hash;
        },
        fetchNextPage(data) {
            assert.equal(data, count, "Next page called and data inptu is correct");
            return data < 1;
        },
        onComplete(data) {
            assert.ok(Array.isArray(data), "Data is an array");
            assert.equal(data[0], 0, "data's first item is correct");
            assert.equal(data[data.length - 1], count, "data's last item is correct");
            assert.equal(data.length, 2, "Data has the correct amount of items");
            done();
        },
        getItems(data) {
            assert.equal(data, count, "getItems got the correct data");
            return data;
        }
    });
};

exports.testPromisedPaginationHelper = function* (assert) {
    let count = 0;
    const URL = "http://example.com/?offset=",
        data = yield promisedPaginationHelper({
            url: URL,
            pageSize: 1,
            request(url, callback) {
                assert.equal(url, URL + count++, "request got the correct URL");
                callback(count);
            },
            fetchNextPage(data) {
                assert.equal(data, count, "fetchNextPage got the correct data");
                return data < 1;
            },
            getItems(data) {
                assert.equal(data, count, "getItems got the correct data");
                return data;
            }
        });

    assert.ok(Array.isArray(data), "data is an array");
    assert.equal(data[0], 1, "First data element is has the correct value");
    assert.equal(data[data.length - 1], count, "Last data element has the correct value");
    assert.equal(data.length, count, "data has the correct length");
};

require("sdk/test").run(exports);
