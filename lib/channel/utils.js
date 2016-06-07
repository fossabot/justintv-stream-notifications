/**
 * @author Martin Giger
 * @license MPL-2.0
 * @module channel/utils
 */

var tabs = require("sdk/tabs");
const livestreamer = require("../livestreamer");
const { when } = require("sdk/event/utils");
const { LiveState } = require("./live-state");

/**
 * Opens the given channel in a new tab, unless there is already a tab open for
 * it. If Livestreamer is enabled and the channel is live, it is opened with
 * Livestreamer instead.
 * @argument {module:channel/core.Channel} channel - The channel to open.
 * @argument {string} [what] - Specifies the action to take. "chat" opens the
 * channel's chat, "archive" opens the archive and "livestreamer" always
 * launches livestreamer.
 * @return {Promise.<number?>} A promise that resolves whenever the channel
 *         should be visible for the user (for livestreamer it resolves after it
 *         was closed).
 */
exports.selectOrOpenTab = function selectOrOpenTab(channel, what) {
    let toCheck = [];

    if(what === "chat")
        toCheck.push(channel.chatUrl);
    else if(what === "archive" || !channel.live.isLive())
        toCheck.push(channel.archiveUrl);
    else {
        toCheck = channel.url;

        if(what === "livestreamer" || livestreamer.default) {
            if(channel.live.state > LiveState.LIVE && channel.live.alternateURL !== "")
                toCheck = [channel.live.alternateURL];
            return livestreamer.launch(toCheck[0]);
        }
    }

    const checkUrl = (ti, url) => url === tabs[ti].url;
    for(let ti in tabs) {
        if(toCheck.some(checkUrl.bind(null, ti)) {
            const p = when(tabs[ti], "activate");
            tabs[ti].activate();
            return p;
        }
    }
    // There's no tab open for the channel
    const p = when(tabs, "ready");
    tabs.open({url: toCheck[0]});
    return p;
};
