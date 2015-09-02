/*
 * Created by Martin Giger
 * Licensed under MPL 2.0
 *
 * Hitbox provider
 */

"use strict";
const { Class: newClass } = require("sdk/core/heritage");
const { emit } = require("sdk/event/core");
const { all } = require("sdk/core/promise");
var { Channel, User } = require('../channeluser');
const { GenericProvider } = require("./generic-provider");
const { promisedPaginationHelper } = require("../pagination-helper");
let { Task: { async } } = require("resource://gre/modules/Task.jsm");

var type = "hitbox",
    archiveURL = "/videos",
    chatURL = "http://hitbox.tv/embedchat/",
    headers = {},
    baseURL = "http://api.hitbox.tv",
    cdnURL = "http://edge.sf.hitbox.tv";

function requeue(data) {
    return data.status > 499;
}

function getChannelFromJson(json) {
    var cho = new Channel();
    cho.login = json.channel.user_name;
    cho.uname = json.media_display_name;
    cho.url.push(json.channel.channel_link);
    cho.archiveUrl = json.channel.channel_link + archiveURL;
    cho.chatUrl = chatURL + json.channel.user_name;
    cho.type = type;
    cho.image = { "200": cdnURL+json.channel.user_logo,
                  "50": cdnURL+json.channel.user_logo_small };
    cho.title = json.media_status;
    cho.category = json.category_name;
    cho.viewers = json.media_views;
    cho.thumbnail = cdnURL+json.media_thumbnail;
    cho.live = json.media_is_live != "0";
    return cho;
}

const Hitbox = newClass({
    extends: GenericProvider,
    authURL: ["http://www.hitbox.tv"],
    _supportsFavorites: true,
    _supportsCredentials: true,
    _getChannels: function(channels) {
        return all(channels.map((channel) => {
            return this._qs.queueRequest(baseURL+'/media/live/'+channel, headers, requeue).then((data) => {
                if(data.status == 200 && data.json && "livestream" in data.json)
                    return getChannelFromJson(data.json.livestream[0]);
                else
                    return null;
            });
        })).then((channels) => channels.filter((channel) => channel !== null));
    },
    getUserFavorites: async(function*(username) {
        let [follows, user] = yield all([
            promisedPaginationHelper({
                url: baseURL+'/following/user?user_name='+username+'&limit=100&offset=',
                pageSize: 100,
                request: (url, callback) => {
                    this._qs.queueRequest(url, headers, requeue).then(callback);
                },
                fetchNextPage: function(data, pageSize) {
                    return data.json && "following" in data.json && data.json.following.length == pageSize;
                },
                getItems: function(data) {
                    if(data.json && "following" in data.json)
                        return data.json.following;
                    else
                        return [];
                }
            }),
            this._qs.queueRequest(baseURL+'/user/'+username, headers, requeue)
        ]);

        if(user.status == 200 && user.json) {
            let usr = new User();
            usr.login = user.json.user_name;
            usr.uname = user.json.user_name;
            usr.image = {
                "200": cdnURL + user.json.user_logo,
                "50": cdnURL + user.json.user_logo_small
            };
            usr.type = this._type;
            usr.favorites = follows.map((follow) => follow.user_name);

            let channels = yield this._getChannels(usr.favorites);
            console.log(usr, channels);
            return [ usr, channels ];
        }
        else {
            throw "Error getting info for Hitbox user "+username;
        }
    }),
    getChannelDetails: function(channelname) {
        return this._qs.queueRequest(baseURL+'/media/live/'+channelname, headers, requeue).then(function(data) {
            if(data.status == 200 && data.json && data.json.livestream )
                return getChannelFromJson(data.json.livestream[0]);
            else
                throw "Error getting details for Hitbox channel " + channelname;
        });
    },
    updateFavsRequest: function(users) {
        let urls = users.map((user) => baseURL + '/user/' + user.login);
        this._qs.queueUpdateRequest(urls, headers, this._qs.LOW_PRIORITY, requeue, (data) => {
            if(data.status == 200 && data.json) {
                let user = users.find((user) => user.login == data.json.user_name);
                user.image = {
                    "200": cdnURL + data.json.user_logo,
                    "50": cdnURL + data.json.user_logo_small
                };

                promisedPaginationHelper({
                    url: baseURL+'/following/user?user_name='+user.login+'&limit=100&offset=',
                pageSize: 100,
                    request: (url, callback) => {
                        this._qs.queueRequest(url, headers, requeue).then(callback);
                    },
                    fetchNextPage: function(data, pageSize) {
                        return data.json && "following" in data.json && data.json.following.length == pageSize;
                    },
                    getItems: function(data) {
                        if(data.json && "following" in data.json)
                            return data.json.following;
                        else
                            return [];
                    }
                }).then((follows) => {
                    let newChannels = follows.filter((follow) => user.favorites.every((fav) => fav != follow.user_name));
                    user.favorites = follows.map((follow) => follow.user_name);
                    emit(this, "updateduser", user);
                    return this._getChannels(user.favorites);
                }).then((channels) => {
                    emit(this, "newchannels", channels);
                });
            }
        });
    },
    updateRequest: function(channels) {
        var urls = channels.map((channel) => { return baseURL+'/media/live/'+channel.login; });
        this._qs.queueUpdateRequest(urls, headers, this._qs.HIGH_PRIORITY, requeue, (data) => {
            if(data.status == 200 && data.json && data.json.livestream)
                emit(this, "updatedchannels", getChannelFromJson(data.json.livestream[0]));
        });
    }
});

module.exports = new Hitbox(type);

