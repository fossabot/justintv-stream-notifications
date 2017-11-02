import 'file-loader?name=vendor/[name].[ext]!react/umd/react.production.min.js';
import 'file-loader?name=vendor/[name].[ext]!redux/dist/redux.min.js';
import 'file-loader?name=vendor/[name].[ext]!react-dom/umd/react-dom.production.min.js';
import 'file-loader?name=vendor/[name].[ext]!react-redux/dist/react-redux.min.js';
import 'file-loader?name=vendor/[name].[ext]!prop-types/prop-types.min.js';
import 'file-loader?name=vendor/react-key-handler.[ext]!react-key-handler/dist/index.js';

import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import reducers from './reducers';
import Popup from './components/popup.jsx';
import Port from '../port';
import ReadChannelList from '../read-channel-list';
import middlewareFactory from './middleware';
import prefs from '../preferences';
import storeTypes from './constants/store-types.json';
import '../content/shared.css';
import './list.css';

const PREFS_MAP = {
        'copy_pattern': storeTypes.SET_COPY_PATTERN,
        theme: storeTypes.SET_THEME,
        'panel_extras': storeTypes.SET_EXTRAS,
        'panel_style': storeTypes.SET_STYLE,
        'show_mature_thumbs': storeTypes.SHOW_MATURE_THUMBS
    },
    prefsKeys = Object.keys(PREFS_MAP),
    // Set up all the state stuff
    port = new Port("list", true),
    store = createStore(reducers, undefined, applyMiddleware(middlewareFactory(port))),
    list = new ReadChannelList();

store.subscribe(() => {
    document.body.className = store.getState().settings.theme;
});

port.send("ready");
Promise.all([
    prefs.get(prefsKeys).then((values) => {
        for(const i in values) {
            store.dispatch({
                type: PREFS_MAP[prefsKeys[i]],
                payload: values[i]
            });
        }
    }),
    list.getChannelsByType().then((channels) => {
        store.dispatch({
            type: storeTypes.ADD_CHANNELS,
            payload: channels
        });
    })
]).catch(console.error);
port.addEventListener("message", ({ detail: event }) => {
    if(event.command === "addChannels") {
        Promise.all(event.payload.map((id) => list.getChannel(id)))
            .then((channels) => {
                store.dispatch({
                    type: storeTypes.ADD_CHANNELS,
                    payload: channels
                });
            })
            .catch(console.error);
    }
    else if(event.command === "updateChannel") {
        list.getChannel(event.payload)
            .then((channel) => {
                store.dispatch({
                    type: storeTypes.UPDATE_CHANNEL,
                    payload: channel
                });
            })
            .catch(console.error);
    }
    else {
        store.dispatch({
            type: event.command,
            payload: event.payload
        });
    }
}, {
    passive: true,
    capture: false
});
prefs.addEventListener("change", ({ detail: {
    pref, value
} }) => {
    if(pref in PREFS_MAP) {
        store.dispatch({
            command: PREFS_MAP[pref],
            payload: value
        });
    }
}, {
    passive: true,
    capture: false
});

document.documentElement.setAttribute("lang", browser.i18n.getUILanguage().replace("_", "-"));

browser.management.get("streamlink.firefox.helper@gmail.com")
    .then(() => {
        store.dispatch({
            type: storeTypes.HAS_STREAMLINK_HELPER,
            payload: true
        });
    })
    .catch(() => {
        store.dispatch({
            type: storeTypes.HAS_STREAMLINK_HELPER,
            payload: false
        });
    });

// Actually show something

render(
    <Provider store={ store }>
        <Popup/>
    </Provider>,
    document.getElementById("root")
);
