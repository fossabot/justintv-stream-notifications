/*
 * Created by Martin Giger
 * Licensed under MPL 2.0
 */
"use strict";

const requireHelper = require("./require_helper"),
    QueueService = requireHelper("../lib/queue/service"),
    { setTimeout } = require("sdk/timers"),
    { prefs } = require("sdk/simple-prefs");

exports.testGetService = function(assert) {
    const service = QueueService.getServiceForProvider("test");
    assert.equal(service, QueueService.getServiceForProvider("test"));
    assert.notEqual(service, QueueService.getServiceForProvider("equal"));
};

exports.testIntervalPauseResume = function(assert, done) {
    const service = QueueService.getServiceForProvider("test");
    let count = 0,
        paused = false;

    service.queueUpdateRequest([ "http://localhost" ], service.HIGH_PRIORITY, () => {
        if(count === 0) {
            ++count;
            QueueService.pause();
            paused = true;
            setTimeout(() => {
                paused = false;
                QueueService.resume();
            }, 500);
        }
        else {
            assert.equal(count, 1);
            assert.ok(!paused);
            QueueService.updateOptions(0);
            service.unqueueUpdateRequest(service.HIGH_PRIORITY);
            done();
        }
    });
    QueueService.setOptions({
        interval: 700,
        amount: 1,
        maxSize: 1
    });
};

// QueueService Object Tests

exports.testUpdateRequestRequeue = function(assert, done) {
    const service = QueueService.getServiceForProvider("test");
    let count = 0;

    service.queueUpdateRequest([ "http://localhost" ], service.HIGH_PRIORITY, () => {
        assert.equal(count, 2);
        service.unqueueUpdateRequest();
        QueueService.updateOptions(0);
        done();
    }, {}, () => ++count < 2);
    QueueService.setOptions({
        interval: 700,
        amount: 1,
        maxSize: 1
    });
};

exports.testRequeue = function(assert, done) {
    const service = QueueService.getServiceForProvider("test");
    let count = 0;

    service.queueRequest("http://localhost", {}, () => ++count <= prefs.queueservice_maxRetries + 1)
        .then((d) => assert.fail(d))
        .catch(() => {
            assert.equal(count, prefs.queueservice_maxRetries + 1);
            QueueService.updateOptions(0);
            done();
        });
    QueueService.setOptions({
        interval: 70,
        amount: 1,
        maxSize: 1
    });
};

exports.testQueueService = function(assert) {
    const service = QueueService.getServiceForProvider("test");
    assert.ok(Array.isArray(service.highPriorityRequestIds));
    assert.ok(Array.isArray(service.lowPriorityRequestIds));
    assert.equal(service.highPriorityRequestIds.length, 0);
    assert.equal(service.lowPriorityRequestIds.length, 0);
    assert.ok(service.HIGH_PRIORITY, "QueueService instance exposes HIGH_PRIORITY constant");
    assert.ok(service.LOW_PRIORITY, "QueueService isntance exposes LOW_PRIORITY constant");
};

exports.testQueueRequest = function* (assert) {
    const service = QueueService.getServiceForProvider("test");
    yield service.queueRequest("http://locahost", {}, () => {
        assert.pass("Requeueing function called");
        return false;
    });
};

exports.testUpdateRequest = function(assert) {
    const service = QueueService.getServiceForProvider("test");
    service.queueUpdateRequest([ "http://localhost" ],
        service.HIGH_PRIORITY,
        () => {
            console.log("done");
        },
        {},
        () => {
            console.log("requeue?");
            return false;
        }
    );
    assert.equal(service.getRequestProperty(service.HIGH_PRIORITY).length, 1);
    assert.equal(service.getRequestProperty(service.HIGH_PRIORITY), service.highPriorityRequestIds);
    assert.equal(service.getRequestProperty(service.LOW_PRIORITY).length, 0);
    const id = service.highPriorityRequestIds[0];
    // Replace them
    service.queueUpdateRequest([ "http://localhost", "https://localhost" ],
        service.HIGH_PRIORITY,
        () => {
            console.log("done");
        },
        {},
        () => {
            console.log("requeue?");
            return false;
        }
    );
    assert.equal(service.getRequestProperty(service.HIGH_PRIORITY).length, 2);
    assert.ok(service.getRequestProperty(service.HIGH_PRIORITY).every((i) => i != id));

    // remove the requests
    service.unqueueUpdateRequest(service.LOW_PRIORITY);
    assert.equal(service.getRequestProperty(service.HIGH_PRIORITY).length, 2);
    assert.equal(service.getRequestProperty(service.LOW_PRIORITY).length, 0);

    service.unqueueUpdateRequest();
    assert.equal(service.getRequestProperty(service.HIGH_PRIORITY).length, 0);
};

// QueueService Events test

exports.testQueueEvents = function(assert, done) {
    let count = 0;
    const service = QueueService.getServiceForProvider("test"),
        listener = function() {
            if(++count == 4) {
                assert.pass("All " + count + " listeners called");
                QueueService.removeListeners({
                    containsPriorized: listener,
                    priorizedLoaded: listener
                });
                done();
            }
            else {
                assert.pass("Listener number " + count + " called");
            }
            // for requeue.
            return false;
        };
    QueueService.addListeners({
        containsPriorized: listener,
        priorizedLoaded: listener
    });
    service.queueRequest("http://locahost", {}, listener).then(listener);
};

exports.testQueuePauseResume = function(assert, done) {
    let count = 0;
    const listener1 = () => {
        if(++count == 2) {
            QueueService.removeListeners({
                paused: listener1,
                resumed: listener1
            });
            QueueService.pause();
            done();
        }
        else if(count == 1) {
            QueueService.resume();
        }
        else {
            assert.fail("Should not have been called after listener is removed");
        }
    };
    QueueService.setOptions({
        interval: 25,
        amount: 0.5,
        maxSize: 2
    });
    QueueService.addListeners({
        paused: listener1,
        resumed: listener1
    });
    QueueService.pause();
};

require("sdk/test").run(exports);
