/**
 * @todo implement favorites stuff
 * @author Martin Giger
 * @license MPL-2.0
 * @module providers/livestream
 */

"use strict";
import { emit } from "sdk/event/core";
import { Channel } from '../channel/core';
import GenericProvider from "./generic-provider";

var type = "livestream",
    archiveURL = "/videos",
    baseURL = ".api.channel.livestream.com/2.0/";

function getChannelAPIUrl(channellogin) {
    return "http://x"+channellogin.replace(/_/g,"-")+"x"+baseURL;
}

class Livestream extends GenericProvider {
    constructor(type) {
        super(type);
        this.authURL = [
            "http://new.livestream.com",
            "https://secure.livestream.com"
        ];
    }
    async getChannelDetails(username) {
        const ch = new Channel(username.toLowerCase(), this._type);

        const [ data, response ] = await Promise.all([
            this._qs.queueRequest(getChannelAPIUrl(ch.login)+"info.json"),
            this._qs.queueRequest(getChannelAPIUrl(ch.login)+"latestclips.json?maxresults=1")
        ]);

        if(data.json && data.json.channel) {
            console.info("Creating livestream channel");
            ch.uname = data.json.channel.title;
            ch.title = "";
            ch.url.push(data.json.channel.link);
            ch.image = { "100": data.json.channel.image.url };
            ch.category = data.json.channel.category;
            ch.live.setLive(data.json.channel.isLive);
            ch.viewers = data.json.channel.currentViewerCount;
            ch.archiveUrl = data.json.channel.link;
            ch.chatUrl = data.json.channel.link+"/chat";

            if(response.json && response.json.channel.item && response.json.channel.item.length > 0) {
                ch.thumbnail = response.json.channel.item[0].thumbnail["@url"];
            }

            return ch;
        }
        else {
            throw "Error getting details for the Livestream channel " + username;
        }
    }
    updateRequest(channels) {
        var urls = channels.map((channel) => { return getChannelAPIUrl(channel.login)+"livestatus.json"; });
        this._qs.queueUpdateRequest(urls, this._qs.HIGH_PRIORITY, (data, url) => {
            if(data.json && data.json.channel) {
                var requestLogin = url.match(/http:\/\/x([a-zA-Z0-9-]+)x\./)[1].replace("-","_"),
                    channel = channels.find((channel) => { return requestLogin == channel.login;});
                channel.live.setLive(data.json.channel.isLive);
                channel.viewers = data.json.channel.currentViewerCount;
                this._qs.queueRequest(getChannelAPIUrl(channel.login)+"latestclips.json?maxresults=1").then((data) => {
                    if(data.json && "channel" in data.json && data.json.channel.item.length) {
                        channel.thumbnail = data.json.channel.item[0].thumbnail["@url"];
                    }
                    emit(this, "updatedchannels", channel);
                });
            }
        });
    }
}

export default new Livestream(type);
