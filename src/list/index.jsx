import 'file-loader?name=vendor/[name].[ext]!react/dist/react.min.js';
import 'file-loader?name=vendor/[name].[ext]!redux/dist/redux.min.js';
import 'file-loader?name=vendor/[name].[ext]!react-dom/dist/react-dom.min.js';
import 'file-loader?name=vendor/[name].[ext]!react-redux/dist/react-redux.min.js';

import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import reducers from './reducers';
import Popup from './components/popup.jsx';
import Port from '../port';
import ReadChannelList from '../read-channel-list';
import middlewareFactory from './middleware';
import '../content/shared.css';
import './list.css';

// Set up all the state stuff
const port = new Port("list", true),
    store = createStore(reducers, undefined, applyMiddleware(middlewareFactory(port))),
    list = new ReadChannelList();

store.subscribe(() => {
    document.body.className = store.getState().settings.theme;
});

port.send("ready");
list.addEventListener("ready", () => {
    list.getChannelsByType().then((channels) => {
        store.dispatch({
            type: "addChannels",
            payload: channels
        });
    });
}, {
    passive: true,
    once: true,
    capture: false
});
port.addEventListener("message", ({ detail: event }) => {
    if(event.command === "addChannels") {
        Promise.all(event.payload.map((id) => list.getChannel(id))).then((channels) => {
            store.dispatch({
                type: "addChannels",
                payload: channels
            });
        });
    }
    else if(event.command === "updateChannel") {
        list.getChannel(event.payload).then((channel) => {
            store.dispatch({
                type: "updateChannel",
                payload: channel
            });
        });
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

// Actually show something

render(
    <Provider store={ store }>
        <Popup/>
    </Provider>,
    document.getElementById("root")
);