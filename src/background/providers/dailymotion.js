/**
 * Dailymotion provider.
 *
 * @author Martin Giger
 * @license MPL-2.0
 * @module providers/dailymotion
 */
import { emit } from "../../utils";
import GenericProvider from "./generic-provider";
import { Channel, User } from "../channel/core";
import { promisedPaginationHelper, PaginationHelper } from "../pagination-helper";
import qs from "../querystring";

const type = "dailymotion",
    baseUrl = "https://api.dailymotion.com/",
    AVATAR_SIZES = [ 25, 60, 80, 120, 190, 240, 360, 480, 720 ],
    USER_FIELDS = "screenname,url,id," + AVATAR_SIZES.map((s) => "avatar_" + s + "_url").join(","),
    getChannelFromJSON = (json, doUser = false) => {
        let ch;
        if(doUser) {
            ch = new User(json.id, type);
        }
        else {
            ch = new Channel(json.id, type);
            ch.url.push(json.url);
            ch.archiveUrl = json.url;
        }
        ch.uname = json.screenname;
        ch.image = AVATAR_SIZES.reduce((p, c) => {
            p[c] = json['avatar_' + c + '_url'];
            return p;
        }, {});

        return ch;
    };

class Dailymotion extends GenericProvider {
    _supportsFavorites = true;
    _supportsFeatured = true;

    _getChannelByID(id, doUser = false) {
        return this._qs.queueRequest(baseUrl + "user/" + id + "?" + qs.stringify({
            fields: USER_FIELDS
        })).then((result) => {
            if(result.ok && result.parsedJSON) {
                if("list" in result.parsedJSON) {
                    return getChannelFromJSON(result.parsedJSON.list[0], doUser);
                }
                else {
                    return getChannelFromJSON(result.parsedJSON, doUser);
                }
            }
            else {
                throw new Error(`Could not get details for ${id} on ${this._type}`);
            }
        });
    }
    _getStreamDetailsForChannel(channel) {
        return this._qs.queueRequest(baseUrl + "user/" + channel.login + "/videos?" + qs.stringify({
            id: channel.login,
            fields: "chat_embed_url,title,url,channel.name,onair,thumbnail_240_url",
            sort: "live-audience",
            limit: 1
        })).then((response) => {
            if(response.ok && response.parsedJSON) {
                if(response.parsedJSON.list.length) {
                    const item = response.parsedJSON.list[0];
                    channel.chatUrl = item.chat_embed_url;
                    channel.thumbnail = item.thumbnail_url;
                    channel.url = [ item.url ];
                    channel.category = item['channel.name'];
                    channel.live.setLive(item.onair);
                    channel.title = item.title;
                }
                else {
                    channel.live.setLive(false);
                }
                return channel;
            }
            else {
                throw new Error(`Could not update ${channel.login} on ${this._type}`);
            }
        });
    }
    _getFavs(userId) {
        return promisedPaginationHelper({
            url: baseUrl + "user/" + userId + "/following?" + qs.stringify({
                fields: USER_FIELDS,
                limit: 100
            }) + "&page=",
            pageSize: 1,
            initialPage: 1,
            request: (url) => this._qs.queueRequest(url),
            fetchNextPage(data) {
                return data.json && data.parsedJSON.has_more;
            },
            getItems(data) {
                if(data.ok && data.parsedJSON && data.parsedJSON.list) {
                    return data.parsedJSON.list.map(getChannelFromJSON);
                }
                else {
                    return [];
                }
            }
        });
    }
    getUserFavorites(username) {
        return this.getChannelDetails(username, true).then((user) => {
            return this._getFavs(user.login).then((channels) => {
                user.favorites = channels.map((ch) => ch.login);

                return [ user, channels ];
            });
        });
    }
    getChannelDetails(username, doUser = false) {
        return this._qs.queueRequest(baseUrl + "users?" + qs.stringify({
            usernames: username,
            fields: USER_FIELDS
        }), {}).then((result) => {
            if(result.ok && result.parsedJSON && result.parsedJSON.list && result.parsedJSON.list.length) {
                return getChannelFromJSON(result.parsedJSON.list[0], doUser);
            }
            else {
                return this._getChannelByID(username, doUser);
            }
        });
    }
    updateFavsRequest(users) {
        new PaginationHelper({
            url: baseUrl + "users?" + qs.stringify({
                ids: users.map((ch) => ch.login).join(","),
                fields: USER_FIELDS,
                limit: 100
            }) + "&page=",
            initialPage: 1,
            pageSize: 1,
            request: (url, callback, initial) => {
                if(initial) {
                    this._qs.queueUpdateRequest([ url ], this._qs.LOW_PRIORITY, callback);
                }
                else {
                    return this._qs.queueRequest(url);
                }
            },
            fetchNextPage(data) {
                return data.parsedJSON && data.parsedJSON.has_more;
            },
            getItems(data) {
                if(data.ok && data.parsedJSON && data.parsedJSON.list) {
                    return data.parsedJSON.list;
                }
                else {
                    return [];
                }
            },
            onComplete: (data) => {
                data = data.map((d) => getChannelFromJSON(d, true));

                data.forEach((user) => {
                    const oldUser = users.find((u) => u.login == user.login);
                    this._getFavs(user.login).then((channels) => {
                        user.favorites = channels.map((ch) => ch.login);
                        emit(this, "updateduser", user);

                        channels = channels.filter((ch) => !oldUser.favorites.some((c) => c == ch.login));
                        emit(this, "newchannels", channels);

                        oldUser.favorites = user.favorites;
                    });
                });
            }
        });
    }
    updateRequest(channels) {
        new PaginationHelper({
            url: baseUrl + "users?" + qs.stringify({
                ids: channels.map((ch) => ch.login).join(","),
                fields: USER_FIELDS,
                limit: 100
            }) + "&page=",
            initialPage: 1,
            pageSize: 1,
            request: (url, callback, initial) => {
                if(initial) {
                    this._qs.queueUpdateRequest([ url ], this._qs.HIGH_PRIORITY, callback);
                }
                else {
                    return this._qs.queueRequest(url);
                }
            },
            fetchNextPage(data) {
                return data.parsedJSON && data.parsedJSON.has_more;
            },
            getItems(data) {
                if(data.ok && data.parsedJSON && data.parsedJSON.list) {
                    return data.parsedJSON.list;
                }
                else {
                    return [];
                }
            },
            onComplete: (data) => {
                data = data.map((v) => getChannelFromJSON(v));

                Promise.all(data.map((ch) => this._getStreamDetailsForChannel(ch)))
                    .then((channels) => emit(this, "updatedchannels", channels));
            }
        });
    }
    updateChannel(username) {
        return this.getChannelDetails(username).then((channel) => {
            return this._getStreamDetailsForChannel(channel);
        });
    }
    async updateChannels(channels) {
        const response = await promisedPaginationHelper({
            url: baseUrl + "users?" + qs.stringify({
                ids: channels.map((ch) => ch.login).join(","),
                fields: USER_FIELDS,
                limit: 100
            }) + "&page=",
            pageSize: 1,
            initialPage: 1,
            request: (url) => this._qs.queueRequest(url),
            fetchNextPage(data) {
                return data.parsedJSON && data.parsedJSON.has_more;
            },
            getItems(data) {
                if(data.parsedJSON && data.parsedJSON.list) {
                    return data.parsedJSON.list;
                }
                else {
                    return [];
                }
            }
        });

        return Promise.all(response.map((ch) => this._getStreamDetailsForChannel(getChannelFromJSON(ch))));
    }
    search(query) {
        const q = {
            fields: "owner.id,owner.screenname,owner.url,chat_embed_url,title,url,channel.name,thumbnail_240_url," + AVATAR_SIZES.map((s) => "owner.avatar_" + s + "_url").join(","),
            sort: "live-audience",
            "live_onair": 1
        };
        if(query) {
            q.search = query;
        }
        return this._qs.queueRequest(baseUrl + "videos?" + qs.stringify(q)).then((data) => {
            if(data.ok && data.parsedJSON && data.parsedJSON.list && data.parsedJSON.list.length) {
                return data.parsedJSON.list.map((json) => {
                    const ch = new Channel(json['owner.id'], this._type);
                    ch.live.setLive(true);
                    ch.title = json.title;
                    ch.uname = json['owner.screenname'];
                    ch.url.push(json.url, json['owner.url']);
                    ch.archiveUrl = json['owner.url'];
                    ch.chatUrl = json.chat_embed_url;
                    ch.category = json['channel.name'];
                    ch.thumbnail = json.thumbnail_240_url;
                    ch.image = AVATAR_SIZES.reduce((p, s) => {
                        p[s] = json['owner.avatar_' + s + '_url'];
                        return p;
                    }, {});

                    return ch;
                });
            }
            else {
                throw new Error("Didn't find any search results channels with " + query + " for " + this._type);
            }
        });
    }
}

export default Object.freeze(new Dailymotion(type));