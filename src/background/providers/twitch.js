/**
 * Twitch Provider.
 * @author Martin Giger
 * @license MPL-2.0
 * @module providers/twitch
 * @todo properly wait for clientID
 * @todo option to not mark premieres as rebroadcast
 */
import prefs from "../../preferences.js";
import querystring from "../querystring.js";
import LiveState from "../channel/live-state.js";
import {
    Channel, User
} from '../channel/core.js';
import { promisedPaginationHelper } from '../pagination-helper.js';
import GenericProvider from "./generic-provider.js";
import { not } from '../logic.js';
import { filterExistingFavs } from '../channel/utils.js';

const type = "twitch",
    archiveURL = "/videos/all",
    chatURL = "/chat",
    baseURL = 'https://api.twitch.tv/kraken',
    headers = {
        'Client-ID': '',
        'Accept': 'application/vnd.twitchtv.v3+json'
    },
    defaultAvatar = "https://static-cdn.jtvnw.net/jtv_user_pictures/xarth/404_user_300x300.png",
    itemsPerPage = 100,
    idOfChannel = new Map(),
    SIZES = [
        '50',
        '70',
        '150',
        '300'
    ],
    urlForSize = (imgURL, size) => imgURL.replace("300x300", `${size}x${size}`),
    getImageObj = (imgURL = defaultAvatar) => {
        const ret = {};
        SIZES.forEach((s) => {
            ret[s] = urlForSize(imgURL, s);
        });
        return ret;
    },
    dedupe = (a, b) => {
        const ids = b.map((c) => c.id);
        return a.filter((c) => !ids.includes(c.id));
    },
    LANG_START = 0,
    LANG_END = 2,
    REBROADCAST_TYPES = [
        'watch_party', // vodcast launch name
        'permiere', // vodcast started after uploading a video
        'playlist', // pre-vodcast replays
        'vodcast', // raw vodcast
        'rerun' // replay of a past vod
    ];

prefs.get('twitch_clientId').then((id) => {
    headers['Client-ID'] = id;
})
    .catch(console.error);

function getChannelFromJSON(jsonChannel) {
    const ret = new Channel(jsonChannel.name, type);
    ret.uname = jsonChannel.display_name;
    ret.url.push(jsonChannel.url);
    ret.url.push(`https://go.twitch.tv/${jsonChannel.name}`);
    ret.archiveUrl = jsonChannel.url + archiveURL;
    ret.chatUrl = jsonChannel.url + chatURL;
    ret.image = getImageObj(jsonChannel.logo ? jsonChannel.logo : defaultAvatar);
    ret.title = jsonChannel.status;
    ret.category = jsonChannel.game;
    ret.mature = jsonChannel.mature;
    ret.language = jsonChannel.broadcaster_language;

    return ret;
}

function getStreamTypeParam(delim = "&") {
    return Promise.resolve(`${delim}stream_type=live`);
}

class Twitch extends GenericProvider {
    constructor(type) {
        super(type);

        this.authURL = [
            "http://www.twitch.tv",
            "https://secure.twitch.tv",
            "https://passport.twitch.tv"
        ];
        this._supportsFavorites = true;
        this._supportsCredentials = true;
        this._supportsFeatured = true;

        this.initialize();
    }

    get optionalPermissions() {
        return [ "https://tmi.twitch.tv/*" ];
    }

    async getUserFavorites(username) {
        const data = await this._qs.queueRequest(`${baseURL}/users/${username}`, headers);

        if(data.parsedJSON && !data.parsedJSON.error) {
            const channels = await promisedPaginationHelper({
                    url: `${baseURL}/users/${username}/follows/channels?limit=${itemsPerPage}&offset=`,
                    pageSize: itemsPerPage,
                    request: (url) => this._qs.queueRequest(url, headers),
                    fetchNextPage(d) {
                        return d.parsedJSON && "follows" in d.parsedJSON && d.parsedJSON.follows.length == itemsPerPage;
                    },
                    getItems(d) {
                        if(d.parsedJSON && "follows" in d.parsedJSON) {
                            return d.parsedJSON.follows.map((c) => getChannelFromJSON(c.channel));
                        }

                        return [];
                    }
                }),
                user = new User(data.parsedJSON.name, this._type);
            user.uname = data.parsedJSON.display_name;
            user.image = getImageObj(data.parsedJSON.logo ? data.parsedJSON.logo : defaultAvatar);
            user.favorites = channels.map((channel) => channel.login);

            return [
                user,
                channels
            ];
        }

        throw new Error(`Couldn't fetch ${this.name} user ${username}`);
    }
    getChannelDetails(channelname) {
        return this._qs.queueRequest(`${baseURL}/channels/${channelname}`, headers).then((data) => {
            if(data.parsedJSON && !data.parsedJSON.error) {
                idOfChannel.set(data.parsedJSON.name, data.parsedJSON._id);
                return getChannelFromJSON(data.parsedJSON);
            }

            throw new Error(data.parsedJSON ? data.parsedJSON.error : `Could not fetch details for ${this.name} channel ${channelname}`);
        });
    }
    updateFavsRequest() {
        const getURLs = async () => {
            const users = await this._list.getUsers();
            return users.map((user) => `${baseURL}/users/${user.login}`);
        };

        return {
            getURLs,
            headers,
            onComplete: async (data) => {
                if(data.parsedJSON && !data.parsedJSON.error) {
                    const user = await this._list.getUserByName(data.parsedJSON.name),
                        follows = await promisedPaginationHelper({
                            url: `${baseURL}/users/${user.login}/follows/channels?limit=${itemsPerPage}&offset=`,
                            pageSize: itemsPerPage,
                            request: (url) => this._qs.queueRequest(url, headers),
                            fetchNextPage(d) {
                                return d.parsedJSON && "follows" in d.parsedJSON && d.parsedJSON.follows.length == itemsPerPage;
                            },
                            getItems(d) {
                                if(d.parsedJSON && "follows" in d.parsedJSON) {
                                    return d.parsedJSON.follows.map((c) => getChannelFromJSON(c.channel));
                                }

                                return [];
                            }
                        }),
                        newChannels = filterExistingFavs(user, follows);

                    user.uname = data.parsedJSON.display_name;
                    user.image = getImageObj(data.parsedJSON.logo ? data.parsedJSON.logo : defaultAvatar);
                    user.favorites = follows.map((c) => c.login);
                    return [
                        user,
                        newChannels
                    ];
                }
                return [];
            }
        };
    }
    updateRequest() {
        const getURLs = async () => {
            const channels = await this._list.getChannels();
            if(channels.length) {
                const channelsString = channels.map((c) => c.login).join(",");
                return [ `${baseURL}/streams?channel=${channelsString}&stream_type=live&limit=${itemsPerPage}` ];
            }
            return channels;
        };
        return {
            getURLs,
            headers,
            onComplete: async (firstPage, url) => {
                if(firstPage.parsedJSON && "streams" in firstPage.parsedJSON) {
                    const fetchNextPage = (data, pageSize) => data.parsedJSON && "streams" in data.parsedJSON && data.parsedJSON.streams.length == pageSize,
                        oldChans = await this._list.getChannels();
                    let channels = firstPage.parsedJSON.streams;
                    if(fetchNextPage(firstPage, itemsPerPage)) {
                        const otherChannels = await promisedPaginationHelper({
                            url: `${url}&offset=`,
                            pageSize: itemsPerPage,
                            request: (requestUrl) => this._qs.queueRequest(requestUrl, headers),
                            fetchNextPage,
                            getItems: (data) => {
                                if(data.parsedJSON && "streams" in data.parsedJSON) {
                                    return data.parsedJSON.streams;
                                }

                                return [];
                            }
                        });
                        channels = channels.concat(otherChannels);
                    }
                    channels = await Promise.all(channels.map(async (obj) => {
                        const cho = getChannelFromJSON(obj.channel);
                        cho.viewers = obj.viewers;
                        cho.thumbnail = obj.preview.medium;
                        if(REBROADCAST_TYPES.includes(obj.stream_type)) {
                            cho.live = new LiveState(LiveState.REBROADCAST);
                        }
                        else {
                            cho.live.setLive(true);
                        }
                        cho.live.created = Date.parse(obj.created_at);

                        let oldChan;
                        try {
                            oldChan = await this._list.getChannelByName(cho.login);
                        }
                        catch(e) {
                            if(oldChan === undefined) {
                                for(const [
                                    login,
                                    id
                                ] of idOfChannel.entries()) {
                                    if(id == obj.channel._id) {
                                        try {
                                            oldChan = await this._list.getChannelByName(login);
                                            idOfChannel.set(cho.login, obj.channel_id);
                                            idOfChannel.delete(login);
                                            break;
                                        }
                                        catch(err) {
                                            // ignore, no result
                                        }
                                    }
                                }
                            }
                        }
                        if(oldChan !== undefined) {
                            cho.id = oldChan.id;
                        }
                        else {
                            console.warn("Old channel not found for", cho.login);
                        }
                        return cho;
                    }));
                    if(channels.length != oldChans.length) {
                        const offlineChans = dedupe(oldChans, channels),
                            chans = await this._getHostedChannels(offlineChans, channels);
                        return chans.concat(channels);
                    }
                    return channels;
                }
            }
        };
    }
    async updateChannel(channelname, ignoreHosted = false) {
        const typeParam = await getStreamTypeParam("?"),
            data = await this._qs.queueRequest(`${baseURL}/streams/${channelname}${typeParam}`, headers);

        let channel;
        if(data.parsedJSON && data.parsedJSON.stream !== null) {
            idOfChannel.set(data.parsedJSON.stream.channel.name, data.parsedJSON.stream.channel._id);
            channel = getChannelFromJSON(data.parsedJSON.stream.channel);
            channel.viewers = data.parsedJSON.stream.viewers;
            channel.thumbnail = data.parsedJSON.stream.preview.medium;
            if(REBROADCAST_TYPES.includes(data.parsedJSON.stream.stream_type)) {
                channel.live = new LiveState(LiveState.REBROADCAST);
            }
            else {
                channel.live.setLive(true);
            }
            channel.live.created = Date.parse(data.parsedJSON.stream.created_at);
        }
        else {
            channel = await this.getChannelDetails(channelname);
        }

        if((await channel.live.isLive(LiveState.TOWARD_LIVE)) || ignoreHosted) {
            return channel;
        }

        return this._getHostedChannel(channel);
    }
    async updateChannels(channels) {
        const logins = channels.map((c) => c.login),
            channelsString = logins.join(","),
            streamTypeParam = await getStreamTypeParam(),
            liveChannels = await promisedPaginationHelper({
                url: `${baseURL}/streams?channel=${channelsString}${streamTypeParam}&limit=${itemsPerPage}&offset=`,
                pageSize: itemsPerPage,
                request: (url) => this._qs.queueRequest(url, headers),
                fetchNextPage(data) {
                    return data.parsedJSON && !data.parsedJSON.error && data.parsedJSON.streams.length == itemsPerPage;
                },
                getItems(data) {
                    if(data.parsedJSON && !data.parsedJSON.error) {
                        return data.parsedJSON.streams;
                    }

                    return [];
                }
            });

        let cho,
            ret = await Promise.all(liveChannels.map((obj) => {
                cho = getChannelFromJSON(obj.channel);
                cho.viewers = obj.viewers;
                cho.thumbnail = obj.preview.medium;
                if(REBROADCAST_TYPES.includes(obj.stream_type)) {
                    cho.live = new LiveState(LiveState.REBROADCAST);
                }
                else {
                    cho.live.setLive(true);
                }

                cho.live.created = Date.parse(obj.created_at);

                if(logins.includes(cho.login)) {
                    cho.id = channels[logins.indexOf(cho.login)].id;
                    return Promise.resolve(cho);
                }

                return Promise.all(channels.map((c) => this._getChannelId(c))).then((ids) => {
                    ids.some((id, i) => {
                        if(id === obj.channel._id) {
                            cho.id = channels[i].id;
                            return true;
                        }
                        return false;
                    });
                    return cho;
                });
            }));
        if(ret.length != channels.length) {
            const offlineChans = dedupe(channels, ret),
                offChans = await this._getHostedChannels(offlineChans, ret);
            ret = ret.concat(offChans);
        }

        return ret;
    }
    async getFeaturedChannels() {
        const data = await this._qs.queueRequest(`${baseURL}/streams/featured?broadcaster_language=${browser.i18n.getUILanguage().substr(LANG_START, LANG_END)}`, headers);
        if(data.parsedJSON && "featured" in data.parsedJSON && data.parsedJSON.featured.length) {
            let chans = data.parsedJSON.featured;
            if(await not(this._mature())) {
                chans = chans.filter((chan) => !chan.stream.channel.mature);
            }

            return chans.map((chan) => {
                const channel = getChannelFromJSON(chan.stream.channel);
                channel.viewers = chan.stream.viewers;
                channel.thumbnail = chan.stream.preview.medium;
                channel.live.setLive(true);
                channel.live.created = Date.parse(chan.stream.created_at);
                return channel;
            });
        }

        throw new Error(`Could not get any featured channel for ${this.name}`);
    }
    async search(query) {
        const data = await this._qs.queueRequest(`${baseURL}/search/streams?${querystring.stringify({ q: query })}`, headers);
        if(data.parsedJSON && "streams" in data.parsedJSON && data.parsedJSON.streams.length) {
            let chans = data.parsedJSON.streams;
            if(await not(this._mature())) {
                chans = chans.filter((chan) => !chan.channel.mature);
            }

            return chans.map((chan) => {
                const channel = getChannelFromJSON(chan.channel);
                channel.viewers = chan.viewers;
                channel.thumbnail = chan.preview.medium;
                channel.live.setLive(true);
                channel.live.created = Date.parse(chan.created_at);
                return channel;
            });
        }

        throw new Error(`No results for the search ${query} on ${this.name}`);
    }
    _getChannelId(channel) {
        // get the internal id for each channel.
        if(idOfChannel.has(channel.login)) {
            return Promise.resolve(idOfChannel.get(channel.login));
        }

        return this._qs.queueRequest(`${baseURL}/channels/${channel.login}`, headers).then((resp) => {
            if(resp.parsedJSON && "_id" in resp.parsedJSON) {
                idOfChannel.set(channel.login, resp.parsedJSON._id);
                if(channel.login != resp.parsedJSON.name) {
                    idOfChannel.set(resp.parsedJSON.name, resp.parsedJSON._id);
                }
                return resp.parsedJSON._id;
            }

            return null;
        }, () => null);
    }
    async _getHostedChannels(channels, liveChans) {
        if(await prefs.get("twitch_showHosting")) {
            let channelIds = await Promise.all(channels.map((channel) => this._getChannelId(channel)));
            channelIds = channelIds.filter((id) => id !== null);

            const data = await this._qs.queueRequest(`https://tmi.twitch.tv/hosts?${querystring.stringify({
                "include_logins": 1,
                host: channelIds.join(",")
            })}`, headers);

            if(data.parsedJSON && "hosts" in data.parsedJSON && data.parsedJSON.hosts.length) {
                const existingChans = Array.isArray(liveChans) ? channels.concat(liveChans) : channels;
                // Check each hosted channel for his status
                return Promise.all(data.parsedJSON.hosts.map(async (hosting) => {
                    let chan = channels.find((ch) => ch.login === hosting.host_login);
                    if(chan === undefined) {
                        chan = await this.updateChannel(hosting.host_login, true);
                        chan.id = await Promise.all(channels.map((c) => this._getChannelId(c))).then((ids) => {
                            let chid;
                            ids.some((id, i) => {
                                if(id === hosting.host_login) {
                                    chid = channels[i].id;
                                    return true;
                                }
                                return false;
                            });
                            return chid;
                        });
                    }

                    if(hosting.target_login) {
                        // Check the hosted channel's status, since he isn't a channel we already have in our lists.
                        let hostedChannel = existingChans.find((ch) => ch.login === hosting.target_login);
                        if(hostedChannel && !hostedChannel.id) {
                            hostedChannel = null;
                        }
                        if(!hostedChannel) {
                            try {
                                hostedChannel = await this.updateChannel(hosting.target_login, true);
                            }
                            catch(e) {
                                if(chan.live.state !== LiveState.REBROADCAST) {
                                    chan.live.setLive(false);
                                }
                                return chan;
                            }
                        }
                        if(await hostedChannel.live.isLive(LiveState.TOWARD_BROADCASTING)) {
                            if(!hostedChannel.id && await hostedChannel.live.isLive(LiveState.TOWARD_OFFLINE)) {
                                const liveSince = hostedChannel.live.created;
                                hostedChannel.live = new LiveState(LiveState.REDIRECT);
                                hostedChannel.live.created = liveSince;
                            }
                            chan.live.redirectTo(hostedChannel);
                        }
                        else {
                            chan.live.setLive(false);
                        }

                        return chan;
                    }

                    if(chan.live.state != LiveState.REBROADCAST) {
                        chan.live.setLive(false);
                    }

                    return chan;
                }));
            }
        }
        channels.forEach((chan) => {
            if(chan.live.state != LiveState.REBROADCAST) {
                chan.live.setLive(false);
            }
        });
        return channels;
    }
    _getHostedChannel(channel) {
        return this._getHostedChannels([ channel ]).then((chs) => chs.shift());
    }
}

export default Object.freeze(new Twitch(type));
